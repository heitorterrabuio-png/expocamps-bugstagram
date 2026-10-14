package main

import (
	"errors"
	"fmt"
	"math"
	"sync"
)

type AppState struct {
	mu          sync.RWMutex
	catalog     []Post
	postIndex   map[string]Post
	profile     UserProfile
	consumedIDs map[string]bool
}

func NewAppState(catalog []Post) *AppState {
	idx := make(map[string]Post, len(catalog))
	for _, p := range catalog {
		idx[p.ID] = p
	}

	s := &AppState{
		catalog:   catalog,
		postIndex: idx,
	}
	s.Reset()
	return s
}

func (s *AppState) copyProfileLocked() UserProfile {
	cp := make(UserProfile, len(s.profile))
	for k, v := range s.profile {
		cp[k] = v
	}
	return cp
}

func (s *AppState) GetFeed() []ScoredPost {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return GenerateFeed(s.catalog, s.profile, s.consumedIDs)
}

func (s *AppState) GetProfile() (UserProfile, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.copyProfileLocked(), len(s.consumedIDs)
}

func (s *AppState) Interact(req InteractRequest) (UserProfile, int, []ScoredPost, error) {
	if req.PostID == "" {
		return nil, 0, nil, errors.New("o campo 'post_id' é obrigatório")
	}

	var delta float64
	switch req.Action {
	case ActionLike:
		delta = 5.0
	case ActionSave:
		delta = 10.0
	case ActionSkip:
		delta = -4.0
	default:
		return nil, 0, nil, fmt.Errorf("ação inválida '%s': use LIKE, SAVE ou SKIP", req.Action)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Resolve ou valida a categoria com base no catálogo caso necessário
	targetCategory := req.Category
	if catalogPost, exists := s.postIndex[req.PostID]; exists {
		if targetCategory == "" {
			targetCategory = catalogPost.Category
		} else if targetCategory != catalogPost.Category {
			return nil, 0, nil, fmt.Errorf(
				"inconsistência: o post '%s' pertence à categoria '%s', mas foi enviado '%s'",
				req.PostID, catalogPost.Category, targetCategory,
			)
		}
	}

	if !IsValidCategory(targetCategory) {
		return nil, 0, nil, fmt.Errorf("categoria inválida: '%s'", targetCategory)
	}

	// Clamping estrito entre 0.0 e 100.0
	updatedScore := s.profile[targetCategory] + delta
	updatedScore = math.Max(0.0, math.Min(100.0, updatedScore))
	s.profile[targetCategory] = updatedScore

	// Registra o post como consumido
	s.consumedIDs[req.PostID] = true

	feed := GenerateFeed(s.catalog, s.profile, s.consumedIDs)
	return s.copyProfileLocked(), len(s.consumedIDs), feed, nil
}

func (s *AppState) Reset() (UserProfile, int, []ScoredPost) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.profile = make(UserProfile, len(AllCategories))
	for _, cat := range AllCategories {
		s.profile[cat] = 50.0
	}
	s.consumedIDs = make(map[string]bool)

	feed := GenerateFeed(s.catalog, s.profile, s.consumedIDs)
	return s.copyProfileLocked(), 0, feed
}
