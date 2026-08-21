import { ChevronDown, ChevronUp, Play, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PublicYoutubePlayer } from "@/components/public-youtube-player";
import { youtubeThumbnail } from "@/lib/youtube";
import type { AthleteVideo } from "@/types/db";

/**
 * Highlights públicos em formato circular de Stories / Reels ("bolinhas"),
 * com anel em gradiente esmeralda/dourado e visualizador vertical 9:16 imersivo.
 */
export function ReelsRow({ videos, athleteName }: { videos: AthleteVideo[]; athleteName: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!videos || videos.length === 0) return null;

  return (
    <section id="highlights" className="container-edge py-8">
      <div className="rounded-2xl border border-border/70 bg-card/60 p-5 sm:p-6 backdrop-blur-sm shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-3.5 w-3.5 fill-current" />
            </span>
            <h3 className="font-display text-base sm:text-lg font-bold tracking-tight text-foreground">
              Highlight Reels
            </h3>
          </div>
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {videos.length} {videos.length === 1 ? "Clip" : "Clips"}
          </span>
        </div>

        {/* Fileira horizontal com bolinhas circulares de Reels / Stories */}
        <div
          role="region"
          aria-label="Highlight clips list"
          className="flex items-start gap-4 sm:gap-6 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x"
        >
          {videos.map((video, index) => {
            const thumb = youtubeThumbnail(video.youtube_url);
            const title = video.title || `Highlight ${index + 1}`;
            return (
              <button
                key={video.id || index}
                type="button"
                onClick={() => setOpenIndex(index)}
                className="group flex flex-col items-center gap-2 shrink-0 snap-start focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl p-1 transition cursor-pointer"
                aria-label={`Watch ${title} highlight reel`}
              >
                {/* Bolinha circular com anel em gradiente */}
                <div className="relative p-[3px] rounded-full bg-gradient-to-tr from-emerald-500 via-[#dfff1f] to-emerald-400 group-hover:scale-105 group-hover:shadow-[0_0_16px_rgba(16,185,129,0.4)] transition-all duration-300">
                  <div className="p-[2px] rounded-full bg-background">
                    <div className="relative h-18 w-18 sm:h-20 sm:w-20 md:h-22 md:w-22 rounded-full overflow-hidden bg-zinc-900 flex items-center justify-center shadow-inner">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover rounded-full group-hover:scale-110 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full bg-zinc-800" />
                      )}
                      {/* Play overlay */}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/35 group-hover:bg-black/15 transition-colors">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg backdrop-blur-xs group-hover:scale-110 transition-transform">
                          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Título do clip embaixo da bolinha */}
                <span className="w-20 sm:w-22 text-center text-xs font-medium text-foreground/90 group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                  {title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {openIndex !== null && (
        <ReelsOverlay
          videos={videos}
          startIndex={openIndex}
          athleteName={athleteName}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </section>
  );
}

/**
 * Overlay de tela cheia vertical estilo Reels / TikTok com controles acessíveis.
 */
function ReelsOverlay({
  videos,
  startIndex,
  athleteName,
  onClose,
}: {
  videos: AthleteVideo[];
  startIndex: number;
  athleteName: string;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const touchStartY = useRef(0);

  const goTo = useCallback(
    (dir: 1 | -1) => {
      setCurrentIndex((prev) => {
        const next = prev + dir;
        if (next < 0 || next >= videos.length) return prev;
        return next;
      });
    },
    [videos.length],
  );

  // Keyboard navigation & body scroll lock
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowUp" || event.key === "k") goTo(-1);
      if (event.key === "ArrowDown" || event.key === "j") goTo(1);
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [goTo, onClose]);

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;
    if (Math.abs(diff) > 50) {
      goTo(diff > 0 ? 1 : -1);
    }
  };

  const currentVideo = videos[currentIndex];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${athleteName} highlight reels`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-2xl"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4 sm:p-6 bg-gradient-to-b from-black/85 via-black/40 to-transparent">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            {athleteName} · Highlight Reel
          </span>
          <h3 className="text-sm sm:text-base font-bold text-white max-w-[70vw] truncate">
            {currentVideo?.title || `Highlight ${currentIndex + 1}`}
          </h3>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close highlight reels"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Video Frame (9:16 vertical ratio) */}
      <div className="relative my-auto w-full max-w-[min(100%,43vh)] rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10 overflow-hidden">
        {currentVideo ? (
          <PublicYoutubePlayer
            key={`${currentVideo.id}-${currentIndex}`}
            url={currentVideo.youtube_url}
            title={currentVideo.title || `${athleteName} Highlight ${currentIndex + 1}`}
            autoPlay
            aspectClass="aspect-[9/16]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <p className="text-sm font-medium">Video unavailable</p>
          </div>
        )}
      </div>

      {/* Right Side Navigation Controls */}
      <div className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => goTo(-1)}
          disabled={currentIndex === 0}
          aria-label="Previous highlight reel"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 disabled:opacity-25 disabled:pointer-events-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ChevronUp className="h-6 w-6" />
        </button>

        <span className="text-xs font-semibold text-white/90 bg-black/60 px-2.5 py-1 rounded-full border border-white/15">
          {currentIndex + 1}/{videos.length}
        </span>

        <button
          type="button"
          onClick={() => goTo(1)}
          disabled={currentIndex === videos.length - 1}
          aria-label="Next highlight reel"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 disabled:opacity-25 disabled:pointer-events-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom Navigation Hint */}
      <div className="absolute bottom-3 text-center text-xs text-white/60 pointer-events-none hidden sm:block">
        Use ↑ / ↓ arrow keys or scroll to navigate clips · ESC to close
      </div>
    </div>
  );
}
