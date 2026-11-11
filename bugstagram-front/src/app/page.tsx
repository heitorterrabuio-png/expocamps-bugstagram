// src/app/page.tsx
"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  Heart,
  FastForward,
  RotateCcw,
  Flame,
  Sparkles,
  AlertCircle,
  Send,
  Sliders,
  Compass,
  Home,
  X,
  TrendingUp,
  CheckCircle2,
  MoreHorizontal,
  Sun,
  Moon,
  Bookmark,
  MessageCircle,
  BarChart3,
  Eye,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useViewMode } from "@/context/ViewModeContext";
import {
  ActionType,
  ALL_CATEGORIES,
  Category,
  GlobalTrendingPost,
  ScoredPost,
  UserProfile,
} from "@/types";
import {
  getFeed,
  getGlobalMetrics,
  getProfileState,
  interact,
  loadSessionSnapshot,
  resetSimulation,
  saveSessionSnapshot,
  syncSessionState,
} from "@/services/api";

// ============================================================================
// CONFIGURAÇÃO VISUAL DAS CATEGORIAS
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
    badge:
      "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30",
    bar: "from-blue-500 to-cyan-400",
    ring: "ring-blue-500",
    emoji: "💻",
    canvasBg: "from-blue-950 via-slate-900 to-zinc-950",
    handle: "tech.daily",
  },
  Cinema: {
    badge:
      "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
    bar: "from-purple-500 to-fuchsia-500",
    ring: "ring-purple-500",
    emoji: "🎬",
    canvasBg: "from-purple-950 via-zinc-900 to-black",
    handle: "cine.cult",
  },
  Culinaria: {
    badge:
      "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30",
    bar: "from-orange-500 to-amber-400",
    ring: "ring-orange-500",
    emoji: "🍜",
    canvasBg: "from-orange-950 via-stone-900 to-black",
    handle: "chef.lab",
  },
  Fotografia: {
    badge:
      "bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30",
    bar: "from-pink-500 to-rose-400",
    ring: "ring-pink-500",
    emoji: "📸",
    canvasBg: "from-pink-950 via-neutral-900 to-black",
    handle: "lentes.urbanas",
  },
  Animais: {
    badge:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
    bar: "from-emerald-500 to-teal-400",
    ring: "ring-emerald-500",
    emoji: "🐾",
    canvasBg: "from-emerald-950 via-stone-900 to-black",
    handle: "vida.selvagem",
  },
  Esportes: {
    badge:
      "bg-lime-500/15 text-lime-600 dark:text-lime-300 border-lime-500/30",
    bar: "from-lime-500 to-green-500",
    ring: "ring-lime-500",
    emoji: "⚽",
    canvasBg: "from-lime-950 via-zinc-900 to-black",
    handle: "arena.pro",
  },
  Carros: {
    badge: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30",
    bar: "from-red-500 to-orange-500",
    ring: "ring-red-500",
    emoji: "🏎️",
    canvasBg: "from-red-950 via-zinc-900 to-black",
    handle: "garage.turbo",
  },
  Games: {
    badge:
      "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30",
    bar: "from-indigo-500 to-violet-500",
    ring: "ring-indigo-500",
    emoji: "🎮",
    canvasBg: "from-indigo-950 via-slate-900 to-black",
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

function formatRelativeTime(recencyScore: number, ageHours?: number): string {
  if (typeof ageHours === "number" && ageHours >= 0) {
    if (ageHours < 0.2) return "agora";
    if (ageHours < 1.0)
      return `há ${Math.max(1, Math.round(ageHours * 60))} min`;
    if (ageHours < 24.0) return `há ${Math.max(1, Math.round(ageHours))} h`;
    return `há ${Math.max(1, Math.round(ageHours / 24))} d`;
  }
  const clamped = Math.max(0, Math.min(100, recencyScore));
  if (clamped >= 95) return "há poucos min";
  if (clamped >= 80)
    return `há ${Math.max(5, Math.round((100 - clamped) * 2))} min`;
  if (clamped >= 50)
    return `há ${Math.max(1, Math.round((90 - clamped) / 10))} h`;
  return `há ${Math.max(1, Math.round((100 - clamped) / 20))} d`;
}

type ExtendedPost = ScoredPost & {
  mediaUrl?: string;
};

interface SessionTelemetry {
  totalInteractions: number;
  likes: number;
  saves: number;
  shares: number;
  skips: number;
  dwells: number;
  interactedCategories: Partial<Record<Category, number>>;
}

interface OptimisticReactionState {
  liked?: boolean;
  saved?: boolean;
  shared?: boolean;
  extraLikes?: number;
}

// ============================================================================
// COMPONENTE DE DECOMPOSIÇÃO DO RAIO-X (USADO NO DRAWER MOBILE E PAINEL DESKTOP)
// ============================================================================
function PostXRayDetails({
  post,
  userAffinity,
}: {
  post: ExtendedPost;
  userAffinity: number;
}) {
  const { metadata } = post;
  const style = CATEGORY_STYLES[post.category] || CATEGORY_STYLES.Tecnologia;

  const aff = Math.max(0, metadata.breakdown.affinity_points);
  const creator = Math.max(
    0,
    metadata.breakdown.creator_points ?? userAffinity * 0.2
  );
  const fresh = Math.max(
    0,
    metadata.breakdown.freshness_points ?? metadata.breakdown.recency_points
  );
  const pop = Math.max(0, metadata.breakdown.popularity_points);
  const totalRaw = aff + creator + fresh + pop || 1;

  const affPercent = (aff / totalRaw) * 100;
  const creatorPercent = (creator / totalRaw) * 100;
  const freshPercent = (fresh / totalRaw) * 100;
  const popPercent = (pop / totalRaw) * 100;
  const hasPenalty = metadata.penalty_applied !== 0;

  const csPct = Math.round((metadata.cold_start_factor ?? 0) * 100);
  const pPct = 100 - csPct;

  return (
    <div className="space-y-4">
      {/* Cabeçalho do Post Inspecionado */}
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${style.badge}`}
            >
              {style.emoji} {post.category}
            </span>
            {metadata.is_trending && (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-500 dark:text-orange-400">
                <Flame className="h-3 w-3 fill-current" /> Em Alta
              </span>
            )}
            {metadata.is_exploration_slot && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">
                <Sparkles className="h-3 w-3" /> Furo de Bolha
              </span>
            )}
          </div>
          <h4 className="mt-1.5 line-clamp-1 text-sm font-bold text-foreground">
            {post.title}
          </h4>
          <p className="text-xs text-muted">
            por @{post.author.username} •{" "}
            {formatRelativeTime(
              post.recency_score,
              post.age_hours ?? metadata.age_hours
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">
            Score Final
          </span>
          <span className="inline-block rounded-lg bg-emerald-500/15 px-2.5 py-1 font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
            {metadata.final_score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Penalidade se houver */}
      {hasPenalty && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Penalidade de repetição consecutiva aplicada:{" "}
            <strong>
              {metadata.penalty_applied > 0
                ? `-${metadata.penalty_applied}`
                : metadata.penalty_applied}{" "}
              pts
            </strong>
          </span>
        </div>
      )}

      {/* Decomposição do Value Model */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
          <span className="font-semibold text-foreground">
            Decomposição do Value Model
          </span>
          <span className="font-mono text-[10px]">
            45% Tema · 20% Criador · 20% Fresh · 15% Pop
          </span>
        </div>

        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-black/10 p-0.5 dark:bg-white/10">
          <div
            style={{ width: `${affPercent}%` }}
            className="h-full bg-[#DD2A7B] transition-all duration-500"
            title={`Afinidade Tema: +${aff.toFixed(1)} pts`}
          />
          <div
            style={{ width: `${creatorPercent}%` }}
            className="h-full bg-[#A855F7] transition-all duration-500"
            title={`Afinidade Criador: +${creator.toFixed(1)} pts`}
          />
          <div
            style={{ width: `${freshPercent}%` }}
            className="h-full bg-emerald-500 transition-all duration-500"
            title={`Freshness (T½=12h): +${fresh.toFixed(1)} pts`}
          />
          <div
            style={{ width: `${popPercent}%` }}
            className="h-full bg-[#0095F6] transition-all duration-500"
            title={`Popularidade: +${pop.toFixed(1)} pts`}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border bg-background p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#DD2A7B]" />
              <span className="font-semibold text-foreground">Tema (45%)</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[11px] text-muted">{post.category}</span>
              <strong className="font-mono text-xs text-foreground">
                +{aff.toFixed(1)} pts
              </strong>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#A855F7]" />
              <span className="font-semibold text-foreground">
                Criador (20%)
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="truncate text-[11px] text-muted">
                @{post.author.username}
              </span>
              <strong className="font-mono text-xs text-foreground">
                +{creator.toFixed(1)} pts
              </strong>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-semibold text-foreground">
                Freshness (20%)
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[11px] text-muted">Meia-vida 12h</span>
              <strong className="font-mono text-xs text-foreground">
                +{fresh.toFixed(1)} pts
              </strong>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#0095F6]" />
              <span className="font-semibold text-foreground">
                Popularidade (15%)
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[11px] text-muted">
                {post.likes} likes
              </span>
              <strong className="font-mono text-xs text-foreground">
                +{pop.toFixed(1)} pts
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Sinais Comportamentais Ativos/Passivos */}
      <div className="flex flex-wrap items-center gap-1.5">
        {metadata.has_share && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-600 dark:text-cyan-300">
            ✈️ Impulsionado por Share (+15)
          </span>
        )}
        {metadata.has_dwell && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-300">
            👁️ Dwell Time (&ge; 3s)
          </span>
        )}
        {metadata.age_hours !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] text-muted">
            ⏱️ Idade: {metadata.age_hours}h (Recência{" "}
            {Math.round(post.recency_score)}%)
          </span>
        )}
        {metadata.fatigue_multiplier !== undefined && (
          <span
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
              metadata.fatigue_multiplier < 0.99
                ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300"
                : "border-border bg-background text-muted"
            }`}
          >
            💤 Fadiga: x{metadata.fatigue_multiplier.toFixed(2)}
          </span>
        )}
        {metadata.jitter_applied !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-mono text-violet-600 dark:text-violet-300">
            🎲 Jitter: +{metadata.jitter_applied.toFixed(2)} pts
          </span>
        )}
      </div>

      {/* Relevância Coletiva vs. Bolha Pessoal (LERP Cold Start) */}
      <div className="rounded-xl border border-border bg-background p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-bold text-foreground">
            <Flame className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />
            Consenso Global vs. Bolha Pessoal
          </span>
          <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-[10px] font-bold text-muted border border-border">
            {csPct >= 70
              ? "Cold Start"
              : csPct > 0
              ? "Transição LERP"
              : "Bolha Pessoal"}
          </span>
        </div>

        <div className="mt-2 space-y-1.5">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            {csPct > 0 && (
              <div
                style={{ width: `${csPct}%` }}
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
              />
            )}
            {pPct > 0 && (
              <div
                style={{ width: `${pPct}%` }}
                className="h-full bg-gradient-to-r from-[#DD2A7B] via-[#A855F7] to-[#0095F6] transition-all duration-500"
              />
            )}
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-orange-500 dark:text-orange-400">
              Coletivo: <strong>{csPct}%</strong>
              {metadata.trending_score !== undefined && (
                <span className="ml-1 text-muted">
                  (Score {metadata.trending_score.toFixed(1)})
                </span>
              )}
            </span>
            <span className="font-semibold text-pink-600 dark:text-pink-400">
              Individual: <strong>{pPct}%</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Diagnóstico em Linguagem Natural */}
      <div className="rounded-xl border border-border bg-background p-3 text-xs leading-relaxed text-muted">
        <span className="font-bold text-[#0095F6]">
          Diagnóstico do Motor:{" "}
        </span>
        <span className="text-foreground">{metadata.match_reason}</span>
      </div>
    </div>
  );
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[#262626] bg-[#121212] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-1 px-3 pt-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <div className="h-full w-full bg-white" />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] p-[2px]">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-base">
                {style.emoji}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-white">@{style.handle}</p>
              <p className="text-[11px] text-[#a8a8a8]">Canal de {category}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`flex min-h-[320px] flex-col items-center justify-center bg-gradient-to-b ${style.canvasBg} px-6 py-10 text-center`}
        >
          <span className="mb-3 text-6xl">{style.emoji}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white">
            {category}
          </span>

          <div className="mt-6 w-full rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-md">
            <p className="text-xs uppercase tracking-wider text-[#a8a8a8]">
              Afinidade Atual no seu Perfil
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
                ? "🔇 Este tema está na sua Zona Cega e só aparece via Furo de Bolha."
                : "⚖️ Este tema está na Zona Neutra. Interaja no feed para trazê-lo para sua bolha."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUBCOMPONENTE: CARD DE PUBLICAÇÃO (SEPARAÇÃO ESTRITA SOCIAL VS LAB)
// ============================================================================
interface PostCardProps {
  post: ExtendedPost;
  rankIndex: number;
  isBusy: boolean;
  isCurrentProcessing: boolean;
  userAffinity: number;
  optimistic: OptimisticReactionState;
  isInspected: boolean;
  onInspect: (postId: string) => void;
  onInteract: (postId: string, category: Category, action: ActionType) => void;
  onPassiveInteract: (
    postId: string,
    category: Category,
    action: "dwell" | "fast_skip"
  ) => void;
}

function PostCard({
  post,
  rankIndex,
  isBusy,
  isCurrentProcessing,
  userAffinity,
  optimistic,
  isInspected,
  onInspect,
  onInteract,
  onPassiveInteract,
}: PostCardProps) {
  const { viewMode } = useViewMode();
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [localComments, setLocalComments] = useState<string[]>([]);

  // Rastreamento passivo de Dwell Time via IntersectionObserver (>60% visível)
  const cardRef = useRef<HTMLElement | null>(null);
  const visibleStartRef = useRef<number | null>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSentDwellRef = useRef<boolean>(false);
  const hasSentFastSkipRef = useRef<boolean>(false);

  useEffect(() => {
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          visibleStartRef.current = performance.now();

          if (!hasSentDwellRef.current && !dwellTimerRef.current) {
            dwellTimerRef.current = setTimeout(() => {
              hasSentDwellRef.current = true;
              dwellTimerRef.current = null;
              onPassiveInteract(post.id, post.category, "dwell");
            }, 3000);
          }
        } else {
          if (dwellTimerRef.current) {
            clearTimeout(dwellTimerRef.current);
            dwellTimerRef.current = null;
          }

          if (visibleStartRef.current !== null) {
            const elapsedMs = performance.now() - visibleStartRef.current;
            visibleStartRef.current = null;

            if (
              elapsedMs > 80 &&
              elapsedMs < 1000 &&
              !hasSentDwellRef.current &&
              !hasSentFastSkipRef.current
            ) {
              hasSentFastSkipRef.current = true;
              onPassiveInteract(post.id, post.category, "fast_skip");
            }
          }
        }
      },
      { threshold: [0, 0.6] }
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
      }
    };
  }, [post.id, post.category, onPassiveInteract]);

  const style = CATEGORY_STYLES[post.category] || CATEGORY_STYLES.Tecnologia;
  const { metadata } = post;
  const isHighAffinityAuthor = userAffinity >= 70;

  const isLiked = Boolean(optimistic.liked);
  const isSaved = Boolean(optimistic.saved);
  const isShared = Boolean(optimistic.shared);
  const displayedLikes = post.likes + (optimistic.extraLikes ?? 0);

  const handleDoubleTapLike = () => {
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 800);
    if (!isBusy) {
      onInteract(post.id, post.category, "LIKE");
    }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setLocalComments((prev) => [...prev, commentText.trim()]);
    setCommentText("");
    setShowCommentBox(false);
    // Comentário engaja atenção equivalente a dwell
    onPassiveInteract(post.id, post.category, "dwell");
  };

  return (
    <article
      ref={cardRef}
      className={`overflow-hidden rounded-2xl border bg-surface transition-all duration-200 ${
        viewMode === "lab" && isInspected
          ? "border-[#0095F6] ring-1 ring-[#0095F6]/50"
          : viewMode === "lab" && metadata.is_exploration_slot
          ? "border-amber-500/60"
          : "border-border"
      } ${isCurrentProcessing ? "opacity-80" : ""}`}
    >
      {/* 1. CABEÇALHO DO POST */}
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar estilizado com anel de Story */}
          <div
            className={`shrink-0 rounded-full p-[2px] ${
              isHighAffinityAuthor
                ? "bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4]"
                : "bg-border"
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-xs font-bold text-foreground">
              {post.author.display_name.slice(0, 2).toUpperCase()}
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold text-foreground">
                {post.author.username}
              </span>
              <span
                title="Criador Verificado"
                className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#0095F6] text-[9px] font-black text-white"
              >
                ✓
              </span>
              <span className="shrink-0 text-xs text-muted">
                •{" "}
                {formatRelativeTime(
                  post.recency_score,
                  post.age_hours ?? metadata.age_hours
                )}
              </span>
              {viewMode === "lab" && (
                <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-foreground">
                  #{rankIndex + 1}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="truncate">{post.author.display_name}</span>
              {viewMode === "lab" && (
                <>
                  <span>•</span>
                  <span className="font-semibold text-foreground">
                    {style.emoji} {post.category}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Direita do Header: Zero Ruído no Modo Social | Badges + Raio-X no Modo Lab */}
        <div className="flex items-center gap-1.5 shrink-0">
          {viewMode === "lab" ? (
            <>
              {metadata.is_trending && (
                <span
                  title={`Em Alta na Rede: Score Global ${
                    metadata.trending_score?.toFixed(1) ?? ""
                  }`}
                  className="hidden sm:inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-500 dark:text-orange-400"
                >
                  <Flame className="h-3 w-3 fill-current" />
                  Em Alta
                </span>
              )}
              {metadata.is_exploration_slot && (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">
                  <Sparkles className="h-3 w-3" />
                  Furo de Bolha
                </span>
              )}
              <button
                type="button"
                onClick={() => onInspect(post.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${
                  isInspected
                    ? "border-[#0095F6] bg-[#0095F6] text-white"
                    : "border-border bg-background text-foreground hover:border-[#0095F6]/60"
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Inspecionar Raio-X</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onInteract(post.id, post.category, "SKIP")}
              title="Ocultar / Não tenho interesse"
              className="rounded-full p-1.5 text-muted transition hover:bg-foreground/5 hover:text-foreground"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. ÁREA DE MÍDIA / CANVAS VISUAL (COM DOUBLE-TAP TO LIKE) */}
      <div
        onDoubleClick={handleDoubleTapLike}
        className={`group relative flex min-h-[280px] cursor-pointer select-none flex-col justify-between overflow-hidden border-y border-border bg-gradient-to-br ${style.canvasBg} p-6 sm:min-h-[340px] sm:p-8`}
      >
        {post.image_url || post.mediaUrl ? (
          <div className="absolute inset-0 h-full w-full">
            <img
              src={post.image_url || post.mediaUrl}
              alt={post.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/15" />

            {/* Badges no Canvas apenas no Modo Lab */}
            {viewMode === "lab" && (
              <div className="relative z-10 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                  <span>{style.emoji}</span>
                  {post.category}
                </span>
                <span className="rounded-lg border border-white/15 bg-black/65 px-2.5 py-1 font-mono text-xs font-bold text-emerald-400 backdrop-blur-md">
                  Score: {metadata.final_score.toFixed(1)}
                </span>
              </div>
            )}

            <div className="relative z-10 mt-auto pt-24">
              <h3 className="text-xl font-extrabold leading-snug tracking-tight text-white drop-shadow-md sm:text-2xl">
                {post.title}
              </h3>
            </div>
          </div>
        ) : (
          <>
            <div className="pointer-events-none absolute -right-6 -top-6 text-[130px] opacity-[0.08] transition-transform duration-500 group-hover:scale-110">
              {style.emoji}
            </div>
            {viewMode === "lab" ? (
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                  <span>{style.emoji}</span>
                  {post.category}
                </span>
                <span className="rounded-lg border border-white/15 bg-black/55 px-2.5 py-1 font-mono text-xs font-bold text-emerald-400 backdrop-blur-sm">
                  Score: {metadata.final_score.toFixed(1)}
                </span>
              </div>
            ) : (
              <div />
            )}

            <div className="my-auto py-6">
              <h3 className="text-xl font-extrabold leading-snug tracking-tight text-white drop-shadow-sm sm:text-2xl">
                {post.title}
              </h3>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="font-mono text-[11px] opacity-80">
                @{post.author.username}
              </span>
            </div>
          </>
        )}

        {/* Animação de Coração Saltando no Centro (Double-Tap) */}
        {showHeartBurst && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <Heart className="h-24 w-24 animate-heart-pop fill-[#ed4956] text-[#ed4956] drop-shadow-[0_8px_24px_rgba(237,73,86,0.55)]" />
          </div>
        )}
      </div>

      {/* 3. BARRA DE AÇÕES E CONTEÚDO (EXPERIÊNCIA SOCIAL PURA + ATUALIZAÇÃO OTIMISTA) */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-between">
          {/* Esquerda: Like, Comment Simulado, Share/Aviãozinho */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onInteract(post.id, post.category, "LIKE")}
              aria-label="Curtir publicação"
              className="group inline-flex items-center gap-1.5 text-foreground transition active:scale-90 disabled:opacity-50"
            >
              <Heart
                className={`h-6 w-6 transition-transform duration-200 group-hover:scale-110 ${
                  isLiked
                    ? "fill-[#ed4956] text-[#ed4956] scale-110"
                    : "text-foreground hover:text-[#ed4956]"
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setShowCommentBox((prev) => !prev)}
              aria-label="Comentar publicação"
              className="group inline-flex items-center gap-1.5 text-foreground transition hover:text-muted active:scale-90"
            >
              <MessageCircle className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => onInteract(post.id, post.category, "SHARE")}
              aria-label="Compartilhar publicação"
              className="group inline-flex items-center gap-1.5 text-foreground transition active:scale-90 disabled:opacity-50"
            >
              <Send
                className={`h-6 w-6 transition-transform duration-200 group-hover:scale-110 ${
                  isShared
                    ? "text-[#0095F6]"
                    : "text-foreground hover:text-[#0095F6]"
                }`}
              />
            </button>
          </div>

          {/* Direita: Pular (no Lab) e Save / Bookmark Otimista */}
          <div className="flex items-center gap-3">
            {viewMode === "lab" && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onInteract(post.id, post.category, "SKIP")}
                title="Pular publicação (-4 pts de afinidade)"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted transition hover:text-foreground active:scale-95 disabled:opacity-50"
              >
                <FastForward className="h-3.5 w-3.5" />
                <span>Pular</span>
              </button>
            )}

            <button
              type="button"
              disabled={isBusy}
              onClick={() => onInteract(post.id, post.category, "SAVE")}
              aria-label="Salvar publicação"
              className="group inline-flex items-center text-foreground transition active:scale-90 disabled:opacity-50"
            >
              <Bookmark
                className={`h-6 w-6 transition-transform duration-200 group-hover:scale-110 ${
                  isSaved
                    ? "fill-foreground text-foreground scale-110"
                    : "text-foreground hover:text-muted"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Contagem de Curtidas */}
        <div className="mt-2.5 flex items-center gap-2 text-xs font-bold text-foreground">
          <span>{displayedLikes.toLocaleString("pt-BR")} curtidas</span>
        </div>

        {/* Legenda Estilo Instagram */}
        <div className="mt-1.5 text-sm leading-relaxed text-foreground">
          <span className="mr-2 font-bold">{post.author.username}</span>
          <span>{post.content}</span>
        </div>

        {/* Comentários locais adicionados pelo usuário */}
        {localComments.length > 0 && (
          <div className="mt-2 space-y-1 text-xs">
            {localComments.map((c, idx) => (
              <div key={idx} className="text-foreground">
                <span className="mr-1.5 font-bold">voce</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        )}

        {/* Input rápido de comentário simulado */}
        {showCommentBox && (
          <form
            onSubmit={handleCommentSubmit}
            className="mt-3 flex items-center gap-2 border-t border-border pt-2.5"
          >
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Adicione um comentário..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={!commentText.trim()}
              className="text-xs font-bold text-[#0095F6] disabled:opacity-40"
            >
              Publicar
            </button>
          </form>
        )}

        {/* Rodapé discreto exclusivo do Modo Lab */}
        {viewMode === "lab" && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px]">
            <div className="flex items-center gap-1.5 text-muted">
              <Eye className="h-3.5 w-3.5 text-[#0095F6]" />
              <span className="line-clamp-1">{metadata.match_reason}</span>
            </div>
            <button
              type="button"
              onClick={() => onInspect(post.id)}
              className="shrink-0 font-bold text-[#0095F6] hover:underline"
            >
              Abrir Raio-X →
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

// ============================================================================
// PÁGINA PRINCIPAL: BUGSTAGRAM
// ============================================================================
export default function BugstagramPage() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const {
    viewMode,
    setViewMode,
    inspectedPostId,
    setInspectedPostId,
  } = useViewMode();

  const [feed, setFeed] = useState<ExtendedPost[]>([]);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [processingPostId, setProcessingPostId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Estados de reação otimista por post_id
  const [optimisticMap, setOptimisticMap] = useState<
    Record<string, OptimisticReactionState>
  >({});

  // Drawers mobile (Trending / Telemetria da Bolha)
  const [mobileSheet, setMobileSheet] = useState<
    "none" | "trending" | "telemetry"
  >("none");

  const [selectedStoryCategory, setSelectedStoryCategory] =
    useState<Category | null>(null);

  const [toast, setToast] = useState<{
    title: string;
    subtitle: string;
    type: "info" | "error";
  } | null>(null);

  const [globalTrending, setGlobalTrending] = useState<GlobalTrendingPost[]>(
    []
  );

  const [telemetry, setTelemetry] = useState<SessionTelemetry>({
    totalInteractions: 0,
    likes: 0,
    saves: 0,
    shares: 0,
    skips: 0,
    dwells: 0,
    interactedCategories: {},
  });

  const isBusy = Boolean(processingPostId) || isResetting || isLoading;

  const showToast = useCallback(
    (title: string, subtitle: string, type: "info" | "error" = "info") => {
      setToast({ title, subtitle, type });
    },
    []
  );

  useEffect(() => {
    if (!toast || toast.type === "error") return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const hydrateSessionFromBackend = useCallback(async () => {
    const [profileState, fetchedFeed, metricsRes] = await Promise.all([
      getProfileState(),
      getFeed(),
      getGlobalMetrics().catch(() => null),
    ]);

    const snapshot = loadSessionSnapshot();
    const hasLocalBubble =
      snapshot &&
      (snapshot.consumed_count > 0 ||
        Object.keys(snapshot.post_fatigue ?? {}).length > 0);

    // Se o backend em memória reiniciou (consumed_count === 0) mas o navegador tem sessão salva,
    // reidrata automaticamente o vetor de afinidade e a fadiga no Go sem perder a bolha no F5.
    if (profileState.consumed_count === 0 && hasLocalBubble && snapshot) {
      const synced = await syncSessionState({
        profile: snapshot.profile,
        consumed_count: snapshot.consumed_count,
        post_fatigue: snapshot.post_fatigue,
      });
      const restoredCount = synced.consumed_count ?? snapshot.consumed_count;
      saveSessionSnapshot({
        profile: synced.profile,
        consumed_count: restoredCount,
        post_fatigue: synced.post_fatigue ?? snapshot.post_fatigue,
      });
      return {
        profile: synced.profile,
        feed: synced.feed,
        consumedCount: restoredCount,
        metricsRes,
      };
    }

    const activeCount = Math.max(
      profileState.consumed_count,
      snapshot?.consumed_count ?? 0
    );
    saveSessionSnapshot({
      profile: profileState.profile,
      consumed_count: activeCount,
      post_fatigue: profileState.post_fatigue ?? snapshot?.post_fatigue,
    });
    return {
      profile: profileState.profile,
      feed: fetchedFeed,
      consumedCount: activeCount,
      metricsRes,
    };
  }, []);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const result = await hydrateSessionFromBackend();
      setProfile(result.profile);
      setFeed(result.feed);
      setTelemetry((prev) => ({
        ...prev,
        totalInteractions: result.consumedCount,
      }));
      if (result.metricsRes) {
        setGlobalTrending(result.metricsRes.top_trending);
      }
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
  }, [hydrateSessionFromBackend, showToast]);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const result = await hydrateSessionFromBackend();
        if (!ignore) {
          setProfile(result.profile);
          setFeed(result.feed);
          setTelemetry((prev) => ({
            ...prev,
            totalInteractions: result.consumedCount,
          }));
          if (result.metricsRes) {
            setGlobalTrending(result.metricsRes.top_trending);
          }
        }
      } catch (err) {
        if (!ignore) {
          const message =
            err instanceof Error
              ? err.message
              : "Falha ao conectar à API Go em http://localhost:8080";
          setApiError(message);
          showToast("API Go Offline", message, "error");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, [hydrateSessionFromBackend, showToast]);

  const handleInteraction = async (
    postId: string,
    category: Category,
    action: ActionType
  ) => {
    if (isBusy) return;

    const actUpper = action.toUpperCase();
    const isLike = actUpper === "LIKE";
    const isSave = actUpper === "SAVE";
    const isShare = actUpper === "SHARE";
    const isSkip = actUpper === "SKIP";
    const isDwell = actUpper === "DWELL";

    // 1. Atualização Otimista Instantânea nos Ícones
    setOptimisticMap((prev) => {
      const curr = prev[postId] || {};
      return {
        ...prev,
        [postId]: {
          liked: isLike ? true : curr.liked,
          saved: isSave ? true : curr.saved,
          shared: isShare ? true : curr.shared,
          extraLikes: (curr.extraLikes ?? 0) + (isLike && !curr.liked ? 1 : 0),
        },
      };
    });

    setProcessingPostId(postId);
    setApiError(null);

    const deltaLabel: Record<string, string> = {
      LIKE: "Curtida registrada (+5 pts tema, +8 criador)",
      SAVE: "Salvo na coleção (+10 pts tema, +12 criador)",
      SHARE: "Compartilhado via Direct! (+15 pts tema, +12 criador)",
      SKIP: "Publicação ocultada (-4 pts em " + category + ")",
      DWELL: "Dwell Time registrado (+2 pts tema, +1 criador)",
      FAST_SKIP: "Rolagem rápida detectada (-1.5 pts tema)",
    };

    try {
      const updated = await interact(postId, category, action);
      setProfile(updated.profile);
      setFeed(updated.feed);

      const persistedCount =
        updated.consumed_count ?? telemetry.totalInteractions + 1;
      saveSessionSnapshot({
        profile: updated.profile,
        consumed_count: persistedCount,
        post_fatigue: updated.post_fatigue,
      });

      setTelemetry((prev) => ({
        totalInteractions: Math.max(prev.totalInteractions + 1, persistedCount),
        likes: prev.likes + (isLike ? 1 : 0),
        saves: prev.saves + (isSave ? 1 : 0),
        shares: prev.shares + (isShare ? 1 : 0),
        skips: prev.skips + (isSkip ? 1 : 0),
        dwells: prev.dwells + (isDwell ? 1 : 0),
        interactedCategories: {
          ...prev.interactedCategories,
          [category]:
            (prev.interactedCategories[category] ?? 0) + (isSkip ? 0 : 1),
        },
      }));

      if (viewMode === "lab" || isShare) {
        showToast(
          `${CATEGORY_STYLES[category].emoji} ${category}`,
          deltaLabel[actUpper] || "Interação processada",
          "info"
        );
      }

      getGlobalMetrics()
        .then((res) => setGlobalTrending(res.top_trending))
        .catch(() => {});
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

  const handlePassiveInteraction = useCallback(
    async (postId: string, category: Category, action: "dwell" | "fast_skip") => {
      try {
        const updated = await interact(postId, category, action);
        setProfile(updated.profile);
        saveSessionSnapshot({
          profile: updated.profile,
          consumed_count: updated.consumed_count ?? 0,
          post_fatigue: updated.post_fatigue,
        });
        if (action === "dwell") {
          setTelemetry((prev) => ({
            ...prev,
            dwells: prev.dwells + 1,
          }));
        }
      } catch {
        // Silencioso para telemetria passiva
      }
    },
    []
  );

  const handleReset = async () => {
    if (isBusy) return;
    setIsResetting(true);
    setApiError(null);
    try {
      const resetData = await resetSimulation();
      setProfile(resetData.profile);
      setFeed(resetData.feed);
      setOptimisticMap({});
      setInspectedPostId(null);
      setTelemetry({
        totalInteractions: 0,
        likes: 0,
        saves: 0,
        shares: 0,
        skips: 0,
        dwells: 0,
        interactedCategories: {},
      });
      showToast(
        "Simulação Reiniciada",
        "Todos os pesos voltaram para 50% (Cold Start).",
        "info"
      );

      getGlobalMetrics()
        .then((res) => setGlobalTrending(res.top_trending))
        .catch(() => {});
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

  // Segmentação da Bolha
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

  const explorationCount = useMemo(
    () => feed.filter((p) => p.metadata.is_exploration_slot).length,
    [feed]
  );
  const explorationRatio =
    feed.length > 0 ? Math.round((explorationCount / feed.length) * 100) : 0;

  // Post inspecionado atualmente para o Bottom Sheet Mobile ou Painel Lateral Desktop
  const inspectedPost = useMemo(() => {
    if (!inspectedPostId) return null;
    return feed.find((p) => p.id === inspectedPostId) || null;
  }, [feed, inspectedPostId]);

  const activeDesktopLabPost = inspectedPost || feed[0] || null;

  const handleInspectPost = useCallback(
    (postId: string) => {
      setInspectedPostId(inspectedPostId === postId ? null : postId);
    },
    [inspectedPostId, setInspectedPostId]
  );

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground transition-colors duration-200 md:pb-10">
      {/* =====================================================================
          TOAST FLUTUANTE
      ===================================================================== */}
      {toast && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm animate-in fade-in slide-in-from-bottom-4 md:bottom-6 md:right-6">
          <div
            className={`flex items-start gap-3 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md ${
              toast.type === "error"
                ? "border-rose-500/60 bg-rose-950/90 text-rose-100"
                : "border-border bg-surface/95 text-foreground"
            }`}
          >
            {toast.type === "error" ? (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0095F6]" />
            )}
            <div className="flex-1 text-xs">
              <p className="font-bold">{toast.title}</p>
              <p className="mt-0.5 text-muted">{toast.subtitle}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="rounded-lg p-1 text-muted hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Story */}
      {selectedStoryCategory && (
        <StoryViewerModal
          category={selectedStoryCategory}
          score={profile[selectedStoryCategory] ?? 50}
          onClose={() => setSelectedStoryCategory(null)}
        />
      )}

      {/* =====================================================================
          MOBILE BOTTOM SHEET / DRAWER: RAIO-X DO POST (< 768px)
      ===================================================================== */}
      {viewMode === "lab" && inspectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs md:hidden"
          onClick={() => setInspectedPostId(null)}
        >
          <div
            className="animate-sheet-up max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 pb-safe shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#0095F6]">
                <Sliders className="h-4 w-4" />
                Raio-X da Recomendação
              </span>
              <button
                type="button"
                onClick={() => setInspectedPostId(null)}
                className="rounded-full p-1.5 text-muted hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <PostXRayDetails
              post={inspectedPost}
              userAffinity={profile[inspectedPost.category] ?? 50}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          MOBILE BOTTOM SHEET: TRENDING OU TELEMETRIA DA BOLHA (< 768px)
      ===================================================================== */}
      {mobileSheet !== "none" && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs md:hidden"
          onClick={() => setMobileSheet("none")}
        >
          <div
            className="animate-sheet-up max-h-[82vh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 pb-safe shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                {mobileSheet === "trending" ? (
                  <>
                    <Flame className="h-4 w-4 fill-orange-500 text-orange-500" />
                    Em Alta na Rede (Consenso Global)
                  </>
                ) : (
                  <>
                    <BarChart3 className="h-4 w-4 text-[#0095F6]" />
                    Telemetria da sua Bolha
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => setMobileSheet("none")}
                className="rounded-full p-1.5 text-muted hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {mobileSheet === "trending" ? (
              <div className="space-y-2.5">
                {globalTrending.map((tp, idx) => {
                  const catStyle =
                    CATEGORY_STYLES[tp.category] || CATEGORY_STYLES.Tecnologia;
                  return (
                    <div
                      key={tp.post_id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background p-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono text-xs font-black text-orange-500">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-foreground">
                            {catStyle.emoji} {tp.title}
                          </p>
                          <p className="text-[11px] text-muted">
                            {tp.total_likes} likes · {tp.total_shares}{" "}
                            compartilhamentos
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-lg bg-orange-500/15 px-2.5 py-1 font-mono text-xs font-black text-orange-500">
                        {Math.round(tp.trending_score)} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {ALL_CATEGORIES.map((category) => {
                  const rawScore = profile[category] ?? 0;
                  const style = CATEGORY_STYLES[category];
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground">
                          {style.emoji} {category}
                        </span>
                        <span className="font-mono font-bold text-foreground">
                          {Math.round(rawScore)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, rawScore))}%`,
                          }}
                          className={`h-full rounded-full bg-gradient-to-r ${style.bar}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TOP BAR FIXA (MOBILE & DESKTOP) COM PILL SWITCHER E TOGGLE DE TEMA
      ===================================================================== */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {/* Logo Estilizada */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4] p-[1.5px] shadow-xs">
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-background">
                <Flame className="h-4 w-4 text-[#DD2A7B]" />
              </div>
            </div>
            <span className="text-lg font-black tracking-tight text-foreground">
              Bugstagram
            </span>
          </div>

          {/* Controles Centrais/Direita: Pill Switcher (Social | Lab) + Tema + Reset */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Pill Switcher Rápido: Social | Lab */}
            <div
              role="group"
              aria-label="Modo de Visualização"
              className="inline-flex items-center rounded-full border border-border bg-surface p-0.5"
            >
              <button
                type="button"
                onClick={() => setViewMode("social")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all ${
                  viewMode === "social"
                    ? "bg-foreground text-background shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <span>Social</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("lab")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all ${
                  viewMode === "lab"
                    ? "bg-[#0095F6] text-white shadow-xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Sliders className="h-3 w-3" />
                <span>Lab</span>
              </button>
            </div>

            {/* Botão de Alternância de Tema (Light / Dark) */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Alternar tema claro ou escuro"
              title={
                resolvedTheme === "dark"
                  ? "Mudar para Modo Claro"
                  : "Mudar para Modo Escuro (OLED)"
              }
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground transition hover:bg-foreground/5 active:scale-95"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
              ) : (
                <Moon className="h-4 w-4 text-slate-700 transition-transform duration-200 hover:-rotate-12" />
              )}
            </button>

            {/* Botão Reset no Desktop */}
            <button
              type="button"
              onClick={handleReset}
              disabled={isBusy}
              title="Reiniciar simulação da sessão"
              className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground transition hover:bg-foreground/5 active:scale-95 disabled:opacity-50"
            >
              <RotateCcw
                className={`h-3.5 w-3.5 text-[#0095F6] ${
                  isResetting ? "animate-spin" : ""
                }`}
              />
              <span>Resetar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Banner de Erro se API Offline */}
      {apiError && (
        <div className="mx-auto mt-3 max-w-xl px-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{apiError}</span>
            </div>
            <button
              onClick={loadInitialData}
              className="shrink-0 rounded-lg bg-rose-500 px-3 py-1 font-bold text-white"
            >
              Reconectar
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          SHELL PRINCIPAL: FEED CENTRALIZADO (470px-540px) + PAINEL LAB DESKTOP
      ===================================================================== */}
      <main className="mx-auto flex max-w-6xl justify-center gap-8 px-3 pt-4 sm:px-4 md:pt-6">
        {/* COLUNA CENTRAL DO FEED (LARGURA CONTIDA PADRÃO INSTAGRAM WEB) */}
        <section className="w-full max-w-[540px] shrink-0">
          {/* HUD DISCRETO EXCLUSIVO DO MODO LAB */}
          {viewMode === "lab" && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#0095F6]/40 bg-[#0095F6]/10 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[#0095F6]" />
                <span className="font-bold text-foreground">
                  HUD do Algoritmo:
                </span>
                <span className="text-muted">
                  {telemetry.totalInteractions < 3
                    ? "❄️ Cold Start (Consenso Global)"
                    : `🎯 Bolha Ativa (${bubbleCore.length} dominante${
                        bubbleCore.length === 1 ? "" : "s"
                      })`}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="rounded bg-background/80 px-2 py-0.5 font-bold text-[#0095F6]">
                  {100 - explorationRatio}% Bolha
                </span>
                <span className="rounded bg-background/80 px-2 py-0.5 font-bold text-amber-500">
                  {explorationRatio}% Furo
                </span>
              </div>
            </div>
          )}

          {/* BARRA DE STORIES DE CATEGORIAS */}
          <div className="mb-5 rounded-2xl border border-border bg-surface p-3">
            <div className="no-scrollbar flex items-center gap-3.5 overflow-x-auto">
              {ALL_CATEGORIES.map((cat) => {
                const score = Math.round(profile[cat] ?? 50);
                const style = CATEGORY_STYLES[cat];
                const isHigh = score >= 70;
                const isBlind = score <= 29;

                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedStoryCategory(cat)}
                    className="group flex shrink-0 flex-col items-center gap-1 focus:outline-none"
                  >
                    <div
                      className={`rounded-full p-[2.5px] transition-transform group-hover:scale-105 ${
                        isHigh
                          ? "bg-gradient-to-tr from-[#FEDA77] via-[#DD2A7B] to-[#515BD4]"
                          : isBlind && viewMode === "lab"
                          ? "bg-rose-500/40 opacity-50"
                          : "bg-gradient-to-tr from-zinc-400 to-zinc-600 dark:from-zinc-700 dark:to-zinc-500"
                      }`}
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-surface bg-background text-2xl">
                        {style.emoji}
                      </div>
                    </div>

                    <span className="max-w-[64px] truncate text-[11px] font-medium text-foreground">
                      {cat}
                    </span>

                    {viewMode === "lab" && (
                      <span
                        className={`font-mono text-[10px] font-bold ${
                          isHigh
                            ? "text-emerald-500"
                            : isBlind
                            ? "text-rose-500"
                            : "text-muted"
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

          {/* LISTA DE POSTS DO FEED */}
          {isLoading ? (
            <div className="space-y-6">
              {[1, 2].map((skeleton) => (
                <div
                  key={skeleton}
                  className="h-[420px] animate-pulse rounded-2xl border border-border bg-surface p-6"
                />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface px-6 py-16 text-center">
              <RotateCcw className="mb-3 h-10 w-10 text-[#0095F6]" />
              <h2 className="text-lg font-extrabold text-foreground">
                Você zerou o Feed!
              </h2>
              <p className="mt-1 max-w-sm text-xs text-muted">
                Todas as publicações desta sessão foram consumidas. Reinicie a
                simulação para experimentar outra trajetória de bolha.
              </p>
              <button
                onClick={handleReset}
                disabled={isBusy}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0095F6] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#1877F2] disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reiniciar Simulação
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {feed.map((post, index) => (
                <PostCard
                  key={post.id}
                  post={post}
                  rankIndex={index}
                  isBusy={isBusy}
                  isCurrentProcessing={processingPostId === post.id}
                  userAffinity={profile[post.category] ?? 50}
                  optimistic={optimisticMap[post.id] || {}}
                  isInspected={inspectedPostId === post.id}
                  onInspect={handleInspectPost}
                  onInteract={handleInteraction}
                  onPassiveInteract={handlePassiveInteraction}
                />
              ))}
            </div>
          )}
        </section>

        {/* =====================================================================
            PAINEL LATERAL FIXO À DIREITA (DESKTOP ≥ 768px EM MODO LAB)
        ===================================================================== */}
        {viewMode === "lab" && (
          <aside className="hidden md:block w-[360px] lg:w-[390px] shrink-0">
            <div className="sticky top-20 space-y-5 max-h-[calc(100vh-6rem)] overflow-y-auto no-scrollbar pb-6">
              {/* CARD 1: INSPETOR RAIO-X EM TEMPO REAL */}
              {activeDesktopLabPost && (
                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#0095F6]">
                      <Sliders className="h-4 w-4" />
                      Raio-X do Post Selecionado
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      {inspectedPost ? "Selecionado" : "Topo do Feed (#1)"}
                    </span>
                  </div>

                  <PostXRayDetails
                    post={activeDesktopLabPost}
                    userAffinity={profile[activeDesktopLabPost.category] ?? 50}
                  />
                </div>
              )}

              {/* CARD 2: EM ALTA NA REDE (TOP 5 MOMENTUM COLETIVO) */}
              {globalTrending.length > 0 && (
                <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-orange-500">
                      <Flame className="h-4 w-4 fill-current" />
                      Em Alta na Rede (Momentum)
                    </span>
                    <span className="rounded bg-orange-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-orange-500">
                      Top 5 Global
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {globalTrending.slice(0, 5).map((tp, idx) => {
                      const catStyle =
                        CATEGORY_STYLES[tp.category] ||
                        CATEGORY_STYLES.Tecnologia;
                      return (
                        <div
                          key={tp.post_id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-2 text-xs"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="font-mono text-[11px] font-bold text-muted">
                              #{idx + 1}
                            </span>
                            <span className="truncate font-medium text-foreground">
                              {catStyle.emoji} {tp.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {tp.total_shares > 0 && (
                              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                                {tp.total_shares} ✈️
                              </span>
                            )}
                            <span className="rounded bg-orange-500/15 px-1.5 py-0.5 font-mono text-[11px] font-black text-orange-500">
                              {Math.round(tp.trending_score)} pts
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CARD 3: VETOR DE AFINIDADE E DIAGNÓSTICO DA BOLHA */}
              <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h2 className="text-sm font-extrabold text-foreground">
                      Termômetros de Afinidade
                    </h2>
                    <p className="text-[11px] text-muted">
                      Pesos personalizados da sua sessão
                    </p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-[#0095F6]" />
                </div>

                <div className="mt-3.5 space-y-2.5">
                  {ALL_CATEGORIES.map((category) => {
                    const rawScore = profile[category] ?? 0;
                    const clampedWidth = Math.min(100, Math.max(0, rawScore));
                    const style = CATEGORY_STYLES[category];
                    const isBubble = rawScore >= 70;
                    const isSilenced = rawScore <= 29;

                    return (
                      <div key={category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-semibold text-foreground">
                            <span>{style.emoji}</span>
                            <span>{category}</span>
                            {isBubble && (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400">
                                BOLHA
                              </span>
                            )}
                            {isSilenced && (
                              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-extrabold text-rose-600 dark:text-rose-400">
                                CEGA
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-xs font-bold text-foreground">
                            {Math.round(rawScore)}%
                          </span>
                        </div>

                        <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <div
                            style={{ width: `${clampedWidth}%` }}
                            className={`h-full rounded-full bg-gradient-to-r ${style.bar} transition-all duration-500`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-[11px]">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2">
                    <span className="block font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                      {bubbleCore.length}
                    </span>
                    <span className="text-muted">Dominantes</span>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-2">
                    <span className="block font-mono text-sm font-black text-foreground">
                      {neutralZone.length}
                    </span>
                    <span className="text-muted">Neutros</span>
                  </div>
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2">
                    <span className="block font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                      {blindZone.length}
                    </span>
                    <span className="text-muted">Silenciados</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>

      {/* =====================================================================
          BOTTOM NAVIGATION BAR FIXA NO MOBILE (< 768px) COM SAFE-AREA
      ===================================================================== */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-border bg-background/90 py-2 pb-safe backdrop-blur-md md:hidden">
        <button
          type="button"
          onClick={() => {
            setMobileSheet("none");
            setInspectedPostId(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-bold transition ${
            mobileSheet === "none" ? "text-foreground" : "text-muted"
          }`}
        >
          <Home className="h-5 w-5" />
          <span>Feed</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setMobileSheet((prev) =>
              prev === "trending" ? "none" : "trending"
            )
          }
          className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-bold transition ${
            mobileSheet === "trending" ? "text-orange-500" : "text-muted"
          }`}
        >
          <Compass className="h-5 w-5" />
          <span>Explorar</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setMobileSheet((prev) =>
              prev === "telemetry" ? "none" : "telemetry"
            )
          }
          className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-bold transition ${
            mobileSheet === "telemetry" ? "text-[#0095F6]" : "text-muted"
          }`}
        >
          <BarChart3 className="h-5 w-5" />
          <span>Bolha ({bubbleCore.length})</span>
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={isBusy}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-bold text-muted transition hover:text-foreground disabled:opacity-40"
        >
          <RotateCcw
            className={`h-5 w-5 ${isResetting ? "animate-spin" : ""}`}
          />
          <span>Reset</span>
        </button>
      </nav>
    </div>
  );
}
