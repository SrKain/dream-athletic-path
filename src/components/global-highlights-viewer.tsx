import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Share2,
  Star,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { likeHighlightVideo } from "@/lib/athletes.functions";
import { buildRecruitWhatsappUrl } from "@/lib/contact";
import { getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import { youtubeEmbedUrl } from "@/lib/youtube";
import type { HighlightFeedItem } from "@/types/db";

interface GlobalHighlightsViewerProps {
  feed: HighlightFeedItem[];
  startIndex: number;
  onClose: () => void;
}

export function GlobalHighlightsViewer({ feed, startIndex, onClose }: GlobalHighlightsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(startIndex, feed.length - 1)),
  );
  const [isMuted, setIsMuted] = useState(true);
  const [likesState, setLikesState] = useState<
    Record<string, { count: number; userLiked: boolean }>
  >(() => {
    const initial: Record<string, { count: number; userLiked: boolean }> = {};
    for (const item of feed) {
      initial[item.id] = { count: item.likesCount || 0, userLiked: false };
    }
    return initial;
  });

  const [likingId, setLikingId] = useState<string | null>(null);
  const touchStartY = useRef(0);

  // Load liked items from localStorage to prevent spamming
  useEffect(() => {
    try {
      const storedLikes = localStorage.getItem("gtg_highlight_likes");
      if (storedLikes) {
        const likedIds: string[] = JSON.parse(storedLikes);
        setLikesState((prev) => {
          const next = { ...prev };
          for (const id of likedIds) {
            if (next[id]) {
              next[id] = { ...next[id], userLiked: true };
            }
          }
          return next;
        });
      }
    } catch {
      // safe fallback
    }
  }, []);

  const goTo = useCallback(
    (dir: 1 | -1) => {
      setCurrentIndex((prev) => {
        const next = prev + dir;
        if (next < 0 || next >= feed.length) return prev;
        return next;
      });
    },
    [feed.length],
  );

  // Keyboard navigation and lock background scroll
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowUp" || event.key === "k") goTo(-1);
      if (event.key === "ArrowDown" || event.key === "j") goTo(1);
      if (event.key === "m" || event.key === "M") setIsMuted((m) => !m);
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [goTo, onClose]);

  // Touch swipe support (vertical swipe)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;
    if (Math.abs(diff) > 45) {
      goTo(diff > 0 ? 1 : -1);
    }
  };

  const currentItem = feed[currentIndex];

  // Handle Like Action (Star) with Optimistic UI & server sync
  const handleLike = async () => {
    if (!currentItem) return;
    const itemId = currentItem.id;
    const currentStatus = likesState[itemId] || { count: currentItem.likesCount, userLiked: false };

    if (currentStatus.userLiked || likingId === itemId) {
      toast.info("You already starred this highlight clip!");
      return;
    }

    setLikingId(itemId);

    // Optimistic UI update
    setLikesState((prev) => ({
      ...prev,
      [itemId]: {
        count: currentStatus.count + 1,
        userLiked: true,
      },
    }));

    toast.success("Highlight starred! Signal recorded for recruiting.");

    try {
      // Save locally
      const storedLikes = localStorage.getItem("gtg_highlight_likes");
      const likedIds: string[] = storedLikes ? JSON.parse(storedLikes) : [];
      if (!likedIds.includes(itemId)) {
        likedIds.push(itemId);
        localStorage.setItem("gtg_highlight_likes", JSON.stringify(likedIds));
      }

      // Call server function
      const res = await likeHighlightVideo({
        data: {
          videoId: currentItem.id,
          athleteId: currentItem.athleteId,
          userFingerprint: "web-user",
        },
      });

      if (res && typeof res.count === "number") {
        setLikesState((prev) => ({
          ...prev,
          [itemId]: {
            count: Math.max(currentStatus.count + 1, res.count),
            userLiked: true,
          },
        }));
      }
    } catch {
      // Silent error fallback keeps optimistic state
    } finally {
      setLikingId(null);
    }
  };

  // Handle Share Action
  const handleShare = async () => {
    if (!currentItem) return;
    const shareUrl = `${window.location.origin}/athlete/${currentItem.athleteSlug}`;
    const shareData = {
      title: `${currentItem.athleteName} — Highlight Reel`,
      text: `Watch ${currentItem.athleteName} (${currentItem.positionEn || "Athlete"}) highlight clips on Go Team Go!`,
      url: shareUrl,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          await copyToClipboard(shareUrl);
        }
      }
    } else {
      await copyToClipboard(shareUrl);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Athlete profile link copied to clipboard!");
    } catch {
      toast.error("Could not copy link.");
    }
  };

  if (!currentItem) return null;

  const photoSrc =
    currentItem.athletePhoto ??
    getAthleteDisplayImage({
      photo_url: currentItem.athletePhoto,
      full_name: currentItem.athleteName,
      slug: currentItem.athleteSlug,
      position: currentItem.positionEn
        ? { name_en: currentItem.positionEn, name_pt: null, abbreviation: null }
        : null,
    });

  const embedUrl = youtubeEmbedUrl(currentItem.youtubeUrl, {
    autoplay: true,
    muted: isMuted,
    loop: true,
    controls: false,
  });

  const currentLikeInfo = likesState[currentItem.id] || {
    count: currentItem.likesCount,
    userLiked: false,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${currentItem.athleteName} highlights viewer`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-2xl select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── TOP STORIES-STYLE PROGRESS BAR ── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex flex-col p-3 sm:p-5 bg-gradient-to-b from-black/90 via-black/50 to-transparent">
        {/* Segmented Bar */}
        <div className="flex w-full items-center gap-1 sm:gap-1.5 mb-3">
          {feed.map((item, idx) => (
            <div
              key={item.id}
              className="h-1 sm:h-1.5 flex-1 rounded-full overflow-hidden bg-white/20 transition-all"
            >
              <div
                className={`h-full transition-all duration-300 ${
                  idx < currentIndex
                    ? "w-full bg-[#f69e00]"
                    : idx === currentIndex
                      ? "w-full bg-[#f69e00] shadow-[0_0_8px_#f69e00]"
                      : "w-0"
                }`}
              />
            </div>
          ))}
        </div>

        {/* Top Header Information & Close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/athlete/$slug"
              params={{ slug: currentItem.athleteSlug }}
              className="group flex items-center gap-2.5 focus:outline-none"
            >
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full p-[2px] bg-[#f69e00] shadow-md">
                <img
                  src={photoSrc}
                  alt={currentItem.athleteName}
                  className="h-full w-full rounded-full object-cover object-top"
                />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-sm sm:text-base font-bold text-white group-hover:text-[#f69e00] transition-colors leading-tight">
                    {currentItem.athleteName}
                  </span>
                  {currentItem.countryFlag && (
                    <span className="text-xs">{currentItem.countryFlag}</span>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-[#cad8cf] leading-tight">
                  {currentItem.positionEn || "Athlete"} · Highlight {currentIndex + 1} of{" "}
                  {feed.length}
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Toggle Button */}
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              aria-label={isMuted ? "Unmute video" : "Mute video"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f69e00]"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-[#f69e00]" />
              ) : (
                <Volume2 className="h-4 w-4 text-emerald-400" />
              )}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close highlights"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── MAIN VERTICAL VIDEO FRAME (9:16) ── */}
      <div className="relative my-auto w-full max-w-[min(100%,44vh)] sm:max-w-[min(100%,48vh)] aspect-[9/16] rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/15 overflow-hidden flex items-center justify-center">
        {embedUrl ? (
          <iframe
            key={`${currentItem.id}-${currentIndex}-${isMuted ? "muted" : "unmuted"}`}
            src={embedUrl}
            title={currentItem.title || `${currentItem.athleteName} Highlight`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="eager"
            className="h-full w-full border-0 pointer-events-auto"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <p className="text-sm font-medium text-white">Video unavailable</p>
          </div>
        )}

        {/* Mute indicator pill overlay */}
        {isMuted && (
          <button
            type="button"
            onClick={() => setIsMuted(false)}
            className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md border border-white/10 hover:bg-black/90 transition"
          >
            <VolumeX className="h-3.5 w-3.5 text-[#f69e00]" /> Tap to Unmute
          </button>
        )}

        {/* ── OVERLAY INFERIOR: NOME + POSIÇÃO DA ATLETA NO CANTO INFERIOR ESQUERDO ── */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 sm:p-5 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none">
          <div className="flex flex-col gap-1 max-w-[75%]">
            <h3 className="font-display text-lg sm:text-xl font-bold text-white drop-shadow-md">
              {currentItem.athleteName}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#cad8cf]">
              {currentItem.positionEn && (
                <span className="rounded-md bg-[#032812]/90 border border-[#f69e00]/40 px-2 py-0.5 font-bold text-[#f69e00]">
                  {currentItem.positionEn}
                </span>
              )}
              {currentItem.countryEn && (
                <span className="font-medium text-white/80">{currentItem.countryEn}</span>
              )}
            </div>
            {currentItem.title && (
              <p className="mt-1 text-xs text-white/90 font-medium line-clamp-1">
                {currentItem.title}
              </p>
            )}
          </div>
        </div>

        {/* ── COLUNA LATERAL DE AÇÕES FLUTUANTES (DIREITA) ── */}
        <div className="absolute right-3 bottom-5 z-30 flex flex-col items-center gap-3.5 pointer-events-auto">
          {/* 1. Curtir (Estrelinha) */}
          <button
            type="button"
            onClick={handleLike}
            aria-label="Star this highlight"
            className="group flex flex-col items-center gap-1 focus:outline-none"
          >
            <div
              className={`flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full backdrop-blur-md border transition-all duration-200 active:scale-90 ${
                currentLikeInfo.userLiked
                  ? "bg-[#f69e00] border-[#f69e00] text-black shadow-[0_0_16px_rgba(246,158,0,0.6)]"
                  : "bg-black/60 border-white/20 text-white hover:bg-black/80 hover:border-[#f69e00]/80"
              }`}
            >
              <Star
                className={`h-5 w-5 sm:h-6 sm:w-6 transition-transform group-hover:scale-115 ${
                  currentLikeInfo.userLiked ? "fill-black text-black" : "text-white"
                }`}
              />
            </div>
            <span className="text-[11px] font-bold text-white drop-shadow-md">
              {currentLikeInfo.count}
            </span>
          </button>

          {/* 2. Recrutar (WhatsApp) */}
          <a
            href={buildRecruitWhatsappUrl(currentItem.athleteName)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Recruit ${currentItem.athleteName} via WhatsApp`}
            className="group flex flex-col items-center gap-1 focus:outline-none"
          >
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-emerald-600/90 border border-emerald-400/40 text-white backdrop-blur-md shadow-lg transition-all hover:scale-105 active:scale-95 hover:bg-emerald-500">
              <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 fill-current" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-white drop-shadow-md">
              Recruit
            </span>
          </a>

          {/* 3. Compartilhar (Web Share / Copy Link) */}
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share athlete highlight"
            className="group flex flex-col items-center gap-1 focus:outline-none"
          >
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 border border-white/20 text-white backdrop-blur-md transition-all hover:scale-105 active:scale-95 hover:bg-black/80">
              <Share2 className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-white drop-shadow-md">
              Share
            </span>
          </button>

          {/* 4. Perfil Público */}
          <Link
            to="/athlete/$slug"
            params={{ slug: currentItem.athleteSlug }}
            aria-label={`View ${currentItem.athleteName}'s full profile`}
            className="group flex flex-col items-center gap-1 focus:outline-none"
          >
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 border border-white/20 text-white backdrop-blur-md transition-all hover:scale-105 active:scale-95 hover:bg-[#f69e00] hover:text-black hover:border-[#f69e00]">
              <User className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-white drop-shadow-md">
              Profile
            </span>
          </Link>
        </div>
      </div>

      {/* ── DESKTOP SIDE VERTICAL NAVIGATION CONTROLS ── */}
      <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-30 hidden md:flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => goTo(-1)}
          disabled={currentIndex === 0}
          aria-label="Previous highlight reel"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 disabled:opacity-25 disabled:pointer-events-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f69e00]"
        >
          <ChevronUp className="h-6 w-6" />
        </button>

        <span className="text-xs font-bold text-white bg-black/70 px-3 py-1.5 rounded-full border border-white/20 shadow-md">
          {currentIndex + 1} / {feed.length}
        </span>

        <button
          type="button"
          onClick={() => goTo(1)}
          disabled={currentIndex === feed.length - 1}
          aria-label="Next highlight reel"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 disabled:opacity-25 disabled:pointer-events-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f69e00]"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
      </div>

      {/* ── BOTTOM KEYBOARD HINT ── */}
      <div className="absolute bottom-2.5 text-center text-xs text-white/50 pointer-events-none hidden sm:block">
        Use ↑ / ↓ keys or swipe to browse all highlights · M to toggle audio · ESC to close
      </div>
    </div>
  );
}
