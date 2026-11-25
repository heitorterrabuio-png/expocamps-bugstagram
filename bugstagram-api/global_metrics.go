package main

import (
	"math"
	"sort"
	"strings"
	"sync"
	"time"
)

// PostGlobalMetrics agrega as métricas coletivas de interação de todos os usuários para um post.
type PostGlobalMetrics struct {
	PostID            string    `json:"post_id"`
	Category          Category  `json:"category"`
	Title             string    `json:"title"`
	TotalViews        int64     `json:"total_views"`
	TotalLikes        int64     `json:"total_likes"`
	TotalSaves        int64     `json:"total_saves"`
	TotalShares       int64     `json:"total_shares"`
	TotalDwellSeconds float64   `json:"total_dwell_seconds"`
	LastInteractedAt  time.Time `json:"last_interacted_at"`
	RawMomentum       float64   `json:"raw_momentum"`
	TrendingScore     float64   `json:"trending_score"` // Normalizado 0 a 100
	IsTrending        bool      `json:"is_trending"`    // Top 15% na rede global
}

// GlobalMetricsManager gerencia de forma thread-safe as métricas acumuladas em memória.
type GlobalMetricsManager struct {
	mu      sync.RWMutex
	metrics map[string]*PostGlobalMetrics
}

func NewGlobalMetricsManager(catalog []Post) *GlobalMetricsManager {
	mgr := &GlobalMetricsManager{
		metrics: make(map[string]*PostGlobalMetrics, len(catalog)),
	}

	now := time.Now()
	for _, p := range catalog {
		ageHours := GetPostAgeHours(p)
		baseLikes := int64(p.Likes)

		// Inicialização realista com base no catálogo prévio
		mgr.metrics[p.ID] = &PostGlobalMetrics{
			PostID:            p.ID,
			Category:          p.Category,
			Title:             p.Title,
			TotalViews:        baseLikes * 4,
			TotalLikes:        baseLikes,
			TotalSaves:        baseLikes / 12,
			TotalShares:       baseLikes / 25,
			TotalDwellSeconds: float64(baseLikes) * 1.8,
			LastInteractedAt:  now.Add(-time.Duration(ageHours * float64(time.Hour))),
		}
	}

	mgr.RecalculateScores(catalog)
	return mgr
}

// RecordInteraction incrementa os contadores globais com base na ação disparada por qualquer sessão.
func (g *GlobalMetricsManager) RecordInteraction(postID string, action ActionType, catalog []Post) {
	g.mu.Lock()
	defer g.mu.Unlock()

	m, exists := g.metrics[postID]
	if !exists {
		return
	}

	m.TotalViews++
	m.LastInteractedAt = time.Now()

	actUpper := ActionType(strings.ToUpper(strings.TrimSpace(string(action))))
	switch actUpper {
	case ActionLike:
		m.TotalLikes++
	case ActionSave:
		m.TotalSaves++
	case ActionShare:
		m.TotalShares++
	case ActionDwell:
		m.TotalDwellSeconds += 3.0
	case ActionFastSkip:
		// Apenas visualização rápida contabilizada em TotalViews
	}

	g.recalculateLocked(catalog)
}

// RecalculateScores atualiza o momentum e a normalização de 0 a 100 para todos os posts.
func (g *GlobalMetricsManager) RecalculateScores(catalog []Post) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.recalculateLocked(catalog)
}

// recalculateLocked executa o cálculo sob mutex já travado.
// Fórmula: Score_trending = (Likes * 1.0 + Saves * 2.0 + Shares * 3.5 + (DwellSeconds/3) * 0.5) / (DeltaHoras + 2)^1.4
func (g *GlobalMetricsManager) recalculateLocked(catalog []Post) {
	maxMomentum := 0.0

	// 1. Calcula o RawMomentum individual
	for _, p := range catalog {
		m, ok := g.metrics[p.ID]
		if !ok {
			continue
		}

		deltaHoras := GetPostAgeHours(p)
		numerator := float64(m.TotalLikes)*1.0 +
			float64(m.TotalSaves)*2.0 +
			float64(m.TotalShares)*3.5 +
			(m.TotalDwellSeconds/3.0)*0.5

		denominator := math.Pow(deltaHoras+2.0, 1.4)
		momentum := 0.0
		if denominator > 0 {
			momentum = numerator / denominator
		}

		m.RawMomentum = momentum
		if momentum > maxMomentum {
			maxMomentum = momentum
		}
	}

	// 2. Normaliza de 0 a 100 e determina os Top 15%
	type rankItem struct {
		id       string
		momentum float64
	}
	ranked := make([]rankItem, 0, len(g.metrics))

	for id, m := range g.metrics {
		if maxMomentum > 0 {
			m.TrendingScore = math.Max(0.0, math.Min(100.0, (m.RawMomentum/maxMomentum)*100.0))
		} else {
			m.TrendingScore = 50.0
		}
		m.TrendingScore = round2(m.TrendingScore)
		ranked = append(ranked, rankItem{id: id, momentum: m.RawMomentum})
	}

	sort.Slice(ranked, func(i, j int) bool {
		if math.Abs(ranked[i].momentum-ranked[j].momentum) > 1e-9 {
			return ranked[i].momentum > ranked[j].momentum
		}
		return ranked[i].id < ranked[j].id
	})

	// Top 15% dos posts são marcados como "Em Alta na Rede"
	top15Count := int(math.Ceil(float64(len(ranked)) * 0.15))
	if top15Count < 1 && len(ranked) > 0 {
		top15Count = 1
	}

	topSet := make(map[string]bool, top15Count)
	for i := 0; i < top15Count && i < len(ranked); i++ {
		topSet[ranked[i].id] = true
	}

	for id, m := range g.metrics {
		m.IsTrending = topSet[id]
	}
}

func (g *GlobalMetricsManager) GetPostMetrics(postID string) (PostGlobalMetrics, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	m, ok := g.metrics[postID]
	if !ok {
		return PostGlobalMetrics{}, false
	}
	return *m, true
}

func (g *GlobalMetricsManager) GetAllTrendingScores() (map[string]float64, map[string]bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	scores := make(map[string]float64, len(g.metrics))
	isTrending := make(map[string]bool, len(g.metrics))
	for id, m := range g.metrics {
		scores[id] = m.TrendingScore
		isTrending[id] = m.IsTrending
	}
	return scores, isTrending
}

func (g *GlobalMetricsManager) GetTopTrending(limit int) []PostGlobalMetrics {
	g.mu.RLock()
	defer g.mu.RUnlock()

	list := make([]PostGlobalMetrics, 0, len(g.metrics))
	for _, m := range g.metrics {
		list = append(list, *m)
	}

	sort.Slice(list, func(i, j int) bool {
		if math.Abs(list[i].RawMomentum-list[j].RawMomentum) > 1e-9 {
			return list[i].RawMomentum > list[j].RawMomentum
		}
		if list[i].TotalLikes != list[j].TotalLikes {
			return list[i].TotalLikes > list[j].TotalLikes
		}
		return list[i].PostID < list[j].PostID
	})

	if limit > len(list) {
		limit = len(list)
	}
	return list[:limit]
}

func (g *GlobalMetricsManager) TotalInteractionsCount() int64 {
	g.mu.RLock()
	defer g.mu.RUnlock()

	var total int64
	for _, m := range g.metrics {
		total += m.TotalLikes + m.TotalSaves + m.TotalShares
	}
	return total
}
