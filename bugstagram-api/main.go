package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("erro ao serializar resposta JSON: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func getSessionID(r *http.Request) string {
	if sid := r.Header.Get("X-Session-ID"); strings.TrimSpace(sid) != "" {
		return strings.TrimSpace(sid)
	}
	if sid := r.URL.Query().Get("session_id"); strings.TrimSpace(sid) != "" {
		return strings.TrimSpace(sid)
	}
	return "default"
}

func parseAllowedOrigins() []string {
	originsEnv := os.Getenv("CORS_ALLOWED_ORIGINS")
	if originsEnv == "" {
		return []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"https://expocamps-bugstagram.vercel.app",
		}
	}

	parts := strings.Split(originsEnv, ",")
	origins := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			origins = append(origins, trimmed)
		}
	}
	return origins
}

func isOriginAllowed(origin string) bool {
	originsEnv := os.Getenv("CORS_ALLOWED_ORIGINS")
	if originsEnv != "" {
		for _, allowed := range parseAllowedOrigins() {
			if strings.EqualFold(origin, allowed) {
				return true
			}
		}
		return false
	}

	if origin == "https://expocamps-bugstagram.vercel.app" {
		return true
	}
	if strings.HasPrefix(origin, "https://expocamps-bugstagram-") && strings.HasSuffix(origin, ".vercel.app") {
		return true
	}
	if strings.HasPrefix(origin, "http://localhost:") || origin == "http://localhost" ||
		strings.HasPrefix(origin, "http://127.0.0.1:") || origin == "http://127.0.0.1" {
		return true
	}
	return false
}

func main() {
	catalog := GetInitialCatalog()
	appState := NewAppState(catalog)

	// Rotina em background para limpeza de sessões inativas (a cada 15 min, TTL 2 horas)
	cleanupTicker := time.NewTicker(15 * time.Minute)
	stopCleanup := make(chan struct{})
	go func() {
		for {
			select {
			case <-cleanupTicker.C:
				evicted := appState.CleanupSessions(2 * time.Hour)
				if evicted > 0 {
					log.Printf("[GC] %d sessões inativas liberadas da memória", evicted)
				}
			case <-stopCleanup:
				cleanupTicker.Stop()
				return
			}
		}
	}()

	r := chi.NewRouter()

	// Middlewares essenciais de robustez
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Configuração do CORS (inclui suporte explícito para X-Session-ID)
	r.Use(cors.Handler(cors.Options{
		AllowOriginFunc:  func(_ *http.Request, origin string) bool { return isOriginAllowed(origin) },
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Session-ID"},
		ExposedHeaders:   []string{"Link", "X-Session-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health Check / Readiness Probe
	handleHealth := func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, HealthResponse{
			Status:         "healthy",
			Uptime:         appState.Uptime(),
			CatalogSize:    len(catalog),
			ActiveSessions: appState.ActiveSessionsCount(),
		})
	}
	r.Get("/health", handleHealth)
	r.Get("/api/health", handleHealth)

	// Handler compartilhado para /interact e /telemetry/dwell
	handleInteract := func(w http.ResponseWriter, r *http.Request) {
		sid := getSessionID(r)

		// Proteção contra payloads excessivos (máximo 64 KB)
		r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

		var req InteractRequest
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "payload JSON inválido: "+err.Error())
			return
		}

		profile, consumedCount, feed, err := appState.Interact(req, sid)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		_, _, fatigue := appState.GetProfileWithFatigue(sid)

		writeJSON(w, http.StatusOK, StateSyncResponse{
			Profile:       profile,
			ConsumedCount: consumedCount,
			PostFatigue:   fatigue,
			Feed:          feed,
		})
	}

	// Handler para reidratar sessão persistida no localStorage caso o servidor reinicie
	handleSessionSync := func(w http.ResponseWriter, r *http.Request) {
		sid := getSessionID(r)
		r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

		var req SessionSyncRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "payload JSON inválido: "+err.Error())
			return
		}

		profile, consumedCount, feed := appState.SyncSession(req, sid)
		_, _, fatigue := appState.GetProfileWithFatigue(sid)
		writeJSON(w, http.StatusOK, StateSyncResponse{
			Profile:       profile,
			ConsumedCount: consumedCount,
			PostFatigue:   fatigue,
			Feed:          feed,
		})
	}

	// Handler para métricas globais agregadas e momentum coletivo
	handleGlobalMetrics := func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, appState.GetGlobalMetricsSnapshot())
	}
	r.Get("/metrics/global", handleGlobalMetrics)
	r.Get("/api/metrics/global", handleGlobalMetrics)

	// Handlers compartilhados entre /api/* e rotas de fallback na raiz
	handleFeed := func(w http.ResponseWriter, r *http.Request) {
		sid := getSessionID(r)
		feed := appState.GetFeed(sid)
		writeJSON(w, http.StatusOK, feed)
	}

	handleProfile := func(w http.ResponseWriter, r *http.Request) {
		sid := getSessionID(r)
		profile, consumedCount, fatigue := appState.GetProfileWithFatigue(sid)
		writeJSON(w, http.StatusOK, ProfileResponse{
			Profile:       profile,
			ConsumedCount: consumedCount,
			PostFatigue:   fatigue,
		})
	}

	handleReset := func(w http.ResponseWriter, r *http.Request) {
		sid := getSessionID(r)
		profile, consumedCount, feed := appState.Reset(sid)
		writeJSON(w, http.StatusOK, StateSyncResponse{
			Profile:       profile,
			ConsumedCount: consumedCount,
			Feed:          feed,
		})
	}

	// Rotas da API Bugstagram
	r.Route("/api", func(r chi.Router) {
		// 1. GET /api/feed -> Retorna []ScoredPost ordenado pelo motor
		r.Get("/feed", handleFeed)

		// 2. GET /api/profile -> Retorna o UserProfile atual, contagem de engajamentos e mapa de fadiga
		r.Get("/profile", handleProfile)

		// 3. GET /api/metrics/global -> Retorna os posts com maior momentum coletivo na rede
		r.Get("/metrics/global", handleGlobalMetrics)

		// 4. POST /api/interact -> Aplica deltas, registra fadiga/telemetria e devolve novo estado
		r.Post("/interact", handleInteract)

		// 5. POST /api/telemetry/dwell -> Endpoint dedicado para eventos passivos de telemetria
		r.Post("/telemetry/dwell", handleInteract)

		// 6. POST /api/session/sync -> Restaura estado de perfil/fadiga salvo no cliente
		r.Post("/session/sync", handleSessionSync)

		// 7. POST /api/reset -> Restaura perfil para 50.0 e limpa fadiga da sessão
		r.Post("/reset", handleReset)
	})

	// Fallback sem prefixo /api
	r.Get("/feed", handleFeed)
	r.Get("/profile", handleProfile)
	r.Post("/interact", handleInteract)
	r.Post("/telemetry/dwell", handleInteract)
	r.Post("/session/sync", handleSessionSync)
	r.Post("/reset", handleReset)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	server := &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadTimeout:       10 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Inicia o servidor em goroutine para permitir Graceful Shutdown
	go func() {
		log.Printf("Bugstagram API v2.0 rodando em http://localhost%s (Catálogo: %d posts)", addr, len(catalog))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("falha ao iniciar servidor HTTP: %v", err)
		}
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit
	log.Println("Sinal de encerramento recebido. Desligando servidor com segurança...")

	close(stopCleanup)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("Erro durante o desligamento do servidor: %v", err)
	} else {
		log.Println("Servidor finalizado com sucesso.")
	}
}
