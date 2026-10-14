// src/app/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Heart,
  Repeat,
  FastForward,
  RotateCcw,
  Flame,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import {
  ActionType,
  ALL_CATEGORIES,
  Category,
  ScoredPost,
  UserProfile,
} from "@/types";
import {
  getFeed,
  getProfile,
  interact,
  resetSimulation,
} from "@/services/api";

// Configuração visual de alto contraste para cada categoria
const CATEGORY_STYLES: Record<
  Category,
  { badge: string; bar: string; ring: string; emoji: string }
> = {
  Tecnologia: {
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
    bar: "from-cyan-500 to-blue-500",
    ring: "ring-cyan-400",
    emoji: "💻",
  },
  Cinema: {
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/40",
    bar: "from-purple-500 to-fuchsia-500",
    ring: "ring-purple-400",
    emoji: "🎬",
  },
  Culinaria: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    bar: "from-amber-500 to-orange-500",
    ring: "ring-amber-400",
    emoji: "🍳",
  },
  Fotografia: {
    badge: "bg-pink-500/15 text-pink-300 border-pink-500/40",
    bar: "from-pink-500 to-rose-500",
    ring: "ring-pink-400",
    emoji: "📸",
  },
  Animais: {
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    bar: "from-emerald-500 to-teal-500",
    ring: "ring-emerald-400",
    emoji: "🐾",
  },
  Esportes: {
    badge: "bg-lime-500/15 text-lime-300 border-lime-500/40",
    bar: "from-lime-500 to-green-500",
    ring: "ring-lime-400",
    emoji: "⚽",
  },
  Carros: {
    badge: "bg-red-500/15 text-red-300 border-red-500/40",
    bar: "from-red-500 to-orange-600",
    ring: "ring-red-400",
    emoji: "🏎️",
  },
  Games: {
    badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
    bar: "from-indigo-500 to-violet-500",
    ring: "ring-indigo-400",
    emoji: "🎮",
  },
};

const DEFAULT_PROFILE: UserProfile = {
  Tecnologia: 50,
  Cinema: 50,
  Culinaria: 50,
  Fotografia: 50,
  Animais: 50,
  Esportes: 50,
  Carros: 50,
  Games: 50,
};

export default function BugstagramPage() {
  const [feed, setFeed] = useState<ScoredPost[]>([]);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [processingPostId, setProcessingPostId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastInteractionBanner, setLastInteractionBanner] = useState<{
    category: Category;
    action: ActionType;
    delta: string;
  } | null>(null);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const [fetchedProfile, fetchedFeed] = await Promise.all([
        getProfile(),
        getFeed(),
      ]);
      setProfile(fetchedProfile);
      setFeed(fetchedFeed);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Falha ao conectar à API Go em http://localhost:8080";
      setApiError(message);
      if (typeof window !== "undefined") {
        window.alert(`⚠️ API GO OFFLINE:\n\n${message}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleInteraction = async (
    postId: string,
    category: Category,
    action: ActionType
  ) => {
    if (processingPostId) return;
    setProcessingPostId(postId);
    setApiError(null);

    const deltaMap: Record<ActionType, string> = {
      LIKE: "+5 pts (Curtida)",
      SAVE: "+10 pts (Repostado)",
      SKIP: "Pulado / Sem interesse",
    };

    try {
      const updated = await interact(postId, category, action);
      setProfile(updated.profile);
      setFeed(updated.feed);
      setLastInteractionBanner({
        category,
        action,
        delta: deltaMap[action],
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao registrar interação na API Go.";
      setApiError(message);
      if (typeof window !== "undefined") {
        window.alert(`⚠️ ERRO DE COMUNICAÇÃO COM A API GO:\n\n${message}`);
      }
    } finally {
      setProcessingPostId(null);
    }
  };

  const handleReset = async () => {
    if (isResetting) return;
    setIsResetting(true);
    setApiError(null);
    try {
      const resetData = await resetSimulation();
      setProfile(resetData.profile);
      setFeed(resetData.feed);
      setLastInteractionBanner(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao resetar simulação na API Go.";
      setApiError(message);
      if (typeof window !== "undefined") {
        window.alert(`⚠️ ERRO AO RESETAR SIMULAÇÃO:\n\n${message}`);
      }
    } finally {
      setIsResetting(false);
    }
  };

  // Segmentação automática para o Diagnóstico da Bolha
  const bubbleCore = ALL_CATEGORIES.filter((cat) => (profile[cat] ?? 0) >= 70);
  const neutralZone = ALL_CATEGORIES.filter(
    (cat) => (profile[cat] ?? 0) >= 30 && (profile[cat] ?? 0) <= 69
  );
  const blindZone = ALL_CATEGORIES.filter((cat) => (profile[cat] ?? 0) <= 29);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-pink-500 selection:text-white">
      {/* Topbar Estilo Instagram Oficial / Meta */}
      <header className="sticky top-0 z-40 border-b border-[#262626] bg-black/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-4">
            {/* Ícone Câmera com Gradiente Oficial do Instagram */}
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] p-0.5 shadow-lg shadow-pink-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-black">
                <Sparkles className="h-5 w-5 text-[#DD2A7B]" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
                  Bugstagram
                </h1>
                <span className="rounded-full border border-[#0095F6]/40 bg-[#0095F6]/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#0095F6]">
                  Meta Algorithm Lab
                </span>
              </div>
              <p className="text-xs text-[#A8A8A8]">
                Simulador Interativo de Bolha de Filtro e Ranqueamento de Feed em Tempo Real
              </p>
            </div>
          </div>

          {/* Status da Conexão + Telemetria Rápida */}
          <div className="flex items-center gap-3">
            {lastInteractionBanner && (
              <div className="hidden items-center gap-2 rounded-full border border-[#262626] bg-[#121212] px-3.5 py-1.5 text-xs md:flex">
                <span className="text-[#A8A8A8]">Último sinal:</span>
                <span className="font-bold text-white">
                  {CATEGORY_STYLES[lastInteractionBanner.category].emoji}{" "}
                  {lastInteractionBanner.category}
                </span>
                <span className="font-semibold text-[#0095F6]">
                  ({lastInteractionBanner.delta})
                </span>
              </div>
            )}

            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                apiError
                  ? "border-rose-500/50 bg-rose-950/40 text-rose-300"
                  : "border-emerald-500/40 bg-emerald-950/30 text-emerald-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  apiError ? "bg-rose-500" : "animate-pulse bg-emerald-400"
                }`}
              />
              {apiError ? "API Go Offline" : "Engine Go :8080 Online"}
            </div>
          </div>
        </div>
      </header>

      {/* Banner de Erro Crítico caso a API Go esteja Offline */}
      {apiError && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-4 rounded-xl border-2 border-rose-500 bg-rose-950/40 p-4 text-rose-100 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-7 w-7 shrink-0 text-rose-400" />
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-rose-300">
                  Falha de Conexão com o Servidor Go (http://localhost:8080)
                </h2>
                <p className="text-sm text-rose-200">{apiError}</p>
              </div>
            </div>
            <button
              onClick={loadInitialData}
              className="shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-rose-500"
            >
              Tentar Reconectar
            </button>
          </div>
        </div>
      )}

      {/* Container Principal: Grid de 12 Colunas (7 Esquerda / 5 Direita) */}
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-6 sm:px-6 lg:grid-cols-12">
        {/* =====================================================================
            COLUNA DA ESQUERDA (7 COLUNAS): O FEED DO ALGORITMO
        ===================================================================== */}
        <section className="space-y-6 lg:col-span-7">
          {/* Barra Superior estilo "Stories" do Instagram mostrando o pulso das 8 categorias */}
          <div className="rounded-xl border border-[#262626] bg-[#121212] p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#A8A8A8]">
                Stories de Afinidade Instantânea
              </span>
              <span className="text-[11px] text-[#A8A8A8]">
                Anel colorido = Na sua bolha (Score &ge; 70)
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {ALL_CATEGORIES.map((category) => {
                const score = Math.round(profile[category] ?? 0);
                const isHigh = score >= 70;
                const isBlind = score <= 29;
                return (
                  <div
                    key={category}
                    className={`flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition ${
                      isBlind ? "opacity-40 grayscale" : "opacity-100"
                    }`}
                  >
                    <div
                      className={`rounded-full p-[2.5px] ${
                        isHigh
                          ? "bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] shadow-md shadow-pink-500/20"
                          : "bg-[#262626]"
                      }`}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl">
                        {CATEGORY_STYLES[category].emoji}
                      </div>
                    </div>
                    <span className="max-w-full truncate text-[11px] font-semibold text-zinc-200">
                      {category}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        isHigh
                          ? "text-emerald-400"
                          : isBlind
                          ? "text-rose-400"
                          : "text-[#A8A8A8]"
                      }`}
                    >
                      {score}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lista de Posts ou Estados de Carregamento / Empty State */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((skeleton) => (
                <div
                  key={skeleton}
                  className="h-96 animate-pulse rounded-xl border border-[#262626] bg-[#121212] p-6"
                />
              ))}
            </div>
          ) : feed.length === 0 ? (
            /* Empty State exigido quando o catálogo esgota */
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[#262626] bg-[#121212] px-6 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] p-0.5">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#121212]">
                  <RotateCcw className="h-7 w-7 text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-extrabold text-white">
                Catálogo de Posts Esgotado
              </h2>
              <p className="mt-2 max-w-md text-sm text-[#A8A8A8]">
                Você interagiu com todos os conteúdos disponíveis nesta sessão.
                Reinicie a simulação para zerar os pesos do algoritmo e testar
                uma nova bolha de filtro!
              </p>
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="mt-6 flex items-center gap-2 rounded-xl bg-[#0095F6] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#0095F6]/25 transition hover:bg-[#1877F2] disabled:opacity-50"
              >
                <RotateCcw
                  className={`h-4 w-4 ${isResetting ? "animate-spin" : ""}`}
                />
                {isResetting ? "Resetando..." : "Resetar Simulação"}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {feed.map((post, index) => {
                const style =
                  CATEGORY_STYLES[post.category] || CATEGORY_STYLES.Tecnologia;
                const isProcessing = processingPostId === post.id;
                const { metadata } = post;

                // Cálculo proporcional para a barra visual de breakdown
                const aff = Math.max(0, metadata.breakdown.affinity_points);
                const pop = Math.max(0, metadata.breakdown.popularity_points);
                const rec = Math.max(0, metadata.breakdown.recency_points);
                const totalRaw = aff + pop + rec || 1;

                const affPercent = (aff / totalRaw) * 100;
                const popPercent = (pop / totalRaw) * 100;
                const recPercent = (rec / totalRaw) * 100;

                const hasPenalty = metadata.penalty_applied !== 0;

                return (
                  <article
                    key={post.id}
                    className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
                      metadata.is_exploration_slot
                        ? "border-amber-400/80 bg-[#121212] shadow-[0_0_25px_rgba(251,191,36,0.15)]"
                        : "border-[#262626] bg-[#121212] hover:border-zinc-700"
                    }`}
                  >
                    {/* Header do Card estilo Instagram */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#262626] px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {/* Avatar com anel gradiente Instagram */}
                        <div className="rounded-full bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] p-[2px]">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                            {post.author.display_name
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-white">
                              {post.author.display_name}
                            </span>
                            {/* Selo Verificado estilo Meta */}
                            <span
                              title="Criador Verificado Meta"
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0095F6] text-[10px] font-black text-white"
                            >
                              ✓
                            </span>
                            <span className="text-xs text-[#A8A8A8]">
                              • #{index + 1} no ranking
                            </span>
                          </div>
                          <p className="text-xs text-[#A8A8A8]">
                            @{post.author.username}
                          </p>
                        </div>
                      </div>

                      {/* Badges de Categoria e Furo de Bolha */}
                      <div className="flex flex-wrap items-center gap-2">
                        {metadata.is_exploration_slot && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-400/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-amber-300 shadow-sm">
                            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                            Furo de Bolha (Exploração)
                          </span>
                        )}

                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${style.badge}`}
                        >
                          <span>{style.emoji}</span>
                          {post.category}
                        </span>
                      </div>
                    </div>

                    {/* Corpo do Post (Canvas Visual estilo Instagram) */}
                    <div className="relative bg-gradient-to-b from-[#181818] to-[#121212] px-6 py-7">
                      <h3 className="text-xl font-extrabold leading-snug text-white sm:text-2xl">
                        {post.title}
                      </h3>
                      <p className="mt-3 text-base leading-relaxed text-zinc-200">
                        {post.content}
                      </p>

                      {/* Métricas brutas do Post */}
                      <div className="mt-5 flex items-center gap-4 text-xs font-semibold text-[#A8A8A8]">
                        <span className="inline-flex items-center gap-1.5 text-zinc-300">
                          <Flame className="h-4 w-4 text-orange-400" />
                          {post.likes.toLocaleString("pt-BR")} curtidas globais
                        </span>
                        <span>•</span>
                        <span>
                          Recência:{" "}
                          <strong className="text-zinc-200">
                            {Math.round(post.recency_score)}/100
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Barra de Ações (Botões Grandes e Claros para Estande) */}
                    <div className="grid grid-cols-3 gap-3 border-t border-[#262626] bg-[#161616] px-5 py-3.5">
                      {/* Botão Pular (Skip) */}
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() =>
                          handleInteraction(post.id, post.category, "SKIP")
                        }
                        className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/70 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-700 active:scale-[0.98] disabled:opacity-50"
                      >
                        <FastForward className="h-5 w-5 text-zinc-300" />
                        <span>Pular</span>
                      </button>

                      {/* Botão Curtir (Like +5 pts) */}
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() =>
                          handleInteraction(post.id, post.category, "LIKE")
                        }
                        className="flex items-center justify-center gap-2 rounded-xl border border-[#ED4956]/50 bg-[#ED4956]/15 px-4 py-3 text-sm font-bold text-[#ff6b78] transition hover:border-[#ED4956] hover:bg-[#ED4956] hover:text-white active:scale-[0.98] disabled:opacity-50"
                      >
                        <Heart className="h-5 w-5 fill-current" />
                        <span>Curtir (+5 pts)</span>
                      </button>

                      {/* Botão Repost (Repostar +10 pts) */}
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() =>
                          handleInteraction(post.id, post.category, "SAVE")
                        }
                        className="flex items-center justify-center gap-2 rounded-xl border border-[#0095F6]/50 bg-gradient-to-r from-[#0095F6]/20 to-[#833AB4]/25 px-4 py-3 text-sm font-bold text-[#58b6ff] transition hover:border-[#0095F6] hover:from-[#0095F6] hover:to-[#833AB4] hover:text-white active:scale-[0.98] disabled:opacity-50"
                      >
                        <Repeat className="h-5 w-5 fill-current" />
                        <span>Repostar (+10 pts)</span>
                      </button>
                    </div>

                    {/* Rodapé Didático: A Mágica da Bolha Aberta */}
                    <div className="border-t border-[#262626] bg-black/80 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-[#A8A8A8]">
                            Raio-X do Algoritmo
                          </span>
                          {hasPenalty && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/50 bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                              <AlertCircle className="h-3 w-3" />
                              Penalidade de Repetição (
                              {metadata.penalty_applied > 0
                                ? `-${metadata.penalty_applied}`
                                : metadata.penalty_applied}{" "}
                              pts)
                            </span>
                          )}
                        </div>

                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs text-[#A8A8A8]">
                            Score Final Ponderado:
                          </span>
                          <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-base font-black text-emerald-400">
                            {metadata.final_score.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {/* Barra Visual Dividida: Afinidade (60%), Popularidade (25%), Recência (15%) */}
                      <div className="mt-3">
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-800 p-0.5">
                          <div
                            style={{ width: `${affPercent}%` }}
                            className="h-full bg-[#DD2A7B] transition-all duration-500"
                            title={`Afinidade: ${aff.toFixed(1)} pts`}
                          />
                          <div
                            style={{ width: `${popPercent}%` }}
                            className="h-full bg-[#0095F6] transition-all duration-500"
                            title={`Popularidade: ${pop.toFixed(1)} pts`}
                          />
                          <div
                            style={{ width: `${recPercent}%` }}
                            className="h-full bg-emerald-400 transition-all duration-500"
                            title={`Recência: ${rec.toFixed(1)} pts`}
                          />
                        </div>

                        {/* Legenda Numérica do Breakdown */}
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-[#DD2A7B]" />
                            <span className="text-[#A8A8A8]">
                              Afinidade (60%):
                            </span>
                            <strong className="font-mono text-white">
                              {metadata.breakdown.affinity_points.toFixed(1)}
                            </strong>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-[#0095F6]" />
                            <span className="text-[#A8A8A8]">
                              Popularidade (25%):
                            </span>
                            <strong className="font-mono text-white">
                              {metadata.breakdown.popularity_points.toFixed(1)}
                            </strong>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
                            <span className="text-[#A8A8A8]">
                              Recência (15%):
                            </span>
                            <strong className="font-mono text-white">
                              {metadata.breakdown.recency_points.toFixed(1)}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Explicação em linguagem natural (match_reason) */}
                      <div className="mt-3 rounded-lg border border-[#262626] bg-[#121212] px-3 py-2 text-xs text-zinc-300">
                        <span className="font-bold text-[#0095F6]">
                          Por que este post apareceu:{" "}
                        </span>
                        {metadata.match_reason}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* =====================================================================
            COLUNA DA DIREITA (5 COLUNAS): O CÉREBRO DO ALGORITMO (STICKY)
        ===================================================================== */}
        <aside className="lg:col-span-5">
          <div className="sticky top-20 space-y-6">
            {/* Card Principal das Métricas e Termômetros */}
            <div className="rounded-2xl border border-[#262626] bg-[#121212] p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-[#262626] pb-4">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight text-white">
                    Métricas do Algoritmo
                  </h2>
                  <p className="text-xs text-[#A8A8A8]">
                    Vetor de pesos do seu perfil em tempo real
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isResetting}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#262626] bg-[#262626] px-3.5 py-2 text-xs font-bold text-white transition hover:border-zinc-500 hover:bg-zinc-700 active:scale-95 disabled:opacity-50"
                >
                  <RotateCcw
                    className={`h-4 w-4 text-[#0095F6] ${
                      isResetting ? "animate-spin" : ""
                    }`}
                  />
                  <span>Resetar Simulação</span>
                </button>
              </div>

              {/* 8 Termômetros de Afinidade (0% a 100%) */}
              <div className="mt-4 space-y-3">
                {ALL_CATEGORIES.map((category) => {
                  const rawScore = profile[category] ?? 0;
                  const clampedWidth = Math.min(100, Math.max(0, rawScore));
                  const style = CATEGORY_STYLES[category];

                  const isBubble = rawScore >= 70;
                  const isSilenced = rawScore <= 29;

                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-bold text-zinc-100">
                          <span>{style.emoji}</span>
                          <span>{category}</span>
                          {isBubble && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-extrabold text-emerald-300">
                              DOMINANTE
                            </span>
                          )}
                          {isSilenced && (
                            <span className="rounded bg-rose-500/20 px-1.5 py-0.2 text-[10px] font-extrabold text-rose-300">
                              SILENCIADO
                            </span>
                          )}
                        </span>

                        <span
                          className={`font-mono text-xs font-black ${
                            isBubble
                              ? "text-emerald-400"
                              : isSilenced
                              ? "text-rose-400"
                              : "text-zinc-300"
                          }`}
                        >
                          {Math.round(rawScore)}%
                        </span>
                      </div>

                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-900 ring-1 ring-[#262626]">
                        <div
                          style={{ width: `${clampedWidth}%` }}
                          className={`h-full rounded-full bg-gradient-to-r ${style.bar} transition-all duration-500 ease-out`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Diagnóstico da Bolha (Live Insights) */}
            <div className="space-y-3.5 rounded-2xl border border-[#262626] bg-[#121212] p-5">
              <div>
                <h3 className="text-base font-extrabold text-white">
                  Diagnóstico da Bolha (Live Insights)
                </h3>
                <p className="text-xs text-[#A8A8A8]">
                  Como o algoritmo da rede social classifica você agora
                </p>
              </div>

              {/* 1. Núcleo da Bolha (Score >= 70) */}
              <div className="rounded-xl border-2 border-emerald-400/90 bg-emerald-950/20 p-3.5 shadow-[0_0_20px_rgba(16,185,129,0.18)]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-300">
                    <Flame className="h-4 w-4 text-emerald-400" />
                    Núcleo da Bolha (Score &ge; 70)
                  </span>
                  <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
                    {bubbleCore.length}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-emerald-200/80">
                  Temas que dominam seu feed e recebem prioridade máxima:
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {bubbleCore.length === 0 ? (
                    <span className="text-xs italic text-zinc-400">
                      Nenhum tema atingiu hiper-afinidade ainda. Curta ou salve
                      posts!
                    </span>
                  ) : (
                    bubbleCore.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-200"
                      >
                        {CATEGORY_STYLES[cat].emoji} {cat} (
                        {Math.round(profile[cat])}%)
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 2. Zona Neutra (Score entre 30 e 69) */}
              <div className="rounded-xl border border-slate-600 bg-zinc-900/60 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Zona Neutra (Score 30 a 69)
                  </span>
                  <span className="rounded-full bg-slate-700 px-2 py-0.5 font-mono text-xs font-bold text-slate-200">
                    {neutralZone.length}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[#A8A8A8]">
                  Conteúdos medianos em observação pelo algoritmo:
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {neutralZone.length === 0 ? (
                    <span className="text-xs italic text-zinc-500">
                      Nenhuma categoria na zona intermediária.
                    </span>
                  ) : (
                    neutralZone.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300"
                      >
                        {CATEGORY_STYLES[cat].emoji} {cat} (
                        {Math.round(profile[cat])}%)
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 3. Zona Cega / Excluídos (Score <= 29) */}
              <div className="rounded-xl border-2 border-rose-500/80 bg-rose-950/25 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-rose-300">
                    <AlertCircle className="h-4 w-4 text-rose-400" />
                    Zona Cega / Excluídos (Score &le; 29)
                  </span>
                  <span className="rounded-full bg-rose-500/20 px-2 py-0.5 font-mono text-xs font-bold text-rose-300">
                    {blindZone.length}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-rose-200/80">
                  Tópicos que o algoritmo silenciou para você (só aparecem via
                  Furo de Bolha):
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {blindZone.length === 0 ? (
                    <span className="text-xs italic text-zinc-400">
                      Nenhum tópico foi silenciado ainda.
                    </span>
                  ) : (
                    blindZone.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/50 bg-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-200"
                      >
                        {CATEGORY_STYLES[cat].emoji} {cat} (
                        {Math.round(profile[cat])}%)
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}