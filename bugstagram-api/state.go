package main

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"
)

// UserSession encapsula o estado isolado de simulação de um usuário ou aba do navegador.
type UserSession struct {
	mu             sync.RWMutex
	ID             string
	Profile        UserProfile
	AuthorAffinity map[string]float64
	DwellPosts     map[string]bool
	SharedPosts    map[string]bool
	ConsumedIDs    map[string]bool
	LastActive     time.Time
}

func newUserSession(id string) *UserSession {
	s := &UserSession{
		ID:             id,
		Profile:        make(UserProfile, len(AllCategories)),
		AuthorAffinity: make(map[string]float64),
		DwellPosts:     make(map[string]bool),
		SharedPosts:    make(map[string]bool),
		ConsumedIDs:    make(map[string]bool),
		LastActive:     time.Now(),
	}
	for _, cat := range AllCategories {
		s.Profile[cat] = 50.0
	}
	return s
}

func (s *UserSession) copyProfileLocked() UserProfile {
	cp := make(UserProfile, len(s.Profile))
	for k, v := range s.Profile {
		cp[k] = v
	}
	return cp
}

func (s *UserSession) copyAuthorAffinityLocked() map[string]float64 {
	cp := make(map[string]float64, len(s.AuthorAffinity))
	for k, v := range s.AuthorAffinity {
		cp[k] = v
	}
	return cp
}

func (s *UserSession) copySetLocked(m map[string]bool) map[string]bool {
	cp := make(map[string]bool, len(m))
	for k, v := range m {
		cp[k] = v
	}
	return cp
}

// AppState gerencia as sessões ativas com isolamento concorrente e o catálogo imutável.
type AppState struct {
	mu            sync.RWMutex
	catalog       []Post
	postIndex     map[string]Post
	sessions      map[string]*UserSession
	startTime     time.Time
	globalMetrics *GlobalMetricsManager
}

func NewAppState(catalog []Post) *AppState {
	idx := make(map[string]Post, len(catalog))
	for _, p := range catalog {
		idx[p.ID] = p
	}

	app := &AppState{
		catalog:       catalog,
		postIndex:     idx,
		sessions:      make(map[string]*UserSession),
		startTime:     time.Now(),
		globalMetrics: NewGlobalMetricsManager(catalog),
	}

	// Inicializa a sessão padrão
	app.sessions["default"] = newUserSession("default")
	return app
}

func (s *AppState) resolveSessionID(sessionIDs ...string) string {
	if len(sessionIDs) > 0 && sessionIDs[0] != "" {
		return sessionIDs[0]
	}
	return "default"
}

func (s *AppState) GetOrCreateSession(id string) *UserSession {
	if id == "" {
		id = "default"
	}

	s.mu.RLock()
	sess, exists := s.sessions[id]
	s.mu.RUnlock()
	if exists {
		return sess
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if sess, exists = s.sessions[id]; exists {
		return sess
	}

	sess = newUserSession(id)
	s.sessions[id] = sess
	return sess
}

func (s *AppState) GetFeed(sessionIDs ...string) []ScoredPost {
	sess := s.GetOrCreateSession(s.resolveSessionID(sessionIDs...))

	sess.mu.RLock()
	profile := sess.copyProfileLocked()
	authorAff := sess.copyAuthorAffinityLocked()
	dwell := sess.copySetLocked(sess.DwellPosts)
	shared := sess.copySetLocked(sess.SharedPosts)
	consumed := sess.copySetLocked(sess.ConsumedIDs)
	engagementCount := len(sess.ConsumedIDs)
	sess.mu.RUnlock()

	trendingScores, isTrendingMap := s.globalMetrics.GetAllTrendingScores()
	return GenerateFeedWithContext(
		s.catalog,
		profile,
		authorAff,
		dwell,
		shared,
		consumed,
		trendingScores,
		isTrendingMap,
		engagementCount,
	)
}

func (s *AppState) GetProfile(sessionIDs ...string) (UserProfile, int) {
	sess := s.GetOrCreateSession(s.resolveSessionID(sessionIDs...))

	sess.mu.RLock()
	defer sess.mu.RUnlock()

	return sess.copyProfileLocked(), len(sess.ConsumedIDs)
}

func (s *AppState) Interact(req InteractRequest, sessionIDs ...string) (UserProfile, int, []ScoredPost, error) {
	if req.PostID == "" {
		return nil, 0, nil, errors.New("o campo 'post_id' é obrigatório")
	}

	catalogPost, exists := s.postIndex[req.PostID]
	if !exists {
		return nil, 0, nil, fmt.Errorf("post com ID '%s' não encontrado no catálogo", req.PostID)
	}

	targetCategory := req.Category
	if targetCategory == "" {
		targetCategory = catalogPost.Category
	} else if targetCategory != catalogPost.Category {
		return nil, 0, nil, fmt.Errorf(
			"inconsistência: o post '%s' pertence à categoria '%s', mas foi enviado '%s'",
			req.PostID, catalogPost.Category, targetCategory,
		)
	}

	if !IsValidCategory(targetCategory) {
		return nil, 0, nil, fmt.Errorf("categoria inválida: '%s'", targetCategory)
	}

	// Normaliza a ação para maiúsculo (suporte a "share" e "SHARE", "dwell" e "DWELL", etc.)
	actionNormalized := ActionType(strings.ToUpper(strings.TrimSpace(string(req.Action))))

	var catDelta float64
	var authorDelta float64
	var isPassive bool

	switch actionNormalized {
	case ActionLike:
		catDelta = 5.0
		authorDelta = 8.0
		isPassive = false
	case ActionSave:
		catDelta = 10.0
		authorDelta = 12.0
		isPassive = false
	case ActionShare:
		// Sinal #1 da Meta: Compartilhamento / DM
		catDelta = 15.0
		authorDelta = 12.0
		isPassive = false
	case ActionSkip:
		catDelta = -4.0
		authorDelta = -5.0
		isPassive = false
	case ActionDwell:
		// Sinal Passivo: usuário parou e leu por >= 3s
		catDelta = 2.0
		authorDelta = 1.0
		isPassive = true
	case ActionFastSkip:
		// Sinal Passivo: usuário rolou a tela rapidamente (< 1s)
		catDelta = -1.5
		authorDelta = -1.0
		isPassive = true
	default:
		return nil, 0, nil, fmt.Errorf(
			"ação inválida '%s': use LIKE, SAVE, SHARE, SKIP, DWELL ou FAST_SKIP",
			req.Action,
		)
	}

	// Registra interação no gerenciador de métricas globais coletivas (thread-safe)
	s.globalMetrics.RecordInteraction(req.PostID, actionNormalized, s.catalog)

	sess := s.GetOrCreateSession(s.resolveSessionID(sessionIDs...))

	sess.mu.Lock()
	defer sess.mu.Unlock()

	// Clamping estrito da afinidade temática por categoria (0.0 a 100.0)
	updatedScore := sess.Profile[targetCategory] + catDelta
	sess.Profile[targetCategory] = math.Max(0.0, math.Min(100.0, updatedScore))

	// Sinal de Relacionamento do Instagram (Afinidade com o Criador)
	authorName := catalogPost.Author.Username
	currAuthorScore := 50.0
	if val, ok := sess.AuthorAffinity[authorName]; ok {
		currAuthorScore = val
	}
	sess.AuthorAffinity[authorName] = math.Max(0.0, math.Min(100.0, currAuthorScore+authorDelta))

	// Registra telemetria específica de sinais
	if actionNormalized == ActionShare {
		sess.SharedPosts[req.PostID] = true
	} else if actionNormalized == ActionDwell {
		sess.DwellPosts[req.PostID] = true
	}

	// Eventos ativos consomem o post na simulação interativa; eventos passivos de telemetria não removem o post
	if !isPassive {
		sess.ConsumedIDs[req.PostID] = true
	}
	sess.LastActive = time.Now()

	profileCopy := sess.copyProfileLocked()
	authorCopy := sess.copyAuthorAffinityLocked()
	dwellCopy := sess.copySetLocked(sess.DwellPosts)
	sharedCopy := sess.copySetLocked(sess.SharedPosts)
	consumedCopy := sess.copySetLocked(sess.ConsumedIDs)
	engagementCount := len(consumedCopy)

	trendingScores, isTrendingMap := s.globalMetrics.GetAllTrendingScores()
	feed := GenerateFeedWithContext(
		s.catalog,
		profileCopy,
		authorCopy,
		dwellCopy,
		sharedCopy,
		consumedCopy,
		trendingScores,
		isTrendingMap,
		engagementCount,
	)
	return profileCopy, engagementCount, feed, nil
}

func (s *AppState) Reset(sessionIDs ...string) (UserProfile, int, []ScoredPost) {
	sess := s.GetOrCreateSession(s.resolveSessionID(sessionIDs...))

	sess.mu.Lock()
	defer sess.mu.Unlock()

	sess.Profile = make(UserProfile, len(AllCategories))
	for _, cat := range AllCategories {
		sess.Profile[cat] = 50.0
	}
	sess.AuthorAffinity = make(map[string]float64)
	sess.DwellPosts = make(map[string]bool)
	sess.SharedPosts = make(map[string]bool)
	sess.ConsumedIDs = make(map[string]bool)
	sess.LastActive = time.Now()

	profileCopy := sess.copyProfileLocked()
	trendingScores, isTrendingMap := s.globalMetrics.GetAllTrendingScores()
	feed := GenerateFeedWithContext(
		s.catalog,
		profileCopy,
		nil,
		nil,
		nil,
		sess.ConsumedIDs,
		trendingScores,
		isTrendingMap,
		0,
	)
	return profileCopy, 0, feed
}

func (s *AppState) GetGlobalMetricsSnapshot() GlobalMetricsResponse {
	return GlobalMetricsResponse{
		TopTrending:             s.globalMetrics.GetTopTrending(5),
		TotalSystemInteractions: s.globalMetrics.TotalInteractionsCount(),
		CatalogCount:            len(s.catalog),
	}
}

func (s *AppState) GetGlobalMetricsManager() *GlobalMetricsManager {
	return s.globalMetrics
}

func (s *AppState) ActiveSessionsCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.sessions)
}

func (s *AppState) Uptime() string {
	return time.Since(s.startTime).Truncate(time.Second).String()
}

// CleanupSessions remove sessões inativas há mais de maxIdle (preserva "default").
func (s *AppState) CleanupSessions(maxIdle time.Duration) int {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	removed := 0
	for id, sess := range s.sessions {
		if id == "default" {
			continue
		}
		sess.mu.RLock()
		idle := now.Sub(sess.LastActive)
		sess.mu.RUnlock()

		if idle > maxIdle {
			delete(s.sessions, id)
			removed++
		}
	}
	return removed
}
