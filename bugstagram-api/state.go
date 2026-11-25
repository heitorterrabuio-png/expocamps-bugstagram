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
	mu                  sync.RWMutex
	ID                  string
	Profile             UserProfile
	AuthorAffinity      map[string]float64
	DwellPosts          map[string]bool
	SharedPosts         map[string]bool
	ConsumedIDs         map[string]bool
	PostFatigue         map[string]PostFatigueRecord
	SyncedConsumedCount int
	LastActive          time.Time
}

func newUserSession(id string) *UserSession {
	s := &UserSession{
		ID:             id,
		Profile:        make(UserProfile, len(AllCategories)),
		AuthorAffinity: make(map[string]float64),
		DwellPosts:     make(map[string]bool),
		SharedPosts:    make(map[string]bool),
		ConsumedIDs:    make(map[string]bool),
		PostFatigue:    make(map[string]PostFatigueRecord),
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

func (s *UserSession) copyFatigueLocked() map[string]PostFatigueRecord {
	cp := make(map[string]PostFatigueRecord, len(s.PostFatigue))
	for k, v := range s.PostFatigue {
		cp[k] = v
	}
	return cp
}

func (s *UserSession) effectiveEngagementCountLocked() int {
	if s.SyncedConsumedCount > len(s.ConsumedIDs) {
		return s.SyncedConsumedCount
	}
	return len(s.ConsumedIDs)
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
	fatigue := sess.copyFatigueLocked()
	engagementCount := sess.effectiveEngagementCountLocked()
	sess.mu.RUnlock()

	trendingScores, isTrendingMap := s.globalMetrics.GetAllTrendingScores()
	return GenerateFeedWithOptions(s.catalog, profile, FeedOptions{
		AuthorAffinity:  authorAff,
		DwellPosts:      dwell,
		SharedPosts:     shared,
		ConsumedIDs:     consumed,
		PostFatigue:     fatigue,
		TrendingScores:  trendingScores,
		IsTrendingMap:   isTrendingMap,
		EngagementCount: engagementCount,
		JitterWeight:    DefaultJitterWeight,
	})
}

func (s *AppState) GetProfile(sessionIDs ...string) (UserProfile, int) {
	sess := s.GetOrCreateSession(s.resolveSessionID(sessionIDs...))

	sess.mu.RLock()
	defer sess.mu.RUnlock()

	return sess.copyProfileLocked(), sess.effectiveEngagementCountLocked()
}

func (s *AppState) GetProfileWithFatigue(sessionIDs ...string) (UserProfile, int, map[string]PostFatigueRecord) {
	sess := s.GetOrCreateSession(s.resolveSessionID(sessionIDs...))

	sess.mu.RLock()
	defer sess.mu.RUnlock()

	return sess.copyProfileLocked(), sess.effectiveEngagementCountLocked(), sess.copyFatigueLocked()
}

// SyncSession reidrata uma sessão caso o backend tenha reiniciado e o cliente possua snapshot no localStorage.
func (s *AppState) SyncSession(req SessionSyncRequest, sessionIDs ...string) (UserProfile, int, []ScoredPost) {
	sess := s.GetOrCreateSession(s.resolveSessionID(sessionIDs...))

	sess.mu.Lock()
	// Só aplica snapshot se a sessão do servidor estiver zerada ou com perfil inicial intacto
	if len(sess.ConsumedIDs) == 0 && len(sess.PostFatigue) == 0 && sess.SyncedConsumedCount == 0 {
		for cat, score := range req.Profile {
			if IsValidCategory(cat) {
				sess.Profile[cat] = math.Max(0.0, math.Min(100.0, score))
			}
		}
		for postID, rec := range req.PostFatigue {
			if _, exists := s.postIndex[postID]; exists && rec.Interactions > 0 {
				sess.PostFatigue[postID] = rec
				sess.ConsumedIDs[postID] = true
			}
		}
		if req.ConsumedCount > len(sess.ConsumedIDs) {
			sess.SyncedConsumedCount = req.ConsumedCount
		}
	}
	sess.LastActive = time.Now()

	profileCopy := sess.copyProfileLocked()
	authorCopy := sess.copyAuthorAffinityLocked()
	dwellCopy := sess.copySetLocked(sess.DwellPosts)
	sharedCopy := sess.copySetLocked(sess.SharedPosts)
	consumedCopy := sess.copySetLocked(sess.ConsumedIDs)
	fatigueCopy := sess.copyFatigueLocked()
	engagementCount := sess.effectiveEngagementCountLocked()
	sess.mu.Unlock()

	trendingScores, isTrendingMap := s.globalMetrics.GetAllTrendingScores()
	feed := GenerateFeedWithOptions(s.catalog, profileCopy, FeedOptions{
		AuthorAffinity:  authorCopy,
		DwellPosts:      dwellCopy,
		SharedPosts:     sharedCopy,
		ConsumedIDs:     consumedCopy,
		PostFatigue:     fatigueCopy,
		TrendingScores:  trendingScores,
		IsTrendingMap:   isTrendingMap,
		EngagementCount: engagementCount,
		JitterWeight:    DefaultJitterWeight,
	})
	return profileCopy, engagementCount, feed
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

	// Registra fadiga temporária em vez de exclusão definitiva; eventos passivos não aplicam fadiga
	if !isPassive {
		wasAlreadyConsumed := sess.ConsumedIDs[req.PostID]
		sess.ConsumedIDs[req.PostID] = true
		if sess.SyncedConsumedCount > 0 && !wasAlreadyConsumed {
			sess.SyncedConsumedCount++
		}
		rec := sess.PostFatigue[req.PostID]
		rec.Interactions++
		rec.LastSeenAt = time.Now()
		if actionNormalized == ActionSkip {
			rec.WasSkipped = true
		}
		sess.PostFatigue[req.PostID] = rec
	}
	sess.LastActive = time.Now()

	profileCopy := sess.copyProfileLocked()
	authorCopy := sess.copyAuthorAffinityLocked()
	dwellCopy := sess.copySetLocked(sess.DwellPosts)
	sharedCopy := sess.copySetLocked(sess.SharedPosts)
	consumedCopy := sess.copySetLocked(sess.ConsumedIDs)
	fatigueCopy := sess.copyFatigueLocked()
	engagementCount := sess.effectiveEngagementCountLocked()

	trendingScores, isTrendingMap := s.globalMetrics.GetAllTrendingScores()
	feed := GenerateFeedWithOptions(s.catalog, profileCopy, FeedOptions{
		AuthorAffinity:  authorCopy,
		DwellPosts:      dwellCopy,
		SharedPosts:     sharedCopy,
		ConsumedIDs:     consumedCopy,
		PostFatigue:     fatigueCopy,
		TrendingScores:  trendingScores,
		IsTrendingMap:   isTrendingMap,
		EngagementCount: engagementCount,
		JitterWeight:    DefaultJitterWeight,
	})
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
	sess.PostFatigue = make(map[string]PostFatigueRecord)
	sess.SyncedConsumedCount = 0
	sess.LastActive = time.Now()

	profileCopy := sess.copyProfileLocked()
	trendingScores, isTrendingMap := s.globalMetrics.GetAllTrendingScores()
	feed := GenerateFeedWithOptions(s.catalog, profileCopy, FeedOptions{
		TrendingScores:  trendingScores,
		IsTrendingMap:   isTrendingMap,
		EngagementCount: 0,
		JitterWeight:    DefaultJitterWeight,
	})
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
