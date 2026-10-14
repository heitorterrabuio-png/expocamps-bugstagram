package main

import (
	"fmt"
	"math"
	"sort"
)

type candidatePost struct {
	post             Post
	affinity         float64
	popularity       float64
	recency          float64
	affinityPoints   float64
	popularityPoints float64
	recencyPoints    float64
	rawScore         float64
}

func round2(val float64) float64 {
	return math.Round(val*100.0) / 100.0
}

// compareTieBreaker retorna true se 'a' vence 'b' pelos critérios estritos de desempate:
// Maior Afinidade -> Maior Recência -> Maior Popularidade -> Ordem alfabética do ID.
func compareTieBreaker(a, b candidatePost) bool {
	if math.Abs(a.affinity-b.affinity) > 1e-9 {
		return a.affinity > b.affinity
	}
	if math.Abs(a.recency-b.recency) > 1e-9 {
		return a.recency > b.recency
	}
	if math.Abs(a.popularity-b.popularity) > 1e-9 {
		return a.popularity > b.popularity
	}
	return a.post.ID < b.post.ID
}

// GenerateFeed é uma função pura e determinística que constrói o feed ordenado.
func GenerateFeed(posts []Post, profile UserProfile, consumedIDs map[string]bool) []ScoredPost {
	// 1. Filtro e Cálculo de Pontuação Base
	remaining := make([]candidatePost, 0, len(posts))
	for _, p := range posts {
		if consumedIDs != nil && consumedIDs[p.ID] {
			continue
		}

		popularity := math.Min(100.0, (float64(p.Likes)/600.0)*100.0)
		affinity := profile[p.Category]
		recency := p.RecencyScore

		affPts := 0.60 * affinity
		popPts := 0.25 * popularity
		recPts := 0.15 * recency
		rawScore := affPts + popPts + recPts

		remaining = append(remaining, candidatePost{
			post:             p,
			affinity:         affinity,
			popularity:       popularity,
			recency:          recency,
			affinityPoints:   affPts,
			popularityPoints: popPts,
			recencyPoints:    recPts,
			rawScore:         rawScore,
		})
	}

	result := make([]ScoredPost, 0, len(remaining))

	// 2. Resolução de Slots e Furo de Bolha
	for len(remaining) > 0 {
		slotIndex := len(result)
		isExplorationSlot := (slotIndex+1)%4 == 0 // Índices 3, 7, 11, 15...

		if isExplorationSlot {
			chosenIdx, reason := selectExplorationCandidate(remaining)
			chosen := remaining[chosenIdx]

			result = append(result, ScoredPost{
				Post: chosen.post,
				Metadata: ExplanationMetadata{
					FinalScore: round2(chosen.rawScore),
					Breakdown: ScoreBreakdown{
						AffinityPoints:   round2(chosen.affinityPoints),
						PopularityPoints: round2(chosen.popularityPoints),
						RecencyPoints:    round2(chosen.recencyPoints),
					},
					IsExplorationSlot: true,
					PenaltyApplied:    0.0,
					MatchReason:       reason,
				},
			})

			remaining = removeCandidateAt(remaining, chosenIdx)
			continue
		}

		// Slot Regular com Penalidade de Repetição
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
		reason := fmt.Sprintf(
			"Recomendação padrão para %s (Afinidade %.0f/100).",
			chosen.post.Category,
			chosen.affinity,
		)
		if bestPenalty < 0 {
			reason = fmt.Sprintf(
				"Mantido no topo para %s mesmo após penalidade de repetição (-15 pts).",
				chosen.post.Category,
			)
		}

		result = append(result, ScoredPost{
			Post: chosen.post,
			Metadata: ExplanationMetadata{
				FinalScore: round2(bestEffectiveScore),
				Breakdown: ScoreBreakdown{
					AffinityPoints:   round2(chosen.affinityPoints),
					PopularityPoints: round2(chosen.popularityPoints),
					RecencyPoints:    round2(chosen.recencyPoints),
				},
				IsExplorationSlot: false,
				PenaltyApplied:    bestPenalty,
				MatchReason:       reason,
			},
		})

		remaining = removeCandidateAt(remaining, bestIdx)
	}

	return result
}

// selectExplorationCandidate aplica a regra de Furo de Bolha para os índices múltiplos de 4.
func selectExplorationCandidate(remaining []candidatePost) (int, string) {
	// Filtra candidatos pertencentes a categorias neutras (afinidade entre 40 e 60 inclusive)
	neutralIndices := make([]int, 0)
	for i, cand := range remaining {
		if cand.affinity >= 40.0 && cand.affinity <= 60.0 {
			neutralIndices = append(neutralIndices, i)
		}
	}

	// Caso 1: Existem categorias neutras elegíveis -> Maior soma (Popularidade + Recência)
	if len(neutralIndices) > 0 {
		sort.Slice(neutralIndices, func(i, j int) bool {
			candA := remaining[neutralIndices[i]]
			candB := remaining[neutralIndices[j]]
			sumA := candA.popularity + candA.recency
			sumB := candB.popularity + candB.recency

			if math.Abs(sumA-sumB) > 1e-9 {
				return sumA > sumB
			}
			return compareTieBreaker(candA, candB)
		})

		winnerIdx := neutralIndices[0]
		winner := remaining[winnerIdx]
		reason := fmt.Sprintf(
			"Slot de Exploração: categoria neutra (%s, afinidade %.0f) selecionada por destaque em Popularidade + Recência (%.1f pts).",
			winner.post.Category,
			winner.affinity,
			winner.popularity+winner.recency,
		)
		return winnerIdx, reason
	}

	// Caso 2: Fallback de Bolha Extrema -> Post mais popular da categoria com MENOR score de afinidade
	minAffinity := math.MaxFloat64
	for _, cand := range remaining {
		if cand.affinity < minAffinity {
			minAffinity = cand.affinity
		}
	}

	lowestAffinityIndices := make([]int, 0)
	for i, cand := range remaining {
		if math.Abs(cand.affinity-minAffinity) <= 1e-9 {
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
		winner.affinity,
	)
	return winnerIdx, reason
}

func removeCandidateAt(slice []candidatePost, index int) []candidatePost {
	out := make([]candidatePost, 0, len(slice)-1)
	out = append(out, slice[:index]...)
	out = append(out, slice[index+1:]...)
	return out
}
