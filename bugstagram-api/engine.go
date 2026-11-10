package main

import (
	"fmt"
	"math"
	"sort"
	"strings"
)

// Meia-vida configurada para 12 horas: a cada 12h, a relevância temporal decai pela metade.
const HalfLifeHours = 12.0

var LambdaDecay = math.Ln2 / HalfLifeHours

func round2(val float64) float64 {
	return math.Round(val*100.0) / 100.0
}

// CalculateFreshness calcula a relevância temporal usando decaimento exponencial de meia-vida.
// Freshness = 100 * exp(-lambda * delta_hours)
func CalculateFreshness(ageHours float64) float64 {
	if ageHours < 0 {
		ageHours = 0
	}
	freshness := 100.0 * math.Exp(-LambdaDecay*ageHours)
	return math.Max(0.0, math.Min(100.0, freshness))
}

// GetPostAgeHours recupera ou calcula as horas decorridas desde a publicação.
func GetPostAgeHours(p Post) float64 {
	if p.AgeHours > 0 {
		return p.AgeHours
	}
	if p.RecencyScore > 0 {
		clamped := math.Max(1.0, math.Min(100.0, p.RecencyScore))
		return -math.Log(clamped/100.0) / LambdaDecay
	}
	return 0.0
}

// CalculateColdStartWeights calcula o balanço entre Trending Global e Value Model Pessoal
// de acordo com a contagem de interações ativas do usuário na sessão.
// Sessão fria (< 3 engajamentos): peso majoritário (70%+) no Trending Coletivo.
// Conforme o usuário interage, a afinidade pessoal passa a dominar via LERP até 100%.
func CalculateColdStartWeights(engagementCount int) (coldStartFactor float64, personalWeight float64) {
	switch {
	case engagementCount <= 0:
		coldStartFactor = 0.80
	case engagementCount == 1:
		coldStartFactor = 0.75
	case engagementCount == 2:
		coldStartFactor = 0.70
	case engagementCount == 3:
		coldStartFactor = 0.40
	case engagementCount == 4:
		coldStartFactor = 0.20
	default:
		coldStartFactor = 0.00
	}
	personalWeight = round2(1.0 - coldStartFactor)
	coldStartFactor = round2(coldStartFactor)
	return
}

type candidatePost struct {
	post             Post
	categoryAffinity float64
	creatorAffinity  float64
	freshness        float64
	popularity       float64
	ageHours         float64
	affinityPoints   float64
	creatorPoints    float64
	freshnessPoints  float64
	popularityPoints float64
	personalScore    float64
	trendingScore    float64
	isTrending       bool
	coldStartFactor  float64
	personalWeight   float64
	rawScore         float64
}

// compareTieBreaker resolve empates por ordem hierárquica estrita:
// Maior Afinidade Tema -> Maior Afinidade Criador -> Maior Freshness -> Maior Popularidade -> ID do post.
func compareTieBreaker(a, b candidatePost) bool {
	if math.Abs(a.categoryAffinity-b.categoryAffinity) > 1e-9 {
		return a.categoryAffinity > b.categoryAffinity
	}
	if math.Abs(a.creatorAffinity-b.creatorAffinity) > 1e-9 {
		return a.creatorAffinity > b.creatorAffinity
	}
	if math.Abs(a.freshness-b.freshness) > 1e-9 {
		return a.freshness > b.freshness
	}
	if math.Abs(a.popularity-b.popularity) > 1e-9 {
		return a.popularity > b.popularity
	}
	return a.post.ID < b.post.ID
}

// GenerateFeed é a interface de compatibilidade clássica.
func GenerateFeed(posts []Post, profile UserProfile, consumedIDs map[string]bool) []ScoredPost {
	return GenerateFeedWithContext(posts, profile, nil, nil, nil, consumedIDs, nil, nil, len(consumedIDs))
}

// GenerateFeedWithSignals constrói o feed ordenado utilizando o Value Model comportamental do Instagram:
// Score = (Afinidade_Tema * 0.45) + (Afinidade_Criador * 0.20) + (Freshness * 0.20) + (Popularidade * 0.15)
func GenerateFeedWithSignals(
	posts []Post,
	profile UserProfile,
	authorAffinity map[string]float64,
	dwellPosts map[string]bool,
	sharedPosts map[string]bool,
	consumedIDs map[string]bool,
) []ScoredPost {
	return GenerateFeedWithContext(posts, profile, authorAffinity, dwellPosts, sharedPosts, consumedIDs, nil, nil, len(consumedIDs))
}

// GenerateFeedWithContext calcula o ranking unindo o Value Model individual ao Momentum Coletivo Global
// através de interpolação linear (LERP) de Cold Start vs. Bolha Personalizada.
func GenerateFeedWithContext(
	posts []Post,
	profile UserProfile,
	authorAffinity map[string]float64,
	dwellPosts map[string]bool,
	sharedPosts map[string]bool,
	consumedIDs map[string]bool,
	trendingScores map[string]float64,
	isTrendingMap map[string]bool,
	engagementCount int,
) []ScoredPost {
	var coldStartFactor, personalWeight float64
	if trendingScores != nil {
		coldStartFactor, personalWeight = CalculateColdStartWeights(engagementCount)
	} else {
		coldStartFactor = 0.0
		personalWeight = 1.0
	}

	// 1. Filtro e Cálculo do Value Model Multi-Sinal integrado ao Trending Global
	remaining := make([]candidatePost, 0, len(posts))
	for _, p := range posts {
		if consumedIDs != nil && consumedIDs[p.ID] {
			continue
		}

		catAff := profile[p.Category]
		authAff := 50.0
		if authorAffinity != nil {
			if v, ok := authorAffinity[p.Author.Username]; ok {
				authAff = v
			}
		}

		ageHours := GetPostAgeHours(p)
		freshness := CalculateFreshness(ageHours)
		popularity := math.Min(100.0, (float64(p.Likes)/600.0)*100.0)

		// Pesos calibrados do Value Model pessoal:
		// 45% Tema + 20% Criador + 20% Freshness Exponencial + 15% Popularidade
		affPts := 0.45 * catAff
		authPts := 0.20 * authAff
		freshPts := 0.20 * freshness
		popPts := 0.15 * popularity
		personalScore := affPts + authPts + freshPts + popPts

		// Score Global de Momentum / Trending
		tScore := 50.0
		if trendingScores != nil {
			if v, ok := trendingScores[p.ID]; ok {
				tScore = v
			}
		}

		trendingFlag := false
		if isTrendingMap != nil {
			trendingFlag = isTrendingMap[p.ID]
		}

		// LERP Cold Start: transição suave entre Consenso Coletivo e Bolha Pessoal
		rawScore := (personalScore * personalWeight) + (tScore * coldStartFactor)

		postCopy := p
		postCopy.RecencyScore = round2(freshness)
		postCopy.AgeHours = round2(ageHours)

		remaining = append(remaining, candidatePost{
			post:             postCopy,
			categoryAffinity: catAff,
			creatorAffinity:  authAff,
			freshness:        freshness,
			popularity:       popularity,
			ageHours:         ageHours,
			affinityPoints:   affPts,
			creatorPoints:    authPts,
			freshnessPoints:  freshPts,
			popularityPoints: popPts,
			personalScore:    personalScore,
			trendingScore:    tScore,
			isTrending:       trendingFlag,
			coldStartFactor:  coldStartFactor,
			personalWeight:   personalWeight,
			rawScore:         rawScore,
		})
	}

	result := make([]ScoredPost, 0, len(remaining))

	// 2. Resolução de Slots com Furo de Bolha e Penalidade de Repetição
	for len(remaining) > 0 {
		slotIndex := len(result)
		isExplorationSlot := (slotIndex+1)%4 == 0 // Índices 3, 7, 11, 15...

		if isExplorationSlot {
			chosenIdx, reason := selectExplorationCandidate(remaining)
			chosen := remaining[chosenIdx]

			hasDwell := dwellPosts != nil && dwellPosts[chosen.post.ID]
			hasShare := sharedPosts != nil && sharedPosts[chosen.post.ID]

			result = append(result, ScoredPost{
				Post: chosen.post,
				Metadata: ExplanationMetadata{
					FinalScore: round2(chosen.rawScore),
					Breakdown: ScoreBreakdown{
						AffinityPoints:   round2(chosen.affinityPoints),
						CreatorPoints:    round2(chosen.creatorPoints),
						FreshnessPoints:  round2(chosen.freshnessPoints),
						PopularityPoints: round2(chosen.popularityPoints),
						RecencyPoints:    round2(chosen.freshnessPoints),
					},
					IsExplorationSlot: true,
					PenaltyApplied:    0.0,
					MatchReason:       reason,
					HasDwell:          hasDwell,
					HasShare:          hasShare,
					AgeHours:          round2(chosen.ageHours),
					TrendingScore:     round2(chosen.trendingScore),
					IsTrending:        chosen.isTrending,
					ColdStartFactor:   round2(chosen.coldStartFactor),
					PersonalWeight:    round2(chosen.personalWeight),
				},
			})

			remaining = removeCandidateAt(remaining, chosenIdx)
			continue
		}

		// Slot Regular com Penalidade de Repetição Consecutiva de Categoria
		var prevCategory Category
		hasPrev := slotIndex > 0
		if hasPrev {
			prevCategory = result[slotIndex-1].Category
		}

		bestIdx := 0
		bestEffectiveScore := -math.MaxFloat64
		bestPenalty := 0.0

		for i, cand := range remaining {
			penalty := 0.0
			if hasPrev && cand.post.Category == prevCategory {
				penalty = -15.0
			}
			effectiveScore := cand.rawScore + penalty

			if i == 0 {
				bestIdx = 0
				bestEffectiveScore = effectiveScore
				bestPenalty = penalty
				continue
			}

			if math.Abs(effectiveScore-bestEffectiveScore) > 1e-9 {
				if effectiveScore > bestEffectiveScore {
					bestIdx = i
					bestEffectiveScore = effectiveScore
					bestPenalty = penalty
				}
			} else if compareTieBreaker(cand, remaining[bestIdx]) {
				bestIdx = i
				bestEffectiveScore = effectiveScore
				bestPenalty = penalty
			}
		}

		chosen := remaining[bestIdx]

		hasDwell := dwellPosts != nil && dwellPosts[chosen.post.ID]
		hasShare := sharedPosts != nil && sharedPosts[chosen.post.ID]

		var signals []string
		if hasShare {
			signals = append(signals, "Share (+15)")
		}
		if hasDwell {
			signals = append(signals, "Dwell Time recente")
		}
		if chosen.creatorAffinity > 55.0 {
			signals = append(signals, fmt.Sprintf("Criador @%s (%.0f pts)", chosen.post.Author.Username, chosen.creatorAffinity))
		}

		var reason string
		if chosen.coldStartFactor >= 0.70 {
			reason = fmt.Sprintf("Recomendado por Trending Coletivo (Score Global: %.1f) [Cold Start]", chosen.trendingScore)
			if bestPenalty < 0 {
				reason = fmt.Sprintf("Mantido no topo para %s mesmo com penalidade de repetição (-15 pts) [Cold Start: Trending %.1f].", chosen.post.Category, chosen.trendingScore)
			}
		} else {
			if len(signals) > 0 {
				reason = fmt.Sprintf(
					"Impulsionado por %s em %s (Tema %.0f, Freshness %.0f%%).",
					strings.Join(signals, " e "),
					chosen.post.Category,
					chosen.categoryAffinity,
					chosen.freshness,
				)
			} else {
				reason = fmt.Sprintf(
					"Recomendação padrão para %s (Tema 45%%: %.1f, Criador 20%%: %.1f, Freshness 20%%: %.1f, Pop 15%%: %.1f).",
					chosen.post.Category,
					chosen.affinityPoints,
					chosen.creatorPoints,
					chosen.freshnessPoints,
					chosen.popularityPoints,
				)
			}

			if bestPenalty < 0 {
				reason = fmt.Sprintf(
					"Mantido no topo para %s mesmo após penalidade de repetição (-15 pts).",
					chosen.post.Category,
				)
			}
		}

		result = append(result, ScoredPost{
			Post: chosen.post,
			Metadata: ExplanationMetadata{
				FinalScore: round2(bestEffectiveScore),
				Breakdown: ScoreBreakdown{
					AffinityPoints:   round2(chosen.affinityPoints),
					CreatorPoints:    round2(chosen.creatorPoints),
					FreshnessPoints:  round2(chosen.freshnessPoints),
					PopularityPoints: round2(chosen.popularityPoints),
					RecencyPoints:    round2(chosen.freshnessPoints),
				},
				IsExplorationSlot: false,
				PenaltyApplied:    bestPenalty,
				MatchReason:       reason,
				HasDwell:          hasDwell,
				HasShare:          hasShare,
				AgeHours:          round2(chosen.ageHours),
				TrendingScore:     round2(chosen.trendingScore),
				IsTrending:        chosen.isTrending,
				ColdStartFactor:   round2(chosen.coldStartFactor),
				PersonalWeight:    round2(chosen.personalWeight),
			},
		})

		remaining = removeCandidateAt(remaining, bestIdx)
	}

	return result
}

// selectExplorationCandidate aplica a regra de Furo de Bolha para os slots de descoberta.
func selectExplorationCandidate(remaining []candidatePost) (int, string) {
	if len(remaining) == 0 {
		return 0, ""
	}

	// Filtra candidatos pertencentes a categorias neutras (afinidade temática entre 40 e 60)
	neutralIndices := make([]int, 0, len(remaining))
	for i, cand := range remaining {
		if cand.categoryAffinity >= 40.0 && cand.categoryAffinity <= 60.0 {
			neutralIndices = append(neutralIndices, i)
		}
	}

	// Caso 1: Existem categorias neutras elegíveis -> Maior soma (Popularidade + Freshness)
	if len(neutralIndices) > 0 {
		sort.Slice(neutralIndices, func(i, j int) bool {
			candA := remaining[neutralIndices[i]]
			candB := remaining[neutralIndices[j]]
			sumA := candA.popularity + candA.freshness
			sumB := candB.popularity + candB.freshness

			if math.Abs(sumA-sumB) > 1e-9 {
				return sumA > sumB
			}
			return compareTieBreaker(candA, candB)
		})

		winnerIdx := neutralIndices[0]
		winner := remaining[winnerIdx]
		reason := fmt.Sprintf(
			"Slot de Exploração: categoria neutra (%s, afinidade %.0f) selecionada por destaque em Popularidade + Freshness (%.1f pts).",
			winner.post.Category,
			winner.categoryAffinity,
			winner.popularity+winner.freshness,
		)
		return winnerIdx, reason
	}

	// Caso 2: Fallback de Bolha Extrema -> Post mais popular da categoria com MENOR score de afinidade
	minAffinity := math.MaxFloat64
	for _, cand := range remaining {
		if cand.categoryAffinity < minAffinity {
			minAffinity = cand.categoryAffinity
		}
	}

	lowestAffinityIndices := make([]int, 0, len(remaining))
	for i, cand := range remaining {
		if math.Abs(cand.categoryAffinity-minAffinity) <= 1e-9 {
			lowestAffinityIndices = append(lowestAffinityIndices, i)
		}
	}

	sort.Slice(lowestAffinityIndices, func(i, j int) bool {
		candA := remaining[lowestAffinityIndices[i]]
		candB := remaining[lowestAffinityIndices[j]]

		if math.Abs(candA.popularity-candB.popularity) > 1e-9 {
			return candA.popularity > candB.popularity
		}
		return compareTieBreaker(candA, candB)
	})

	winnerIdx := lowestAffinityIndices[0]
	winner := remaining[winnerIdx]
	reason := fmt.Sprintf(
		"Furo de Bolha Extrema: sem categorias neutras disponíveis; selecionado o post mais popular da categoria de menor afinidade (%s, afinidade %.0f).",
		winner.post.Category,
		winner.categoryAffinity,
	)
	return winnerIdx, reason
}

// removeCandidateAt remove o elemento no índice especificado sem alocações desnecessárias.
func removeCandidateAt(slice []candidatePost, index int) []candidatePost {
	if index < 0 || index >= len(slice) {
		return slice
	}
	return append(slice[:index], slice[index+1:]...)
}
