package main

import (
	"testing"
	"time"
)

func TestState_SessionIsolation(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)

	sessA := "user-alice"
	sessB := "user-bob"

	// Alice curte tech-1
	_, _, _, err := appState.Interact(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionLike,
	}, sessA)
	if err != nil {
		t.Fatalf("erro ao interagir na sessão Alice: %v", err)
	}

	profA, countA := appState.GetProfile(sessA)
	profB, countB := appState.GetProfile(sessB)

	if profA[CatTecnologia] != 55.0 {
		t.Errorf("esperado afinidade 55.0 para Alice, obteve %f", profA[CatTecnologia])
	}
	if countA != 1 {
		t.Errorf("esperado 1 post consumido para Alice, obteve %d", countA)
	}

	// Bob deve permanecer intocado
	if profB[CatTecnologia] != 50.0 {
		t.Errorf("esperado afinidade 50.0 para Bob (isolado), obteve %f", profB[CatTecnologia])
	}
	if countB != 0 {
		t.Errorf("esperado 0 posts consumidos para Bob, obteve %d", countB)
	}

	// O feed de Bob ainda deve conter 'tech-1', enquanto o de Alice não
	feedBob := appState.GetFeed(sessB)
	feedAlice := appState.GetFeed(sessA)

	hasTech1InBob := false
	for _, p := range feedBob {
		if p.ID == "tech-1" {
			hasTech1InBob = true
			break
		}
	}
	if !hasTech1InBob {
		t.Errorf("tech-1 deveria estar disponível no feed de Bob")
	}

	for _, p := range feedAlice {
		if p.ID == "tech-1" {
			t.Errorf("tech-1 não deveria estar no feed de Alice após consumo")
		}
	}
}

func TestState_ShareAction(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)
	sess := "share-test"

	// Share: +15.0 temática, +12.0 criador, marca como consumido
	prof, count, _, err := appState.Interact(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionShare,
	}, sess)
	if err != nil {
		t.Fatalf("falha ao enviar SHARE: %v", err)
	}

	if prof[CatTecnologia] != 65.0 { // 50 + 15
		t.Errorf("esperado afinidade 65.0 após SHARE, obteve %.2f", prof[CatTecnologia])
	}
	if count != 1 {
		t.Errorf("SHARE deve registrar post como consumido, obteve %d", count)
	}

	userSess := appState.GetOrCreateSession(sess)
	userSess.mu.RLock()
	authorAff := userSess.AuthorAffinity["ant_dev"]
	isShared := userSess.SharedPosts["tech-1"]
	userSess.mu.RUnlock()

	if authorAff != 62.0 { // 50 + 12
		t.Errorf("esperado afinidade de criador 62.0 após SHARE, obteve %.2f", authorAff)
	}
	if !isShared {
		t.Errorf("esperava tech-1 marcado no mapa de SharedPosts")
	}
}

func TestState_PassiveDwellAndFastSkip(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)
	sess := "telemetry-test"

	// 1. Dwell: +2.0 temática, +1.0 criador, NÃO consome
	prof, count, _, err := appState.Interact(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionDwell,
	}, sess)
	if err != nil {
		t.Fatalf("falha ao enviar DWELL: %v", err)
	}

	if prof[CatTecnologia] != 52.0 { // 50 + 2
		t.Errorf("esperado afinidade 52.0 após DWELL, obteve %.2f", prof[CatTecnologia])
	}
	if count != 0 {
		t.Errorf("DWELL é passivo e NÃO deve consumir post, obteve count=%d", count)
	}

	userSess := appState.GetOrCreateSession(sess)
	userSess.mu.RLock()
	authorAff := userSess.AuthorAffinity["ant_dev"]
	hasDwell := userSess.DwellPosts["tech-1"]
	userSess.mu.RUnlock()

	if authorAff != 51.0 { // 50 + 1
		t.Errorf("esperado afinidade criador 51.0 após DWELL, obteve %.2f", authorAff)
	}
	if !hasDwell {
		t.Errorf("esperava tech-1 marcado em DwellPosts")
	}

	// 2. FastSkip: -1.5 temática, -1.0 criador, NÃO consome
	prof2, count2, _, err := appState.Interact(InteractRequest{
		PostID:   "tech-2",
		Category: CatTecnologia,
		Action:   ActionFastSkip,
	}, sess)
	if err != nil {
		t.Fatalf("falha ao enviar FAST_SKIP: %v", err)
	}

	if prof2[CatTecnologia] != 50.5 { // 52.0 - 1.5
		t.Errorf("esperado afinidade 50.5 após FAST_SKIP, obteve %.2f", prof2[CatTecnologia])
	}
	if count2 != 0 {
		t.Errorf("FAST_SKIP é passivo e NÃO deve consumir post, obteve count=%d", count2)
	}
}

func TestState_ActionCaseInsensitive(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)
	sess := "case-test"

	// Envia minúsculo "share"
	prof, _, _, err := appState.Interact(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   "share",
	}, sess)
	if err != nil {
		t.Fatalf("esperava aceitar ação em minúsculo: %v", err)
	}
	if prof[CatTecnologia] != 65.0 {
		t.Errorf("esperado afinidade 65.0, obteve %.2f", prof[CatTecnologia])
	}
}

func TestState_InteractClamping(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)

	sess := "clamp-test"

	// Múltiplos saves para estourar 100
	for i := 0; i < 15; i++ {
		_, _, _, _ = appState.Interact(InteractRequest{
			PostID:   "tech-1",
			Category: CatTecnologia,
			Action:   ActionSave,
		}, sess)
	}

	prof, _ := appState.GetProfile(sess)
	if prof[CatTecnologia] > 100.0 {
		t.Errorf("afinidade ultrapassou 100.0: %f", prof[CatTecnologia])
	}

	// Múltiplos skips para descer abaixo de 0
	for i := 0; i < 30; i++ {
		_, _, _, _ = appState.Interact(InteractRequest{
			PostID:   "tech-1",
			Category: CatTecnologia,
			Action:   ActionSkip,
		}, sess)
	}

	prof, _ = appState.GetProfile(sess)
	if prof[CatTecnologia] < 0.0 {
		t.Errorf("afinidade caiu abaixo de 0.0: %f", prof[CatTecnologia])
	}
}

func TestState_InvalidPostID(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)

	_, _, _, err := appState.Interact(InteractRequest{
		PostID:   "post-inexistente",
		Category: CatTecnologia,
		Action:   ActionLike,
	}, "test-sess")

	if err == nil {
		t.Fatalf("esperava erro ao tentar interagir com post inexistente")
	}
}

func TestState_CategoryMismatch(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)

	_, _, _, err := appState.Interact(InteractRequest{
		PostID:   "tech-1",
		Category: CatCulinaria, // tech-1 é CatTecnologia
		Action:   ActionLike,
	}, "test-sess")

	if err == nil {
		t.Fatalf("esperava erro ao passar categoria divergente do catálogo")
	}
}

func TestState_Reset(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)

	sess := "reset-sess"
	_, _, _, _ = appState.Interact(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionLike,
	}, sess)

	prof, count, feed := appState.Reset(sess)

	if count != 0 {
		t.Errorf("esperado 0 posts consumidos após reset, obteve %d", count)
	}
	for cat, val := range prof {
		if val != 50.0 {
			t.Errorf("categoria %s deveria ter 50.0 após reset, tem %f", cat, val)
		}
	}
	if len(feed) != len(catalog) {
		t.Errorf("esperado feed completo de %d posts após reset, obteve %d", len(catalog), len(feed))
	}
}

func TestState_CleanupSessions(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)

	// Cria sessão que simula inatividade
	sessOld := appState.GetOrCreateSession("old-session")
	sessOld.LastActive = time.Now().Add(-3 * time.Hour)

	// Sessão default nunca é removida
	sessDef := appState.GetOrCreateSession("default")
	sessDef.LastActive = time.Now().Add(-5 * time.Hour)

	// Sessão recente
	sessRecent := appState.GetOrCreateSession("recent-session")
	sessRecent.LastActive = time.Now()

	removed := appState.CleanupSessions(2 * time.Hour)
	if removed != 1 {
		t.Errorf("esperado 1 sessão removida, obteve %d", removed)
	}

	if appState.ActiveSessionsCount() != 2 { // "default" e "recent-session"
		t.Errorf("esperado 2 sessões ativas restantes, obteve %d", appState.ActiveSessionsCount())
	}
}

func TestGlobalMetrics_RecordingAndMomentum(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)

	// Inicialmente verifica snapshot
	initialSnapshot := appState.GetGlobalMetricsSnapshot()
	if len(initialSnapshot.TopTrending) == 0 {
		t.Fatal("esperava lista de trending inicial")
	}

	initialInteractions := initialSnapshot.TotalSystemInteractions

	// Sessão A compartilha tech-1
	_, _, _, err := appState.Interact(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionShare,
	}, "user-a")
	if err != nil {
		t.Fatalf("erro ao dar share: %v", err)
	}

	// Sessão B curte tech-1
	_, _, _, err = appState.Interact(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionLike,
	}, "user-b")
	if err != nil {
		t.Fatalf("erro ao dar like: %v", err)
	}

	// Sessão C passa dwell em tech-1
	_, _, _, err = appState.Interact(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionDwell,
	}, "user-c")
	if err != nil {
		t.Fatalf("erro ao dar dwell: %v", err)
	}

	postMetrics, ok := appState.GetGlobalMetricsManager().GetPostMetrics("tech-1")
	if !ok {
		t.Fatalf("tech-1 não encontrado nas métricas globais")
	}

	if postMetrics.TotalShares < 1 {
		t.Errorf("esperava pelo menos 1 share para tech-1")
	}
	if postMetrics.TotalLikes < 1 {
		t.Errorf("esperava pelo menos 1 like para tech-1")
	}

	updatedSnapshot := appState.GetGlobalMetricsSnapshot()
	if updatedSnapshot.TotalSystemInteractions <= initialInteractions {
		t.Errorf("total de interações do sistema deveria ter incrementado: antes %d, depois %d",
			initialInteractions, updatedSnapshot.TotalSystemInteractions)
	}
}

func TestGlobalMetrics_Concurrency(t *testing.T) {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)

	done := make(chan bool)
	concurrency := 20
	iterations := 25

	for i := 0; i < concurrency; i++ {
		go func(workerID int) {
			sessID := "worker-session"
			for j := 0; j < iterations; j++ {
				postID := catalog[j%len(catalog)].ID
				cat := catalog[j%len(catalog)].Category

				var action ActionType
				switch j % 4 {
				case 0:
					action = ActionLike
				case 1:
					action = ActionSave
				case 2:
					action = ActionShare
				case 3:
					action = ActionDwell
				}

				_, _, _, _ = appState.Interact(InteractRequest{
					PostID:   postID,
					Category: cat,
					Action:   action,
				}, sessID)

				_ = appState.GetFeed(sessID)
				_ = appState.GetGlobalMetricsSnapshot()
			}
			done <- true
		}(i)
	}

	for i := 0; i < concurrency; i++ {
		<-done
	}

	snapshot := appState.GetGlobalMetricsSnapshot()
	if snapshot.TotalSystemInteractions == 0 {
		t.Errorf("esperava interações contabilizadas após execução concorrente")
	}
}
