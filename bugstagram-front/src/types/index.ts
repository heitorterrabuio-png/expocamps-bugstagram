// src/types/index.ts

export type Category =
  | "Tecnologia"
  | "Cinema"
  | "Culinaria"
  | "Fotografia"
  | "Animais"
  | "Esportes"
  | "Carros"
  | "Games";

export const ALL_CATEGORIES: Category[] = [
  "Tecnologia",
  "Cinema",
  "Culinaria",
  "Fotografia",
  "Animais",
  "Esportes",
  "Carros",
  "Games",
];

export type ActionType =
  | "LIKE"
  | "SAVE"
  | "SHARE"
  | "SKIP"
  | "DWELL"
  | "FAST_SKIP"
  | "like"
  | "save"
  | "share"
  | "skip"
  | "dwell"
  | "fast_skip";

export interface ExplanationMetadata {
  final_score: number;
  breakdown: {
    affinity_points: number;
    creator_points?: number;
    freshness_points?: number;
    popularity_points: number;
    recency_points: number;
  };
  is_exploration_slot: boolean;
  penalty_applied: number;
  match_reason: string;
  has_dwell?: boolean;
  has_share?: boolean;
  age_hours?: number;
  trending_score?: number;
  is_trending?: boolean;
  cold_start_factor?: number;
  personal_weight?: number;
  fatigue_multiplier?: number;
  jitter_applied?: number;
}

export interface PostFatigueRecord {
  interactions: number;
  last_seen_at: string;
  was_skipped?: boolean;
}

export interface ScoredPost {
  id: string;
  category: Category;
  title: string;
  image_url: string;
  content: string;
  author: {
    username: string;
    display_name: string;
  };
  likes: number;
  recency_score: number;
  age_hours?: number;
  metadata: ExplanationMetadata;
}

export interface GlobalTrendingPost {
  post_id: string;
  category: Category;
  title: string;
  total_views: number;
  total_likes: number;
  total_saves: number;
  total_shares: number;
  total_dwell_seconds: number;
  last_interacted_at: string;
  raw_momentum: number;
  trending_score: number;
  is_trending: boolean;
}

export interface GlobalMetricsResponse {
  top_trending: GlobalTrendingPost[];
  total_system_interactions: number;
  catalog_count: number;
}

export type UserProfile = Record<Category, number>;

export interface SessionSyncPayload {
  profile: UserProfile;
  consumed_count: number;
  post_fatigue?: Record<string, PostFatigueRecord>;
}

export interface ProfileResponse {
  profile: UserProfile;
  consumed_count: number;
  post_fatigue?: Record<string, PostFatigueRecord>;
}

export interface SimulationStateResponse {
  profile: UserProfile;
  feed: ScoredPost[];
  consumed_count?: number;
  post_fatigue?: Record<string, PostFatigueRecord>;
}
