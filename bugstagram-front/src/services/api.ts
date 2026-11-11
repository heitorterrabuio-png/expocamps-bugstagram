// src/services/api.ts

import {
  ActionType,
  Category,
  GlobalMetricsResponse,
  PostFatigueRecord,
  ProfileResponse,
  ScoredPost,
  SessionSyncPayload,
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
 * Obtém ou inicializa um ID de sessão único persistido no navegador.
 * Garante que múltiplos usuários (ou abas) tenham simulações isoladas
 * no backend Go sem conflitos concorrentes.
 */
export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr-session";
  const KEY = "bugstagram_session_id";
  try {
    let sid = localStorage.getItem(KEY);
    if (!sid) {
      sid =
        "sess_" +
        Math.random().toString(36).substring(2, 9) +
        "_" +
        Date.now().toString(36);
      localStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return "default";
  }
}

const SESSION_STATE_KEY = "bugstagram_session_state_v1";

export interface PersistedSessionSnapshot {
  sessionId: string;
  profile: UserProfile;
  consumed_count: number;
  post_fatigue?: Record<string, PostFatigueRecord>;
}

export function saveSessionSnapshot(
  snapshot: Omit<PersistedSessionSnapshot, "sessionId">
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedSessionSnapshot = {
      sessionId: getSessionId(),
      ...snapshot,
    };
    localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Ignora falha de cota do localStorage
  }
}

export function loadSessionSnapshot(): PersistedSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSessionSnapshot;
    if (!parsed || parsed.sessionId !== getSessionId() || !parsed.profile) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_STATE_KEY);
  } catch {
    // noop
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
    "X-Session-ID": getSessionId(),
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

export async function getProfileState(): Promise<ProfileResponse> {
  const data = await requestWithFallback<
    ProfileResponse | { profile: UserProfile; consumed_count?: number; post_fatigue?: Record<string, PostFatigueRecord> }
  >("/profile", { method: "GET" });

  if ("consumed_count" in data && typeof data.consumed_count === "number") {
    return {
      profile: data.profile,
      consumed_count: data.consumed_count,
      post_fatigue: data.post_fatigue,
    };
  }
  return {
    profile: ("profile" in data ? data.profile : data) as UserProfile,
    consumed_count: 0,
  };
}

export async function getProfile(): Promise<UserProfile> {
  const state = await getProfileState();
  return state.profile;
}

export async function syncSessionState(
  payload: SessionSyncPayload
): Promise<SimulationStateResponse> {
  return requestWithFallback<SimulationStateResponse>("/session/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

export async function sendTelemetryDwell(
  postId: string,
  category: Category,
  action: "dwell" | "fast_skip"
): Promise<SimulationStateResponse> {
  return requestWithFallback<SimulationStateResponse>("/telemetry/dwell", {
    method: "POST",
    body: JSON.stringify({
      post_id: postId,
      category,
      action,
    }),
  });
}

export async function resetSimulation(): Promise<SimulationStateResponse> {
  const res = await requestWithFallback<SimulationStateResponse>("/reset", {
    method: "POST",
  });
  clearSessionSnapshot();
  return res;
}

export async function getGlobalMetrics(): Promise<GlobalMetricsResponse> {
  return requestWithFallback<GlobalMetricsResponse>("/metrics/global", {
    method: "GET",
  });
}
