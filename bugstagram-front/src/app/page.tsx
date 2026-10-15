// src/app/page.tsx
"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Heart,
  FastForward,
  RotateCcw,
  Flame,
  Sparkles,
  AlertCircle,
  Bookmark,
  Repeat,
  Sliders,
  Eye,
  Compass,
  Home,
  ChevronDown,
  ChevronUp,
  Info,
  X,
  Zap,
  TrendingUp,
  CheckCircle2,
  MoreHorizontal,
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

// ============================================================================
// CONFIGURAÇÃO VISUAL DAS CATEGORIAS (CORES ORIGINAIS PRESERVADAS)
// ============================================================================
const CATEGORY_STYLES: Record<
  Category,
  {
    badge: string;
    bar: string;
    ring: string;
    emoji: string;
    canvasBg: string;
    handle: string;
  }
> = {
  Tecnologia: {
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
    bar: "from-cyan-500 to-blue-500",
    ring: "ring-cyan-400",
    emoji: "💻",
    canvasBg: "from-cyan-950/60 via-slate-950 to-black",
    handle: "dev.nexus",
  },
  Cinema: {
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/40",
    bar: "from-purple-500 to-fuchsia-500",
    ring: "ring-purple-400",
    emoji: "🎬",
    canvasBg: "from-purple-950/60 via-zinc-950 to-black",
    handle: "cine.frame",
  },
  Culinaria: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    bar: "from-amber-500 to-orange-500",
    ring: "ring-amber-400",
    emoji: "🍳",
    canvasBg: "from-amber-950/60 via-stone-950 to-black",
    handle: "chef.rustico",
  },
  Fotografia: {
    badge: "bg-pink-500/15 text-pink-300 border-pink-500/40",
    bar: "from-pink-500 to-rose-500",
    ring: "ring-pink-400",
    emoji: "📸",
    canvasBg: "from-pink-950/60 via-neutral-950 to-black",
    handle: "lente.urbana",
  },
  Animais: {
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    bar: "from-emerald-500 to-teal-500",
    ring: "ring-emerald-400",
    emoji: "🐾",
    canvasBg: "from-emerald-950/60 via-zinc-950 to-black",
    handle: "fauna.viva",
  },
  Esportes: {
    badge: "bg-lime-500/15 text-lime-300 border-lime-500/40",
    bar: "from-lime-500 to-green-500",
    ring: "ring-lime-400",
    emoji: "⚽",
    canvasBg: "from-lime-950/60 via-neutral-950 to-black",
    handle: "arena.tatica",
  },
  Carros: {
    badge: "bg-red-500/15 text-red-300 border-red-500/40",
    bar: "from-red-500 to-orange-600",
    ring: "ring-red-400",
    emoji: "🏎️",
    canvasBg: "from-red-950/60 via-zinc-950 to-black",
    handle: "gear.head",
  },
  Games: {
    badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
    bar: "from-indigo-500 to-violet-500",
    ring: "ring-indigo-400",
    emoji: "🎮",
    canvasBg: "from-indigo-950/60 via-slate-950 to-black",
    handle: "pixel.quest",
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

// Converte recency_score (0-100) em tempo relativo natural estilo Instagram
function formatRelativeTime(recencyScore: number): string {
  const clamped = Math.max(0, Math.min(100, recencyScore));
  if (clamped >= 95) return "há poucos minutos";
  if (clamped >= 80) return `há ${Math.max(5, Math.round((100 - clamped) * 2))} min`;
  if (clamped >= 50) return `há ${Math.max(1, Math.round((90 - clamped) / 10))} h`;
  return `há ${Math.max(1, Math.round((100 - clamped) / 20))} d`;
}

// Suporte opcional caso o backend envie mediaUrl no futuro
type ExtendedPost = ScoredPost & {
  mediaUrl?: string;
};

interface SessionTelemetry {
  totalInteractions: number;
  likes: number;
  saves: number;
  skips: number;
  interactedCategories: Partial<Record<Category, number>>;
}

// ============================================================================
// SUBCOMPONENTE: MODAL DE STORY INTERATIVO
// ============================================================================
function StoryViewerModal({
  category,
  score,
  onClose,
}: {
  category: Category;
  score: number;
  onClose: () => void;
}) {
  const style = CATEGORY_STYLES[category];
  const isBubble = score >= 70;
  const isBlind = score <= 29;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[#262626] bg-[#121212] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de progresso simulada de Story */}
        <div className="flex gap-1 px-3 pt-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-full bg-white" />
          </div>
        </div>

        {/* Header do Story */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] p-[2px]">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-base">
                {style.emoji}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-white">@{style.handle}</p>
              <p className="text-[11px] text-[#A8A8A8]">Canal de {category}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo Visual do Story */}
        <div
          className={`flex min-h-[340px] flex-col items-center justify-center bg-gradient-to-b ${style.canvasBg} px-6 py-10 text-center`}
        >
          <span className="mb-3 text-6xl">{style.emoji}</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${style.badge}`}
          >
            {category}
          </span>

          <div className="mt-6 w-full rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-md">
            <p className="text-xs uppercase tracking-wider text-[#A8A8A8]">
              Nível de Afinidade no seu Perfil
            </p>
            <p className="mt-1 font-mono text-3xl font-black text-white">
              {Math.round(score)}%
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                className={`h-full rounded-full bg-gradient-to-r ${style.bar}`}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-300">
              {isBubble
                ? "🔥 Este tema faz parte do Núcleo da sua Bolha. O algoritmo prioriza publicações deste criador no topo do seu feed."
                : isBlind
                ? "🔇 Este tema está na sua Zona Cega. Ele foi silenciado por falta de engajamento e só aparece via Furo de Bolha."
                : "⚖️ Este tema está na Zona Neutra. Curta ou salve publicações de " +
                  category +
                  " no feed para trazê-lo para sua bolha."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUBCOMPONENTE: CARD DE POSTAGEM ESTILO INSTAGRAM + RAIO-X SOB DEMANDA
// ============================================================================
function PostCard({
  post,
  rankIndex,
  viewMode,
  isBusy,
  isCurrentProcessing,
  userAffinity,
  onInteract,
}: {
  post: ExtendedPost;
  rankIndex: number;
  viewMode: "social" | "lab";
  isBusy: boolean;
  isCurrentProcessing: boolean;
  userAffinity: number;
  onInteract: (postId: string, category: Category, action: ActionType) => void;
}) {
  const [isXRayOpen, setIsXRayOpen] = useState<boolean>(viewMode === "lab");
  const [showHeartBurst, setShowHeartBurst] = useState<boolean>(false);

  // Sincroniza abertura automática quando o usuário alterna entre Modo Social e Modo Lab
  useEffect(() => {
    setIsXRayOpen(viewMode === "lab");
  }, [viewMode]);

  const style = CATEGORY_STYLES[post.category] || CATEGORY_STYLES.Tecnologia;
  const { metadata } = post;

  // Cálculo proporcional da participação dos pontos no score bruto
  const aff = Math.max(0, metadata.breakdown.affinity_points);
  const pop = Math.max(0, metadata.breakdown.popularity_points);
  const rec = Math.max(0, metadata.breakdown.recency_points);
  const totalRaw = aff + pop + rec || 1;

  const affPercent = (aff / totalRaw) * 100;
  const popPercent = (pop / totalRaw) * 100;
  const recPercent = (rec / totalRaw) * 100;
  const hasPenalty = metadata.penalty_applied !== 0;
  const isHighAffinityAuthor = userAffinity >= 70;

  const handleDoubleTapLike = () => {
    if (isBusy) return;
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 750);
    onInteract(post.id, post.category, "LIKE");
  };

  return (
    <article
      className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
        metadata.is_exploration_slot && viewMode === "lab"
          ? "border-amber-400/80 bg-[#121212] shadow-[0_0_25px_rgba(251,191,36,0.12)]"
          : "border-[#262626] bg-[#121212]"
      } ${isCurrentProcessing ? "opacity-75 ring-1 ring-[#0095F6]" : ""}`}
    >
      {/* 1. CABEÇALHO DO POST */}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Avatar com Anel de Story se estiver na bolha */}
          <div
            className={`rounded-full p-[2px] ${
              isHighAffinityAuthor
                ? "bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4]"
                : "bg-[#262626]"
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
              {post.author.display_name.slice(0, 2).toUpperCase()}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-bold text-white">
                {post.author.username}
              </span>
              <span
                title="Criador Verificado"
                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#0095F6] text-[9px] font-black text-white"
              >
                ✓
              </span>
              <span className="text-xs text-[#A8A8A8]">
                • {formatRelativeTime(post.recency_score)}
              </span>
              {viewMode === "lab" && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-300">
                  #{rankIndex + 1}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#A8A8A8]">
              <span>{post.author.display_name}</span>
              <span>•</span>
              <span className="text-zinc-300">
                {style.emoji} {post.category}
              </span>
            </div>
          </div>
        </div>

        {/* Indicadores discretos de Exploração / Categoria */}
        <div className="flex items-center gap-2">
          {metadata.is_exploration_slot && (
            <span
              title="Conteúdo injetado pelo algoritmo para testar novos interesses fora da sua bolha atual"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                viewMode === "lab"
                  ? "border-amber-400 bg-amber-400/20 text-amber-300"
                  : "border-zinc-700 bg-zinc-800/80 text-zinc-300"
              }`}
            >
              <Sparkles className="h-3 w-3 text-amber-400" />
              {viewMode === "lab" ? "Furo de Bolha" : "Sugestão para você"}
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsXRayOpen((prev) => !prev)}
            title="Inspecionar motivos da recomendação"
            className="rounded-full p-1.5 text-[#A8A8A8] transition hover:bg-white/10 hover:text-white"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 2. ÁREA DE MÍDIA / CANVAS VISUAL (PROTAGONISMO VISUAL DO INSTAGRAM) */}
      <div
        onDoubleClick={handleDoubleTapLike}
        className={`group relative flex min-h-[260px] cursor-pointer select-none flex-col justify-between overflow-hidden border-y border-[#262626] bg-gradient-to-br ${style.canvasBg} p-6 sm:min-h-[300px] sm:p-8`}
      >
        {post.mediaUrl ? (
          // Caso a API forneça imagem real no futuro
          <img
            src={post.mediaUrl}
            alt={post.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // Efeito de luz de fundo e marca d'água da categoria
          <>
            <div className="pointer-events-none absolute -right-6 -top-6 text-[130px] opacity-[0.07] transition-transform duration-500 group-hover:scale-110">
              {style.emoji}
            </div>
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold backdrop-blur-md ${style.badge}`}
              >
                <span>{style.emoji}</span>
                {post.category}
              </span>

              <span className="text-[11px] font-medium text-white/40 opacity-0 transition group-hover:opacity-100">
                Duplo clique para curtir ♥
              </span>
            </div>

            <div className="my-auto py-4">
              <h3 className="text-xl font-extrabold leading-snug tracking-tight text-white drop-shadow-sm sm:text-2xl">
                {post.title}
              </h3>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono text-[11px] text-zinc-400/90">
                @{post.author.username}
              </span>
              {viewMode === "lab" && (
                <span className="rounded-md border border-white/10 bg-black/50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-400 backdrop-blur-sm">
                  Score: {metadata.final_score.toFixed(1)}
                </span>
              )}
            </div>
          </>
        )}

        {/* Animação de Coração no Duplo Clique */}
        {showHeartBurst && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
            <Heart className="h-24 w-24 animate-ping fill-[#ED4956] text-[#ED4956] drop-shadow-lg" />
          </div>
        )}
      </div>

      {/* 3. BARRA DE AÇÕES COMPACTA (ESTILO INSTAGRAM + SIMULADOR) */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-between gap-2">
          {/* Ações Primárias Esquerda: Curtir, Inspecionar Algoritmo */}
          <div className="flex items-center gap-2">
            {/* Botão Curtir (LIKE) */}
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onInteract(post.id, post.category, "LIKE")}
              title="Curtir publicação (+5 pts de afinidade no tema)"
              className="group flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-2 text-sm font-semibold text-white transition hover:border-[#ED4956]/40 hover:bg-[#ED4956]/10 hover:text-[#ff6b78] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Heart className="h-6 w-6 transition group-hover:fill-[#ED4956] group-hover:text-[#ED4956]" />
              <span className="text-xs font-bold">Curtir</span>
              {viewMode === "lab" && (
                <span className="rounded bg-[#ED4956]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#ff6b78]">
                  +5
                </span>
              )}
            </button>

            {/* Botão Salvar (SAVE) */}
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onInteract(post.id, post.category, "SAVE")}
              title="Repostar publicação (+10 pts de super-afinidade no tema)"
              className="group flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-2 text-sm font-semibold text-white transition hover:border-[#0095F6]/40 hover:bg-[#0095F6]/10 hover:text-[#58b6ff] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Repeat className="h-6 w-6 transition group-hover:fill-[#0095F6] group-hover:text-[#0095F6]" />
              <span className="text-xs font-bold">Repostar</span>
              {viewMode === "lab" && (
                <span className="rounded bg-[#0095F6]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#58b6ff]">
                  +10
                </span>
              )}
            </button>
          </div>

          {/* Ações Direita: Pular Post e Botão Raio-X */}
          <div className="flex items-center gap-2">
            {/* Botão Pular / Sem Interesse (SKIP) */}
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onInteract(post.id, post.category, "SKIP")}
              title="Pular publicação (Sinal de desinteresse / Penalidade)"
              className="flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#1a1a1a] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FastForward className="h-4 w-4 text-zinc-400" />
              <span>Pular</span>
            </button>

            {/* Toggle do Raio-X da Recomendação */}
            <button
              type="button"
              onClick={() => setIsXRayOpen((prev) => !prev)}
              className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
                isXRayOpen
                  ? "border-[#0095F6]/50 bg-[#0095F6]/15 text-[#0095F6]"
                  : "border-[#262626] bg-transparent text-[#A8A8A8] hover:text-white"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Raio-X</span>
              {isXRayOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Contagem de Curtidas */}
        <div className="mt-2.5 flex items-center gap-2 text-xs font-bold text-white">
          <span>{post.likes.toLocaleString("pt-BR")} curtidas</span>
          {viewMode === "lab" && (
            <span className="font-normal text-[#A8A8A8]">
              • Recência bruta: {Math.round(post.recency_score)}/100
            </span>
          )}
        </div>

        {/* Legenda Estilo Instagram (Username + Texto) */}
        <div className="mt-1.5 text-sm leading-relaxed text-zinc-200">
          <span className="mr-2 font-bold text-white">
            {post.author.username}
          </span>
          <span>{post.content}</span>
        </div>

        {/* Botão de Transparência no Modo Social quando o Raio-X está fechado */}
        {!isXRayOpen && (
          <button
            type="button"
            onClick={() => setIsXRayOpen(true)}
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#A8A8A8] transition hover:text-[#0095F6]"
          >
            <Info className="h-3.5 w-3.5" />
            <span>Por que estou vendo esta publicação?</span>
          </button>
        )}
      </div>

      {/* 4. GAVETA DE RAIO-X DO ALGORITMO (TRANSPARÊNCIA EDUCACIONAL) */}
      {isXRayOpen && (
        <div className="border-t border-[#262626] bg-[#0a0a0a] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0095F6]">
                Raio-X da Recomendação
              </span>
              {hasPenalty && (
                <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/50 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                  <AlertCircle className="h-3 w-3" />
                  Penalidade:{" "}
                  {metadata.penalty_applied > 0
                    ? `-${metadata.penalty_applied}`
                    : metadata.penalty_applied}{" "}
                  pts
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#A8A8A8]">
                Score Final Ponderado:
              </span>
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-sm font-black text-emerald-400">
                {metadata.final_score.toFixed(1)}
              </span>
            </div>
          </div>

          {/* Barra de Participação Efetiva neste Post vs Pesos do Motor */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-[#A8A8A8]">
              <span>Composição dos pontos obtidos neste post:</span>
              <span>Pesos fixos do motor: 60% / 25% / 15%</span>
            </div>

            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800 p-0.5">
              <div
                style={{ width: `${affPercent}%` }}
                className="h-full bg-[#DD2A7B] transition-all duration-500"
                title={`Afinidade: ${aff.toFixed(1)} pts (${Math.round(affPercent)}% do score positivo)`}
              />
              <div
                style={{ width: `${popPercent}%` }}
                className="h-full bg-[#0095F6] transition-all duration-500"
                title={`Popularidade: ${pop.toFixed(1)} pts (${Math.round(popPercent)}% do score positivo)`}
              />
              <div
                style={{ width: `${recPercent}%` }}
                className="h-full bg-emerald-400 transition-all duration-500"
                title={`Recência: ${rec.toFixed(1)} pts (${Math.round(recPercent)}% do score positivo)`}
              />
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-lg border border-[#262626] bg-[#121212] p-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#DD2A7B]" />
                  <span className="font-semibold text-zinc-300">Afinidade</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[10px] text-[#A8A8A8]">Peso 60%</span>
                  <strong className="font-mono text-xs text-white">
                    +{aff.toFixed(1)} pts
                  </strong>
                </div>
              </div>

              <div className="rounded-lg border border-[#262626] bg-[#121212] p-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#0095F6]" />
                  <span className="font-semibold text-zinc-300">
                    Popularidade
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[10px] text-[#A8A8A8]">Peso 25%</span>
                  <strong className="font-mono text-xs text-white">
                    +{pop.toFixed(1)} pts
                  </strong>
                </div>
              </div>

              <div className="rounded-lg border border-[#262626] bg-[#121212] p-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-semibold text-zinc-300">Recência</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[10px] text-[#A8A8A8]">Peso 15%</span>
                  <strong className="font-mono text-xs text-white">
                    +{rec.toFixed(1)} pts
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Explicação em linguagem natural (match_reason) */}
          <div className="mt-3 rounded-lg border border-[#262626] bg-[#121212] px-3 py-2 text-xs text-zinc-300">
            <span className="font-bold text-[#0095F6]">
              Diagnóstico do Motor:{" "}
            </span>
            {metadata.match_reason}
          </div>
        </div>
      )}
    </article>
  );
}

// ============================================================================
// PÁGINA PRINCIPAL: BUGSTAGRAM (SINGLE FILE APP.TSX)
// ============================================================================
export default function BugstagramPage() {
  const [feed, setFeed] = useState<ExtendedPost[]>([]);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [processingPostId, setProcessingPostId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Novos estados de Experiência e Telemetria
  const [viewMode, setViewMode] = useState<"social" | "lab">("social");
  const [activeMobileTab, setActiveMobileTab] = useState<"feed" | "lab">("feed");
  const [selectedStoryCategory, setSelectedStoryCategory] =
    useState<Category | null>(null);

  const [toast, setToast] = useState<{
    title: string;
    subtitle: string;
    type: "info" | "error";
  } | null>(null);

  const [telemetry, setTelemetry] = useState<SessionTelemetry>({
    totalInteractions: 0,
    likes: 0,
    saves: 0,
    skips: 0,
    interactedCategories: {},
  });

  // Trava global para impedir race conditions entre interações e reset
  const isBusy = Boolean(processingPostId) || isResetting || isLoading;

  const showToast = useCallback(
    (title: string, subtitle: string, type: "info" | "error" = "info") => {
      setToast({ title, subtitle, type });
    },
    []
  );

  // Auto-dismiss para toasts informativos
  useEffect(() => {
    if (!toast || toast.type === "error") return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

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
      showToast("API Go Offline", message, "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleInteraction = async (
    postId: string,
    category: Category,
    action: ActionType
  ) => {
    if (isBusy) return;
    setProcessingPostId(postId);
    setApiError(null);

    const deltaLabel: Record<ActionType, string> = {
      LIKE: "Curtida registrada (+5 pts em " + category + ")",
      SAVE: "Repostado (+10 pts em " + category + ")",
      SKIP: "Post pulado (Sinal de desinteresse em " + category + ")",
    };

    try {
      const updated = await interact(postId, category, action);
      setProfile(updated.profile);
      setFeed(updated.feed);

      // Atualiza telemetria real da sessão
      setTelemetry((prev) => ({
        totalInteractions: prev.totalInteractions + 1,
        likes: prev.likes + (action === "LIKE" ? 1 : 0),
        saves: prev.saves + (action === "SAVE" ? 1 : 0),
        skips: prev.skips + (action === "SKIP" ? 1 : 0),
        interactedCategories: {
          ...prev.interactedCategories,
          [category]:
            (prev.interactedCategories[category] ?? 0) +
            (action === "SKIP" ? 0 : 1),
        },
      }));

      showToast(
        `${CATEGORY_STYLES[category].emoji} ${category}`,
        deltaLabel[action],
        "info"
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao registrar interação na API Go.";
      setApiError(message);
      showToast("Erro de Comunicação com a API", message, "error");
    } finally {
      setProcessingPostId(null);
    }
  };

  const handleReset = async () => {
    if (isBusy) return;
    setIsResetting(true);
    setApiError(null);
    try {
      const resetData = await resetSimulation();
      setProfile(resetData.profile);
      setFeed(resetData.feed);
      setTelemetry({
        totalInteractions: 0,
        likes: 0,
        saves: 0,
        skips: 0,
        interactedCategories: {},
      });
      showToast(
        "Simulação Reiniciada",
        "Todos os pesos voltaram para 50% (estado neutro).",
        "info"
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao resetar simulação na API Go.";
      setApiError(message);
      showToast("Falha ao Resetar", message, "error");
    } finally {
      setIsResetting(false);
    }
  };

  // Segmentação automática para o Diagnóstico da Bolha
  const bubbleCore = useMemo(
    () => ALL_CATEGORIES.filter((cat) => (profile[cat] ?? 0) >= 70),
    [profile]
  );
  const neutralZone = useMemo(
    () =>
      ALL_CATEGORIES.filter(
        (cat) => (profile[cat] ?? 0) >= 30 && (profile[cat] ?? 0) <= 69
      ),
    [profile]
  );
  const blindZone = useMemo(
    () => ALL_CATEGORIES.filter((cat) => (profile[cat] ?? 0) <= 29),
    [profile]
  );

  // Métricas mensuráveis de exploração no feed atual
  const explorationCount = useMemo(
    () => feed.filter((p) => p.metadata.is_exploration_slot).length,
    [feed]
  );
  const explorationRatio =
    feed.length > 0 ? Math.round((explorationCount / feed.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-black pb-16 text-white selection:bg-pink-500 selection:text-white lg:pb-0">
      {/* =====================================================================
          TOAST FLUTUANTE NÃO-INTRUSIVO (SUBSTITUI WINDOW.ALERT)
      ===================================================================== */}
      {toast && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm animate-in fade-in slide-in-from-bottom-4 lg:bottom-6 lg:right-6">
          <div
            className={`flex items-start gap-3 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md ${
              toast.type === "error"
                ? "border-rose-500/60 bg-rose-950/90 text-rose-100"
                : "border-[#262626] bg-[#161616]/95 text-white"
            }`}
          >
            {toast.type === "error" ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0095F6]" />
            )}
            <div className="flex-1 text-xs">
              <p className="font-bold">{toast.title}</p>
              <p className="mt-0.5 text-zinc-300">{toast.subtitle}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Story quando um círculo é clicado */}
      {selectedStoryCategory && (
        <StoryViewerModal
          category={selectedStoryCategory}
          score={profile[selectedStoryCategory] ?? 50}
          onClose={() => setSelectedStoryCategory(null)}
        />
      )}

      {/* =====================================================================
          TOPBAR LIMPA E FOCADA
      ===================================================================== */}
      <header className="sticky top-0 z-40 border-b border-[#262626] bg-black/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Identidade da Marca */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] p-0.5 shadow-md shadow-pink-500/10">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-black">
                <Sparkles className="h-5 w-5 text-[#DD2A7B]" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">
                  Bugstagram
                </h1>
                <span className="hidden rounded-full border border-[#262626] bg-[#121212] px-2.5 py-0.5 text-[10px] font-semibold text-[#A8A8A8] sm:inline-block">
                  Simulador de Recomendação
                </span>
              </div>
            </div>
          </div>

          {/* Seletor Central: Modo Social vs Modo Laboratório */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-[#262626] bg-[#121212] p-1">
              <button
                type="button"
                onClick={() => setViewMode("social")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === "social"
                    ? "bg-white text-black shadow-sm"
                    : "text-[#A8A8A8] hover:text-white"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Modo Social</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("lab")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === "lab"
                    ? "bg-[#0095F6] text-white shadow-sm"
                    : "text-[#A8A8A8] hover:text-white"
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Modo Lab</span>
              </button>
            </div>

            {/* Indicador Discreto da Engine Go */}
            <div
              title={
                apiError
                  ? `Erro: ${apiError}`
                  : "Conectado ao motor Go na porta 8080"
              }
              className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex ${
                apiError
                  ? "border-rose-500/50 bg-rose-950/40 text-rose-300"
                  : "border-[#262626] bg-[#121212] text-zinc-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  apiError ? "bg-rose-500" : "animate-pulse bg-emerald-400"
                }`}
              />
              <span>{apiError ? "API Offline" : "Go Engine"}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Banner de Erro de Conexão (Integrado, sem window.alert) */}
      {apiError && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-rose-500/60 bg-rose-950/30 p-4 text-rose-100 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 shrink-0 text-rose-400" />
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                  Servidor Go Inacessível (http://localhost:8080)
                </h2>
                <p className="text-xs text-rose-200">{apiError}</p>
              </div>
            </div>
            <button
              onClick={loadInitialData}
              disabled={isLoading}
              className="shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-500 disabled:opacity-50"
            >
              Tentar Reconectar
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          ESTRUTURA EM 3 COLUNAS ESTILO INSTAGRAM WEB:
          [Sidebar Nav (2 col)] + [Feed Social Central (6 col)] + [Laboratório (4 col)]
      ===================================================================== */}
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
        {/* COLUNA 1: NAVEGAÇÃO LATERAL DESKTOP (2 COLUNAS) */}
        <nav className="hidden lg:col-span-2 lg:block">
          <div className="sticky top-20 flex flex-col justify-between space-y-6 rounded-2xl border border-[#262626] bg-[#121212] p-4">
            <div className="space-y-1.5">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#A8A8A8]">
                Navegação
              </p>

              <button
                type="button"
                onClick={() => setViewMode("social")}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                  viewMode === "social"
                    ? "bg-white/10 text-white"
                    : "text-[#A8A8A8] hover:bg-white/5 hover:text-white"
                }`}
              >
                <Home className="h-5 w-5" />
                <span>Feed Social</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("lab")}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                  viewMode === "lab"
                    ? "bg-[#0095F6]/15 text-[#0095F6]"
                    : "text-[#A8A8A8] hover:bg-white/5 hover:text-white"
                }`}
              >
                <Compass className="h-5 w-5" />
                <span>Raio-X Total</span>
              </button>
            </div>

            {/* Resumo Rápido de Interações na Sidebar */}
            <div className="border-t border-[#262626] pt-4">
              <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#A8A8A8]">
                Sua Sessão
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <div className="rounded-lg bg-black/60 p-1.5">
                  <p className="font-mono text-xs font-bold text-[#ff6b78]">
                    {telemetry.likes}
                  </p>
                  <p className="text-[9px] text-[#A8A8A8]">Likes</p>
                </div>
                <div className="rounded-lg bg-black/60 p-1.5">
                  <p className="font-mono text-xs font-bold text-[#58b6ff]">
                    {telemetry.saves}
                  </p>
                  <p className="text-[9px] text-[#A8A8A8]">Salvos</p>
                </div>
                <div className="rounded-lg bg-black/60 p-1.5">
                  <p className="font-mono text-xs font-bold text-zinc-400">
                    {telemetry.skips}
                  </p>
                  <p className="text-[9px] text-[#A8A8A8]">Pulos</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                disabled={isBusy}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#262626] bg-[#1a1a1a] px-3 py-2.5 text-xs font-bold text-white transition hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw
                  className={`h-3.5 w-3.5 text-[#0095F6] ${
                    isResetting ? "animate-spin" : ""
                  }`}
                />
                <span>{isResetting ? "Resetando..." : "Zerar Bolha"}</span>
              </button>
            </div>
          </div>
        </nav>

        {/* =====================================================================
            COLUNA 2: FEED SOCIAL CENTRAL (6 COLUNAS NO DESKTOP)
        ===================================================================== */}
        <section
          className={`mx-auto w-full max-w-xl space-y-6 lg:col-span-6 ${
            activeMobileTab === "lab" ? "hidden lg:block" : "block"
          }`}
        >
          {/* FAIXA HORIZONTAL DE STORIES (CRIADORES FICTÍCIOS + PULSO DE AFINIDADE) */}
          <div className="rounded-2xl border border-[#262626] bg-[#121212] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200">
                {viewMode === "social"
                  ? "Stories de Criadores"
                  : "Stories • Pulso de Afinidade por Categoria"}
              </span>
              <span className="text-[11px] text-[#A8A8A8]">
                Toque para inspecionar
              </span>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-1">
              {ALL_CATEGORIES.map((category) => {
                const score = Math.round(profile[category] ?? 0);
                const isHigh = score >= 70;
                const isBlind = score <= 29;
                const style = CATEGORY_STYLES[category];

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedStoryCategory(category)}
                    className={`group flex shrink-0 flex-col items-center gap-1.5 transition ${
                      isBlind ? "opacity-45 grayscale hover:opacity-80" : ""
                    }`}
                  >
                    <div
                      className={`rounded-full p-[2.5px] transition-transform group-hover:scale-105 ${
                        isHigh
                          ? "bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] shadow-md shadow-pink-500/20"
                          : "bg-[#262626]"
                      }`}
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-[#181818] text-2xl">
                        {style.emoji}
                      </div>
                    </div>

                    <span className="max-w-[72px] truncate text-[11px] font-medium text-zinc-200">
                      {viewMode === "social" ? style.handle : category}
                    </span>

                    {viewMode === "lab" && (
                      <span
                        className={`font-mono text-[10px] font-bold ${
                          isHigh
                            ? "text-emerald-400"
                            : isBlind
                            ? "text-rose-400"
                            : "text-[#A8A8A8]"
                        }`}
                      >
                        {score}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* LISTA DE PUBLICAÇÕES OU SKELETON / EMPTY STATE */}
          {isLoading ? (
            <div className="space-y-6">
              {[1, 2].map((skeleton) => (
                <div
                  key={skeleton}
                  className="h-[420px] animate-pulse rounded-2xl border border-[#262626] bg-[#121212] p-6"
                />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[#262626] bg-[#121212] px-6 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] p-0.5">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#121212]">
                  <RotateCcw className="h-7 w-7 text-white" />
                </div>
              </div>
              <h2 className="text-xl font-extrabold text-white">
                Você chegou ao fim do Feed!
              </h2>
              <p className="mt-2 max-w-md text-sm text-[#A8A8A8]">
                Todos os posts disponíveis nesta sessão foram processados.
                Reinicie a simulação para testar outro comportamento de bolha.
              </p>
              <button
                onClick={handleReset}
                disabled={isBusy}
                className="mt-6 flex items-center gap-2 rounded-xl bg-[#0095F6] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#0095F6]/25 transition hover:bg-[#1877F2] disabled:opacity-50"
              >
                <RotateCcw
                  className={`h-4 w-4 ${isResetting ? "animate-spin" : ""}`}
                />
                {isResetting ? "Resetando..." : "Reiniciar Simulação"}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {feed.map((post, index) => (
                <PostCard
                  key={post.id}
                  post={post}
                  rankIndex={index}
                  viewMode={viewMode}
                  isBusy={isBusy}
                  isCurrentProcessing={processingPostId === post.id}
                  userAffinity={profile[post.category] ?? 50}
                  onInteract={handleInteraction}
                />
              ))}
            </div>
          )}
        </section>

        {/* =====================================================================
            COLUNA 3: LABORATÓRIO / CÉREBRO DO ALGORITMO (4 COLUNAS NO DESKTOP)
            Métricas coloridas originais preservadas!
        ===================================================================== */}
        <aside
          className={`lg:col-span-4 ${
            activeMobileTab === "feed" ? "hidden lg:block" : "block"
          }`}
        >
          <div className="sticky top-20 space-y-5">
            {/* CARD 1: TELEMETRIA DE EXPLORAÇÃO E COMPOSIÇÃO DO FEED */}
            <div className="rounded-2xl border border-[#262626] bg-[#121212] p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-white">
                  <TrendingUp className="h-4 w-4 text-[#0095F6]" />
                  Composição do Feed Atual
                </span>
                <span className="font-mono text-xs text-[#A8A8A8]">
                  {feed.length} posts
                </span>
              </div>

              <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-900">
                <div
                  style={{ width: `${100 - explorationRatio}%` }}
                  className="bg-[#0095F6] transition-all duration-500"
                  title="Recomendado por Afinidade"
                />
                <div
                  style={{ width: `${explorationRatio}%` }}
                  className="bg-amber-400 transition-all duration-500"
                  title="Injetado via Furo de Bolha (Exploração)"
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-zinc-300">
                  <strong className="text-[#0095F6]">
                    {100 - explorationRatio}%
                  </strong>{" "}
                  Afinidade
                </span>
                <span className="text-zinc-300">
                  <strong className="text-amber-400">
                    {explorationRatio}%
                  </strong>{" "}
                  Exploração ({explorationCount} furo
                  {explorationCount === 1 ? "" : "s"})
                </span>
              </div>

              {telemetry.totalInteractions > 0 && (
                <p className="mt-3 rounded-xl border border-[#262626] bg-black/50 p-2.5 text-[11px] leading-relaxed text-zinc-300">
                  <Zap className="mr-1 inline h-3.5 w-3.5 text-amber-400" />
                  Após <strong>{telemetry.totalInteractions}</strong>{" "}
                  interações, você tem{" "}
                  <strong className="text-emerald-400">
                    {bubbleCore.length}
                  </strong>{" "}
                  tema(s) dominante(s) e{" "}
                  <strong className="text-rose-400">{blindZone.length}</strong>{" "}
                  silenciado(s).
                </p>
              )}
            </div>

            {/* CARD 2: OS 8 TERMÔMETROS COLORIDOS DE AFINIDADE */}
            <div className="rounded-2xl border border-[#262626] bg-[#121212] p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-[#262626] pb-3.5">
                <div>
                  <h2 className="text-base font-extrabold tracking-tight text-white">
                    Métricas do Algoritmo
                  </h2>
                  <p className="text-xs text-[#A8A8A8]">
                    Vetor de pesos do seu perfil em tempo real
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#262626] bg-[#262626] px-3 py-1.5 text-xs font-bold text-white transition hover:border-zinc-500 hover:bg-zinc-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw
                    className={`h-3.5 w-3.5 text-[#0095F6] ${
                      isResetting ? "animate-spin" : ""
                    }`}
                  />
                  <span>Resetar</span>
                </button>
              </div>

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

            {/* CARD 3: DIAGNÓSTICO DA BOLHA (NÚCLEO, NEUTRA, ZONA CEGA) */}
            <div className="space-y-3 rounded-2xl border border-[#262626] bg-[#121212] p-5">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Diagnóstico da Bolha (Live Insights)
                </h3>
                <p className="text-xs text-[#A8A8A8]">
                  Como o algoritmo classifica seu perfil agora
                </p>
              </div>

              {/* 1. Núcleo da Bolha (Score >= 70) */}
              <div className="rounded-xl border border-emerald-400/80 bg-emerald-950/20 p-3 shadow-[0_0_15px_rgba(16,185,129,0.12)]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-300">
                    <Flame className="h-4 w-4 text-emerald-400" />
                    Núcleo da Bolha (&ge; 70%)
                  </span>
                  <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
                    {bubbleCore.length}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {bubbleCore.length === 0 ? (
                    <span className="text-xs italic text-zinc-400">
                      Nenhum tema dominante ainda. Curta ou salve posts!
                    </span>
                  ) : (
                    bubbleCore.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-200"
                      >
                        {CATEGORY_STYLES[cat].emoji} {cat} (
                        {Math.round(profile[cat])}%)
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 2. Zona Neutra (Score entre 30 e 69) */}
              <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">
                    Zona Neutra (30% a 69%)
                  </span>
                  <span className="rounded-full bg-zinc-700 px-2 py-0.5 font-mono text-xs font-bold text-zinc-200">
                    {neutralZone.length}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {neutralZone.length === 0 ? (
                    <span className="text-xs italic text-zinc-500">
                      Nenhuma categoria na zona intermediária.
                    </span>
                  ) : (
                    neutralZone.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-300"
                      >
                        {CATEGORY_STYLES[cat].emoji} {cat} (
                        {Math.round(profile[cat])}%)
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 3. Zona Cega / Excluídos (Score <= 29) */}
              <div className="rounded-xl border border-rose-500/80 bg-rose-950/25 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-rose-300">
                    <AlertCircle className="h-4 w-4 text-rose-400" />
                    Zona Cega (&le; 29%)
                  </span>
                  <span className="rounded-full bg-rose-500/20 px-2 py-0.5 font-mono text-xs font-bold text-rose-300">
                    {blindZone.length}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {blindZone.length === 0 ? (
                    <span className="text-xs italic text-zinc-400">
                      Nenhum tópico foi silenciado ainda.
                    </span>
                  ) : (
                    blindZone.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/50 bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-200"
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

      {/* =====================================================================
          BARRA DE NAVEGAÇÃO INFERIOR PARA CELULAR (ESTILO APP DO INSTAGRAM)
      ===================================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-[#262626] bg-black/95 py-2.5 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setActiveMobileTab("feed")}
          className={`flex flex-col items-center gap-1 text-xs font-bold ${
            activeMobileTab === "feed" ? "text-white" : "text-[#A8A8A8]"
          }`}
        >
          <Home className="h-5 w-5" />
          <span>Feed</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setViewMode((prev) => (prev === "social" ? "lab" : "social"))
          }
          className={`flex flex-col items-center gap-1 text-xs font-bold ${
            viewMode === "lab" ? "text-[#0095F6]" : "text-[#A8A8A8]"
          }`}
        >
          <Sliders className="h-5 w-5" />
          <span>{viewMode === "lab" ? "Modo Lab ON" : "Raio-X"}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMobileTab("lab")}
          className={`flex flex-col items-center gap-1 text-xs font-bold ${
            activeMobileTab === "lab" ? "text-emerald-400" : "text-[#A8A8A8]"
          }`}
        >
          <Flame className="h-5 w-5" />
          <span>Métricas ({bubbleCore.length})</span>
        </button>
      </nav>
    </div>
  );
}