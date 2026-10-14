// src/services/api.ts

import {
  ActionType,
  Category,
  ScoredPost,
  SimulationStateResponse,
  UserProfile,
} from "@/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export class ApiOfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiOfflineError";
  }
}

/**
 * Executa a requisição tentando o prefixo /api (padrão REST) e faz fallback
 * automático para a raiz caso o roteador Go não utilize o prefixo /api.
 */
async function requestWithFallback<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options?.headers || {}),
  };

  const primaryUrl = `${API_BASE_URL}/api${endpoint}`;
  const fallbackUrl = `${API_BASE_URL}${endpoint}`;

  try {
    let response = await fetch(primaryUrl, {
      ...options,
      headers,
      cache: "no-store",
    });

    if (response.status === 404) {
      response = await fetch(fallbackUrl, {
        ...options,
        headers,
        cache: "no-store",
      });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Erro desconhecido");
      throw new Error(
        `Erro HTTP ${response.status} ao acessar ${endpoint}: ${errorText}`
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new ApiOfflineError(
        `Não foi possível conectar à API Go em ${API_BASE_URL}. Verifique se o backend está rodando na porta 8080.`
      );
    }
    if (error instanceof ApiOfflineError) {
      throw error;
    }
    throw new ApiOfflineError(
      error instanceof Error
        ? error.message
        : `Falha de comunicação com o servidor Go em ${API_BASE_URL}.`
    );
  }
}

export async function getFeed(): Promise<ScoredPost[]> {
  const data = await requestWithFallback<ScoredPost[] | { feed: ScoredPost[] }>(
    "/feed",
    { method: "GET" }
  );
  return Array.isArray(data) ? data : data.feed;
}

export async function getProfile(): Promise<UserProfile> {
  const data = await requestWithFallback<
    UserProfile | { profile: UserProfile }
  >("/profile", { method: "GET" });

  if ("profile" in data && typeof data.profile === "object") {
    return data.profile as UserProfile;
  }
  return data as UserProfile;
}

export async function interact(
  postId: string,
  category: Category,
  action: ActionType
): Promise<SimulationStateResponse> {
  return requestWithFallback<SimulationStateResponse>("/interact", {
    method: "POST",
    body: JSON.stringify({
      post_id: postId,
      category,
      action,
    }),
  });
}

export async function resetSimulation(): Promise<SimulationStateResponse> {
  return requestWithFallback<SimulationStateResponse>("/reset", {
    method: "POST",
  });
}