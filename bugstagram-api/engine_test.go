package main

import (
	"math"
	"strings"
	"testing"
)

func sampleTestCatalog() []Post {
	return []Post{
		{
			ID:           "tech-1",
			Category:     CatTecnologia,
			Title:        "Tech 1",
			Author:       Author{Username: "ant_dev", DisplayName: "Ant Dev"},
			Likes:        600,
			RecencyScore: 100.0,
			AgeHours:     0.0,
		},
		{
			ID:           "tech-2",
			Category:     CatTecnologia,
			Title:        "Tech 2",
			Author:       Author{Username: "ant_dev", DisplayName: "Ant Dev"},
			Likes:        300,
			RecencyScore: 50.0,
			AgeHours:     12.0,
		},
		{
			ID:           "cine-1",
			Category:     CatCinema,
			Title:        "Cine 1",
			Author:       Author{Username: "spider_cine", DisplayName: "Spider Cine"},
			Likes:        500,
			RecencyScore: 90.0,
			AgeHours:     1.8,
		},
		{
			ID:           "cul-1",
			Category:     CatCulinaria,
			Title:        "Cul 1",
			Author:       Author{Username: "bee_chef", DisplayName: "Bee Chef"},
			Likes:        400,
			RecencyScore: 80.0,
			AgeHours:     3.9,
		},
		{
			ID:           "game-1",
			Category:     CatGames,
			Title:        "Game 1",
			Author:       Author{Username: "cricket_gamer", DisplayName: "Cricket Gamer"},
			Likes:        550,
			RecencyScore: 95.0,
			AgeHours:     0.9,
		},
		{
			ID:           "anim-1",
			Category:     CatAnimais,
			Title:        "Anim 1",
			Author:       Author{Username: "beetle_fauna", DisplayName: "Beetle Fauna"},
			Likes:        200,
			RecencyScore: 40.0,
			AgeHours:     16.0,
		},
	}
}

func defaultTestProfile() UserProfile {
	p := make(UserProfile)
	for _, c := range AllCategories {
		p[c] = 50.0
	}
	return p
}

func TestCalculateFreshness_HalfLife12Hours(t *testing.T) {
	// Meia-vida de 12 horas estrita:
	// 0h -> 100.0
	// 12h -> 50.0
	// 24h -> 25.0
	// 36h -> 12.5
	// 48h -> 6.25

	tests := []struct {
		name     string
		ageHours float64
		expected float64
	}{
		{"Agora mesmo (0h)", 0.0, 100.0},
		{"Meia-vida exata (12h)", 12.0, 50.0},
		{"Duas meias-vidas (24h)", 24.0, 25.0},
		{"Três meias-vidas (36h)", 36.0, 12.5},
		{"Quatro meias-vidas (48h)", 48.0, 6.25},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateFreshness(tt.ageHours)
			if math.Abs(got-tt.expected) > 0.05 {
				t.Errorf("para ageHours=%.1f, esperado %.2f, obteve %.2f", tt.ageHours, tt.expected, got)
			}
		})
	}
}

func TestValueModel_ScoreBreakdown(t *testing.T) {
	post := Post{
		ID:           "test-post",
		Category:     CatTecnologia,
		Author:       Author{Username: "dev_ant"},
		Likes:        600, // Popularidade = 100.0
		RecencyScore: 100.0,
		AgeHours:     12.0, // Freshness = 50.0
	}

	profile := defaultTestProfile() // Afinidade tema = 50.0
	authorAff := map[string]float64{"dev_ant": 80.0}

	feed := GenerateFeedWithSignals([]Post{post}, profile, authorAff, nil, nil, nil)
	if len(feed) != 1 {
		t.Fatalf("esperava 1 post no feed, obteve %d", len(feed))
	}

	scored := feed[0]
	// Score = (Tema 50 * 0.45 = 22.5) + (Criador 80 * 0.20 = 16.0) + (Freshness 50 * 0.20 = 10.0) + (Pop 100 * 0.15 = 15.0) = 63.5
	expectedScore := 63.5
	if math.Abs(scored.Metadata.FinalScore-expectedScore) > 0.1 {
		t.Errorf("Score esperado %.2f, obteve %.2f", expectedScore, scored.Metadata.FinalScore)
	}

	if scored.Metadata.Breakdown.AffinityPoints != 22.5 {
		t.Errorf("AffinityPoints esperado 22.5, obteve %.2f", scored.Metadata.Breakdown.AffinityPoints)
	}
	if scored.Metadata.Breakdown.CreatorPoints != 16.0 {
		t.Errorf("CreatorPoints esperado 16.0, obteve %.2f", scored.Metadata.Breakdown.CreatorPoints)
	}
	if scored.Metadata.Breakdown.FreshnessPoints != 10.0 {
		t.Errorf("FreshnessPoints esperado 10.0, obteve %.2f", scored.Metadata.Breakdown.FreshnessPoints)
	}
	if scored.Metadata.Breakdown.PopularityPoints != 15.0 {
		t.Errorf("PopularityPoints esperado 15.0, obteve %.2f", scored.Metadata.Breakdown.PopularityPoints)
	}
}

func TestGenerateFeed_Deterministic(t *testing.T) {
	catalog := sampleTestCatalog()
	profile := defaultTestProfile()

	feed1 := GenerateFeed(catalog, profile, nil)
	feed2 := GenerateFeed(catalog, profile, nil)

	if len(feed1) != len(feed2) {
		t.Fatalf("esperado mesmo tamanho de feed, obteve %d e %d", len(feed1), len(feed2))
	}

	for i := range feed1 {
		if feed1[i].ID != feed2[i].ID {
			t.Errorf("na posição %d: post ID %s != %s", i, feed1[i].ID, feed2[i].ID)
		}
		if feed1[i].Metadata.FinalScore != feed2[i].Metadata.FinalScore {
			t.Errorf("na posição %d: score %f != %f", i, feed1[i].Metadata.FinalScore, feed2[i].Metadata.FinalScore)
		}
	}
}

func TestGenerateFeed_ExplorationSlots(t *testing.T) {
	catalog := sampleTestCatalog()
	profile := defaultTestProfile()

	feed := GenerateFeed(catalog, profile, nil)

	for i, post := range feed {
		isExploration := (i+1)%4 == 0
		if post.Metadata.IsExplorationSlot != isExploration {
			t.Errorf("posição %d: esperado isExplorationSlot=%v, obteve %v", i, isExploration, post.Metadata.IsExplorationSlot)
		}
	}
}

func TestGenerateFeed_ConsumedFilter(t *testing.T) {
	catalog := sampleTestCatalog()
	profile := defaultTestProfile()

	consumed := map[string]bool{
		"tech-1": true,
		"cine-1": true,
	}

	feed := GenerateFeed(catalog, profile, consumed)

	for _, post := range feed {
		if consumed[post.ID] {
			t.Errorf("post consumido '%s' foi retornado no feed", post.ID)
		}
	}
}

func TestGenerateFeed_CreatorAffinitySignal(t *testing.T) {
	// Usamos categorias diferentes para evitar a penalidade de repetição consecutiva (-15)
	catalog := []Post{
		{
			ID:           "tech-1",
			Category:     CatTecnologia,
			Author:       Author{Username: "creator_a"},
			Likes:        300,
			RecencyScore: 50.0,
			AgeHours:     12.0,
		},
		{
			ID:           "game-1",
			Category:     CatGames,
			Author:       Author{Username: "creator_b"},
			Likes:        300,
			RecencyScore: 50.0,
			AgeHours:     12.0,
		},
	}

	profile := defaultTestProfile()

	// Sem sinal de criador: ambos têm mesmo score
	feedNeutral := GenerateFeedWithSignals(catalog, profile, nil, nil, nil, nil)
	if feedNeutral[0].Metadata.FinalScore != feedNeutral[1].Metadata.FinalScore {
		t.Errorf("esperado empate sem sinal de criador, obteve %f e %f",
			feedNeutral[0].Metadata.FinalScore, feedNeutral[1].Metadata.FinalScore)
	}

	// Com bônus de criador para creator_b
	authorAff := map[string]float64{
		"creator_b": 90.0,
	}
	feedBoosted := GenerateFeedWithSignals(catalog, profile, authorAff, nil, nil, nil)
	if feedBoosted[0].ID != "game-1" {
		t.Fatalf("esperado game-1 no topo com bônus de criador, obteve %s", feedBoosted[0].ID)
	}
	if feedBoosted[0].Metadata.FinalScore <= feedBoosted[1].Metadata.FinalScore {
		t.Errorf("score de game-1 (%f) deveria ser estritamente maior que tech-1 (%f)",
			feedBoosted[0].Metadata.FinalScore, feedBoosted[1].Metadata.FinalScore)
	}
}

func TestGenerateFeed_BubbleBurstExtreme(t *testing.T) {
	catalog := sampleTestCatalog()
	profile := defaultTestProfile()

	// Todas as categorias fora da zona neutra (40-60)
	for _, c := range AllCategories {
		profile[c] = 90.0
	}
	// Uma categoria com menor afinidade
	profile[CatAnimais] = 10.0

	feed := GenerateFeed(catalog, profile, nil)

	// O slot de exploração (índice 3) deve pegar o post da categoria de menor afinidade (Animais)
	if len(feed) > 3 {
		slot3 := feed[3]
		if !slot3.Metadata.IsExplorationSlot {
			t.Errorf("esperado slot 3 como exploração")
		}
		if slot3.Category != CatAnimais {
			t.Errorf("esperado fallback para categoria com menor afinidade (Animais), obteve %s", slot3.Category)
		}
	}
}

func TestColdStart_DynamicLERPWeights(t *testing.T) {
	tests := []struct {
		engagements int
		expectedCS  float64
		expectedPW  float64
	}{
		{0, 0.80, 0.20},
		{1, 0.75, 0.25},
		{2, 0.70, 0.30},
		{3, 0.40, 0.60},
		{4, 0.20, 0.80},
		{5, 0.00, 1.00},
		{10, 0.00, 1.00},
	}

	for _, tt := range tests {
		cs, pw := CalculateColdStartWeights(tt.engagements)
		if math.Abs(cs-tt.expectedCS) > 1e-6 {
			t.Errorf("engagements=%d: coldStartFactor esperado %.2f, obteve %.2f", tt.engagements, tt.expectedCS, cs)
		}
		if math.Abs(pw-tt.expectedPW) > 1e-6 {
			t.Errorf("engagements=%d: personalWeight esperado %.2f, obteve %.2f", tt.engagements, tt.expectedPW, pw)
		}
	}
}

func TestColdStart_FeedRecommendationDiagnostic(t *testing.T) {
	catalog := sampleTestCatalog()
	profile := defaultTestProfile()

	trendingScores := map[string]float64{
		"tech-1": 95.0,
		"game-1": 80.0,
		"cine-1": 60.0,
	}
	isTrendingMap := map[string]bool{
		"tech-1": true,
	}

	// 1. Usuário em Cold Start (0 engajamentos)
	feedCold := GenerateFeedWithContext(catalog, profile, nil, nil, nil, nil, trendingScores, isTrendingMap, 0)
	if len(feedCold) == 0 {
		t.Fatal("feed frio vazio")
	}

	firstCold := feedCold[0]
	if firstCold.Metadata.ColdStartFactor < 0.70 {
		t.Errorf("em cold start, cold_start_factor deveria ser >= 0.70, obteve %.2f", firstCold.Metadata.ColdStartFactor)
	}
	if !strings.Contains(firstCold.Metadata.MatchReason, "[Cold Start]") {
		t.Errorf("em cold start, MatchReason deve conter '[Cold Start]', obteve '%s'", firstCold.Metadata.MatchReason)
	}
	if !strings.Contains(firstCold.Metadata.MatchReason, "Trending Coletivo") {
		t.Errorf("MatchReason deve indicar Trending Coletivo, obteve '%s'", firstCold.Metadata.MatchReason)
	}

	// 2. Usuário com 5 engajamentos (Bolha madura/consolidada)
	feedMature := GenerateFeedWithContext(catalog, profile, nil, nil, nil, nil, trendingScores, isTrendingMap, 5)
	firstMature := feedMature[0]
	if firstMature.Metadata.ColdStartFactor != 0.0 {
		t.Errorf("com 5 engajamentos, cold_start_factor deveria ser 0.0, obteve %.2f", firstMature.Metadata.ColdStartFactor)
	}
	if firstMature.Metadata.PersonalWeight != 1.0 {
		t.Errorf("com 5 engajamentos, personal_weight deveria ser 1.0, obteve %.2f", firstMature.Metadata.PersonalWeight)
	}
	if strings.Contains(firstMature.Metadata.MatchReason, "[Cold Start]") {
		t.Errorf("com bolha madura, MatchReason NÃO deve conter '[Cold Start]', obteve '%s'", firstMature.Metadata.MatchReason)
	}
}
