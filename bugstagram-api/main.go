package main

import (
	"encoding/json"
	"log"
	"net/http"

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

func main() {
	catalog := GetInitialCatalog()
	appState := NewAppState(catalog)

	r := chi.NewRouter()

	// Middlewares obrigatórios
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS deve vir antes das rotas
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "https://expocamps-bugstagram.vercel.app"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Suas rotas da API aqui...

	// Rotas da API
	r.Route("/api", func(r chi.Router) {
		// 1. GET /api/feed -> Retorna []ScoredPost ordenado pelo motor
		r.Get("/feed", func(w http.ResponseWriter, r *http.Request) {
			feed := appState.GetFeed()
			writeJSON(w, http.StatusOK, feed)
		})

		// 2. GET /api/profile -> Retorna o UserProfile atual e a contagem de posts consumidos
		r.Get("/profile", func(w http.ResponseWriter, r *http.Request) {
			profile, consumedCount := appState.GetProfile()
			writeJSON(w, http.StatusOK, ProfileResponse{
				Profile:       profile,
				ConsumedCount: consumedCount,
			})
		})

		// 3. POST /api/interact -> Aplica deltas, registra consumo e devolve novo estado
		r.Post("/interact", func(w http.ResponseWriter, r *http.Request) {
			var req InteractRequest
			decoder := json.NewDecoder(r.Body)
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "payload JSON inválido: "+err.Error())
				return
			}

			profile, consumedCount, feed, err := appState.Interact(req)
			if err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}

			writeJSON(w, http.StatusOK, StateSyncResponse{
				Profile:       profile,
				ConsumedCount: consumedCount,
				Feed:          feed,
			})
		})

		// 4. POST /api/reset -> Restaura perfil para 50.0 e limpa consumedIDs
		r.Post("/reset", func(w http.ResponseWriter, r *http.Request) {
			profile, consumedCount, feed := appState.Reset()
			writeJSON(w, http.StatusOK, StateSyncResponse{
				Profile:       profile,
				ConsumedCount: consumedCount,
				Feed:          feed,
			})
		})
	})

	addr := ":8080"
	log.Printf("Bugstagram API rodando em http://localhost%s (Catálogo: %d posts)", addr, len(catalog))
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("falha ao iniciar servidor: %v", err)
	}
}
