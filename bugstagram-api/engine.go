package main

import (
	"fmt"
	"math"
	"math/rand/v2"
	"sort"
	"strings"
	"time"
)

// Meia-vida configurada para 12 horas: a cada 12h, a relevância temporal decai pela metade.
const HalfLifeHours = 12.0

// DefaultJitterWeight define a amplitude máxima (em pontos) do ruído estocástico no score.
// Variar entre [0, 3.5] renova a ordenação entre posts semelhantes no F5 sem quebrar a bolha dominante.
const DefaultJitterWeight = 3.5

var LambdaDecay = math.Ln2 / HalfLifeHours

func round2(val float64) float64 {
	return math.Round(val*100.0) / 100.0
}

// CalculateFatigueMultiplier aplica penalidade temporária (fadiga) a posts já interagidos.
// Em vez de deletar o post para sempre, seu score sofre decaimento multiplicativo (~0.30x na 1ª interação)
// caindo para o fim da fila, com recuperação gradual em meia-vida de 30 minutos.
func CalculateFatigueMultiplier(rec PostFatigueRecord, now time.Time) float64 {
	if rec.Interactions <= 0 {
		return 1.0
	}
	elapsedMinutes := math.Max(0.0, now.Sub(rec.LastSeenAt).Minutes())
	effectiveHits := float64(rec.Interactions) * math.Exp(-elapsedMinutes/30.0)
	if rec.WasSkipped {
		effectiveHits *= 1.5
	}
	multiplier := math.Pow(0.30, effectiveHits)
	return math.Max(0.05, math.Min(1.0, multiplier))
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
	post              Post
	categoryAffinity  float64
	creatorAffinity   float64
	freshness         float64
	popularity        float64
	ageHours          float64
	affinityPoints    float64
	creatorPoints     float64
	freshnessPoints   float64
	popularityPoints  float64
	personalScore     float64
	trendingScore     float64
	isTrending        bool
	coldStartFactor   float64
	personalWeight    float64
	fatigueMultiplier float64
	jitterApplied     float64
	rawScore          float64
}

// FeedOptions configura sinais comportamentais, fadiga temporal e amplitude de ruído estocástico (Jitter).
type FeedOptions struct {
	AuthorAffinity  map[string]float64
	DwellPosts      map[string]bool
	SharedPosts     map[string]bool
	ConsumedIDs     map[string]bool
	PostFatigue     map[string]PostFatigueRecord
	TrendingScores  map[string]float64
	IsTrendingMap   map[string]bool
	EngagementCount int
	JitterWeight    float64
	Now             time.Time
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

// GenerateFeed é a interface de compatibilidade clássica (sem ruído estocástico para testes determinísticos de fórmula).
func GenerateFeed(posts []Post, profile UserProfile, consumedIDs map[string]bool) []ScoredPost {
	return GenerateFeedWithOptions(posts, profile, FeedOptions{
		ConsumedIDs:     consumedIDs,
		EngagementCount: len(consumedIDs),
		JitterWeight:    0.0,
	})
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
	return GenerateFeedWithOptions(posts, profile, FeedOptions{
		AuthorAffinity:  authorAffinity,
		DwellPosts:      dwellPosts,
		SharedPosts:     sharedPosts,
		ConsumedIDs:     consumedIDs,
		EngagementCount: len(consumedIDs),
		JitterWeight:    0.0,
	})
}

// GenerateFeedWithContext calcula o ranking unindo o Value Model individual, Momentum Coletivo Global (LERP)
// e ruído estocástico controlado (DefaultJitterWeight) para renovação dinâmica do feed a cada requisição/F5.
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
	return GenerateFeedWithOptions(posts, profile, FeedOptions{
		AuthorAffinity:  authorAffinity,
		DwellPosts:      dwellPosts,
		SharedPosts:     sharedPosts,
		ConsumedIDs:     consumedIDs,
		TrendingScores:  trendingScores,
		IsTrendingMap:   isTrendingMap,
		EngagementCount: engagementCount,
		JitterWeight:    DefaultJitterWeight,
	})
}

// GenerateFeedWithOptions executa o pipeline completo de ranqueamento com Fadiga (Decay),
// LERP de Cold Start, Jitter Estocástico via sort.Slice e Slots de Furo de Bolha.
func GenerateFeedWithOptions(posts []Post, profile UserProfile, opts FeedOptions) []ScoredPost {
	now := opts.Now
	if now.IsZero() {
		now = time.Now()
	}

	var coldStartFactor, personalWeight float64
	if opts.TrendingScores != nil {
		coldStartFactor, personalWeight = CalculateColdStartWeights(opts.EngagementCount)
	} else {
		coldStartFactor = 0.0
		personalWeight = 1.0
	}

	// 1. Scoring Multi-Sinal + Fadiga Temporária (Decay) + Jitter Estocástico
	// Nenhum post é excluído sumariamente: posts já vistos sofrem fadiga e caem para o fim da fila.
	remaining := make([]candidatePost, 0, len(posts))
	for _, p := range posts {
		catAff := profile[p.Category]
		authAff := 50.0
		if opts.AuthorAffinity != nil {
			if v, ok := opts.AuthorAffinity[p.Author.Username]; ok {
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
		if opts.TrendingScores != nil {
			if v, ok := opts.TrendingScores[p.ID]; ok {
				tScore = v
			}
		}

		trendingFlag := false
		if opts.IsTrendingMap != nil {
			trendingFlag = opts.IsTrendingMap[p.ID]
		}

		// LERP Cold Start: transição suave entre Consenso Coletivo e Bolha Pessoal
		baseScore := (personalScore * personalWeight) + (tScore * coldStartFactor)

		// Fadiga Temporária (Decay): posts já interagidos recebem multiplicador < 1.0
		var fatigueRec PostFatigueRecord
		if opts.PostFatigue != nil {
			if rec, ok := opts.PostFatigue[p.ID]; ok {
				fatigueRec = rec
			}
		} else if opts.ConsumedIDs != nil && opts.ConsumedIDs[p.ID] {
			fatigueRec = PostFatigueRecord{Interactions: 1, LastSeenAt: now}
		}
		fatigueMult := CalculateFatigueMultiplier(fatigueRec, now)

		// Ruído Estocástico Controlado (Jitter) sobre o score fatigado
		jitter := 0.0
		if opts.JitterWeight > 0 {
			jitter = rand.Float64() * opts.JitterWeight
		}
		rawScore := (baseScore * fatigueMult) + jitter

		postCopy := p
		postCopy.RecencyScore = round2(freshness)
		postCopy.AgeHours = round2(ageHours)

		remaining = append(remaining, candidatePost{
			post:              postCopy,
			categoryAffinity:  catAff,
			creatorAffinity:   authAff,
			freshness:         freshness,
			popularity:        popularity,
			ageHours:          ageHours,
			affinityPoints:    affPts,
			creatorPoints:     authPts,
			freshnessPoints:   freshPts,
			popularityPoints:  popPts,
			personalScore:     personalScore,
			trendingScore:     tScore,
			isTrending:        trendingFlag,
			coldStartFactor:   coldStartFactor,
			personalWeight:    personalWeight,
			fatigueMultiplier: fatigueMult,
			jitterApplied:     jitter,
			rawScore:          rawScore,
		})
	}

	// Ordenação base com ruído estocástico (Score * Fadiga + Jitter) via sort.Slice
	sort.Slice(remaining, func(i, j int) bool {
		if math.Abs(remaining[i].rawScore-remaining[j].rawScore) > 1e-9 {
			return remaining[i].rawScore > remaining[j].rawScore
		}
		return compareTieBreaker(remaining[i], remaining[j])
	})

	result := make([]ScoredPost, 0, len(remaining))

	// 2. Resolução de Slots com Furo de Bolha e Penalidade de Repetição Consecutiva
	for len(remaining) > 0 {
		slotIndex := len(result)
		isExplorationSlot := (slotIndex+1)%4 == 0 // Índices 3, 7, 11, 15...

		if isExplorationSlot {
			chosenIdx, reason := selectExplorationCandidate(remaining)
			chosen := remaining[chosenIdx]

			hasDwell := opts.DwellPosts != nil && opts.DwellPosts[chosen.post.ID]
			hasShare := opts.SharedPosts != nil && opts.SharedPosts[chosen.post.ID]

			if chosen.fatigueMultiplier < 0.99 {
				reason = fmt.Sprintf("%s [Fadiga %.2fx]", reason, chosen.fatigueMultiplier)
			}

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
					FatigueMultiplier: round2(chosen.fatigueMultiplier),
					JitterApplied:     round2(chosen.jitterApplied),
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

		hasDwell := opts.DwellPosts != nil && opts.DwellPosts[chosen.post.ID]
		hasShare := opts.SharedPosts != nil && opts.SharedPosts[chosen.post.ID]

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

		if chosen.fatigueMultiplier < 0.99 {
			reason = fmt.Sprintf("%s [Fadiga %.2fx por visualização recente]", reason, chosen.fatigueMultiplier)
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
				FatigueMultiplier: round2(chosen.fatigueMultiplier),
				JitterApplied:     round2(chosen.jitterApplied),
			},
		})

		remaining = removeCandidateAt(remaining, bestIdx)
	}

	return result
}

// selectExplorationCandidate aplica a regra de Furo de Bolha para os slots de descoberta,
// priorizando candidatos sem fadiga e incorporando o ruído estocástico controlado.
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

	// Caso 1: Existem categorias neutras elegíveis -> Maior soma (Popularidade + Freshness) * Fadiga + Jitter
	if len(neutralIndices) > 0 {
		sort.Slice(neutralIndices, func(i, j int) bool {
			candA := remaining[neutralIndices[i]]
			candB := remaining[neutralIndices[j]]
			sumA := (candA.popularity+candA.freshness)*candA.fatigueMultiplier + candA.jitterApplied
			sumB := (candB.popularity+candB.freshness)*candB.fatigueMultiplier + candB.jitterApplied

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

		scoreA := candA.popularity*candA.fatigueMultiplier + candA.jitterApplied
		scoreB := candB.popularity*candB.fatigueMultiplier + candB.jitterApplied
		if math.Abs(scoreA-scoreB) > 1e-9 {
			return scoreA > scoreB
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
