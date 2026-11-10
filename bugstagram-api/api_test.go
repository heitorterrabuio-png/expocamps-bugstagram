package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func setupTestRouter() http.Handler {
	catalog := sampleTestCatalog()
	appState := NewAppState(catalog)

	r := chi.NewRouter()

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, HealthResponse{
			Status:         "healthy",
			Uptime:         appState.Uptime(),
			CatalogSize:    len(catalog),
			ActiveSessions: appState.ActiveSessionsCount(),
		})
	})

	handleInteract := func(w http.ResponseWriter, r *http.Request) {
		sid := getSessionID(r)
		var req InteractRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		profile, consumedCount, feed, err := appState.Interact(req, sid)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, StateSyncResponse{
			Profile:       profile,
			ConsumedCount: consumedCount,
			Feed:          feed,
		})
	}

	r.Route("/api", func(r chi.Router) {
		r.Get("/feed", func(w http.ResponseWriter, r *http.Request) {
			sid := getSessionID(r)
			feed := appState.GetFeed(sid)
			writeJSON(w, http.StatusOK, feed)
		})

		r.Get("/profile", func(w http.ResponseWriter, r *http.Request) {
			sid := getSessionID(r)
			profile, consumedCount := appState.GetProfile(sid)
			writeJSON(w, http.StatusOK, ProfileResponse{
				Profile:       profile,
				ConsumedCount: consumedCount,
			})
		})

		r.Get("/metrics/global", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, appState.GetGlobalMetricsSnapshot())
		})

		r.Post("/interact", handleInteract)
		r.Post("/telemetry/dwell", handleInteract)

		r.Post("/reset", func(w http.ResponseWriter, r *http.Request) {
			sid := getSessionID(r)
			profile, consumedCount, feed := appState.Reset(sid)
			writeJSON(w, http.StatusOK, StateSyncResponse{
				Profile:       profile,
				ConsumedCount: consumedCount,
				Feed:          feed,
			})
		})
	})

	return r
}

func TestAPI_Health(t *testing.T) {
	router := setupTestRouter()
	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("esperado status 200, obteve %d", rec.Code)
	}

	var res HealthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("erro ao decodificar JSON de health: %v", err)
	}

	if res.Status != "healthy" {
		t.Errorf("status esperado 'healthy', obteve '%s'", res.Status)
	}
	if res.CatalogSize != 6 {
		t.Errorf("tamanho do catalogo esperado 6, obteve %d", res.CatalogSize)
	}
}

func TestAPI_SessionIsolationOverHTTP(t *testing.T) {
	router := setupTestRouter()

	// Alice curte tech-1
	interactBody, _ := json.Marshal(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionLike,
	})

	reqAlice := httptest.NewRequest("POST", "/api/interact", bytes.NewReader(interactBody))
	reqAlice.Header.Set("X-Session-ID", "alice-session")
	recAlice := httptest.NewRecorder()
	router.ServeHTTP(recAlice, reqAlice)

	if recAlice.Code != http.StatusOK {
		t.Fatalf("esperado 200 para Alice, obteve %d: %s", recAlice.Code, recAlice.Body.String())
	}

	// Consulta perfil de Bob (sem header ou com outro session ID)
	reqBob := httptest.NewRequest("GET", "/api/profile", nil)
	reqBob.Header.Set("X-Session-ID", "bob-session")
	recBob := httptest.NewRecorder()
	router.ServeHTTP(recBob, reqBob)

	var resBob ProfileResponse
	_ = json.Unmarshal(recBob.Body.Bytes(), &resBob)

	if resBob.Profile[CatTecnologia] != 50.0 {
		t.Errorf("sessão de Bob foi corrompida: afinidade %f", resBob.Profile[CatTecnologia])
	}
	if resBob.ConsumedCount != 0 {
		t.Errorf("Bob deveria ter 0 posts consumidos, obteve %d", resBob.ConsumedCount)
	}
}

func TestAPI_TelemetryDwellEndpoint(t *testing.T) {
	router := setupTestRouter()

	dwellBody, _ := json.Marshal(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionDwell,
	})

	req := httptest.NewRequest("POST", "/api/telemetry/dwell", bytes.NewReader(dwellBody))
	req.Header.Set("X-Session-ID", "dwell-test-session")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("esperado 200 para telemetry dwell, obteve %d: %s", rec.Code, rec.Body.String())
	}

	var res StateSyncResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("erro ao decodificar JSON de retorno: %v", err)
	}

	if res.Profile[CatTecnologia] != 52.0 {
		t.Errorf("afinidade esperada 52.0 após dwell, obteve %.2f", res.Profile[CatTecnologia])
	}
	if res.ConsumedCount != 0 {
		t.Errorf("Dwell passivo não deve consumir post, obteve %d", res.ConsumedCount)
	}
}

func TestAPI_ShareAction(t *testing.T) {
	router := setupTestRouter()

	shareBody, _ := json.Marshal(InteractRequest{
		PostID:   "tech-1",
		Category: CatTecnologia,
		Action:   ActionShare,
	})

	req := httptest.NewRequest("POST", "/api/interact", bytes.NewReader(shareBody))
	req.Header.Set("X-Session-ID", "share-test-session")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("esperado 200 para share, obteve %d: %s", rec.Code, rec.Body.String())
	}

	var res StateSyncResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &res)

	if res.Profile[CatTecnologia] != 65.0 {
		t.Errorf("afinidade esperada 65.0 após share (+15), obteve %.2f", res.Profile[CatTecnologia])
	}
	if res.ConsumedCount != 1 {
		t.Errorf("Share ativo deve consumir post, obteve %d", res.ConsumedCount)
	}
}

func TestAPI_GlobalMetricsEndpoint(t *testing.T) {
	router := setupTestRouter()

	req := httptest.NewRequest("GET", "/api/metrics/global", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("esperado 200 para GET /api/metrics/global, obteve %d", rec.Code)
	}

	var res GlobalMetricsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("erro ao decodificar GlobalMetricsResponse: %v", err)
	}

	if len(res.TopTrending) == 0 {
		t.Errorf("esperava lista de top trending posts não vazia")
	}
	if res.CatalogCount != 6 {
		t.Errorf("esperado 6 posts no catálogo de teste, obteve %d", res.CatalogCount)
	}
}
