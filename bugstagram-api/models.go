package main

type Category string

const (
	CatTecnologia Category = "Tecnologia"
	CatCinema     Category = "Cinema"
	CatCulinaria  Category = "Culinaria"
	CatFotografia Category = "Fotografia"
	CatAnimais    Category = "Animais"
	CatEsportes   Category = "Esportes"
	CatCarros     Category = "Carros"
	CatGames      Category = "Games"
)

// AllCategories mantém ordem determinística de inicialização e iteração.
var AllCategories = []Category{
	CatTecnologia,
	CatCinema,
	CatCulinaria,
	CatFotografia,
	CatAnimais,
	CatEsportes,
	CatCarros,
	CatGames,
}

func IsValidCategory(c Category) bool {
	for _, valid := range AllCategories {
		if c == valid {
			return true
		}
	}
	return false
}

type ActionType string

const (
	ActionLike ActionType = "LIKE"
	ActionSave ActionType = "SAVE"
	ActionSkip ActionType = "SKIP"
)

type Author struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

type Post struct {
	ID           string   `json:"id"`
	Category     Category `json:"category"`
	Title        string   `json:"title"`
	Content      string   `json:"content"`
	Author       Author   `json:"author"`
	Likes        int      `json:"likes"`
	RecencyScore float64  `json:"recency_score"`
}

type ScoreBreakdown struct {
	AffinityPoints   float64 `json:"affinity_points"`
	PopularityPoints float64 `json:"popularity_points"`
	RecencyPoints    float64 `json:"recency_points"`
}

type ExplanationMetadata struct {
	FinalScore        float64        `json:"final_score"`
	Breakdown         ScoreBreakdown `json:"breakdown"`
	IsExplorationSlot bool           `json:"is_exploration_slot"`
	PenaltyApplied    float64        `json:"penalty_applied"`
	MatchReason       string         `json:"match_reason"`
}

type ScoredPost struct {
	Post
	Metadata ExplanationMetadata `json:"metadata"`
}

type UserProfile map[Category]float64

type InteractRequest struct {
	PostID   string     `json:"post_id"`
	Category Category   `json:"category"`
	Action   ActionType `json:"action"`
}

type ProfileResponse struct {
	Profile       UserProfile `json:"profile"`
	ConsumedCount int         `json:"consumed_count"`
}

type StateSyncResponse struct {
	Profile       UserProfile  `json:"profile"`
	ConsumedCount int          `json:"consumed_count"`
	Feed          []ScoredPost `json:"feed"`
}
