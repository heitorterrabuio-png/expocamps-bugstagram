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

export type ActionType = "LIKE" | "SAVE" | "SKIP";

export interface ExplanationMetadata {
  final_score: number;
  breakdown: {
    affinity_points: number;
    popularity_points: number;
    recency_points: number;
  };
  is_exploration_slot: boolean;
  penalty_applied: number;
  match_reason: string;
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
  metadata: ExplanationMetadata;
}

export type UserProfile = Record<Category, number>;

export interface SimulationStateResponse {
  profile: UserProfile;
  feed: ScoredPost[];
}