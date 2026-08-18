import { ChevronDown, ChevronUp, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PublicYoutubePlayer } from "@/components/public-youtube-player";
import { youtubeThumbnail } from "@/lib/youtube";
import type { AthleteVideo } from "@/types/db";

/**
 * Highlights públicos com players verticais autoplay e um visualizador de tela
 * cheia opcional para acompanhar os clips em sequência.
 */
export function ReelsRow({ videos, athleteName }: { videos: AthleteVideo[]; athleteName: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!videos || videos.length === 0) return null;

  return (
    <section className="container-edge py-8">
      <div className="flex items-center justify-between mb-4">
        <p className="eyebrow text-primary">Highlights</p>
        <span className="text-xs text-muted-foreground">
          {videos.length} {videos.length === 1 ? "clip" : "clips"}
        </span>
      </div>

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 scrollbar-none md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3">
        {videos.map((video, index) => {
          const thumb = youtubeThumbnail(video.youtube_url);
          const title = video.title || `Highlight ${index + 1}`;
          return (
            <article
              key={video.id || index}
              className="group w-[72vw] max-w-[19rem] shrink-0 snap-center overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg md:w-auto md:max-w-none"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                className="relative block aspect-[9/16] w-full bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={`Play highlight: ${title}`}
              >
                {thumb ? (
                  <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-full w-full bg-surface" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/40">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </span>
                </span>
              </button>
              <button
                onClick={() => setOpenIndex(index)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open highlight: ${title}`}
              >
                <span className="truncate">{title}</span>
                <Play className="h-4 w-4 shrink-0 fill-current text-primary" />
              </button>
            </article>
          );
        })}
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
 * Overlay de tela cheia vertical estilo Reels / TikTok.
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-2xl"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4 sm:p-6 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {athleteName} · Highlight
          </span>
          <h3 className="text-sm sm:text-base font-bold text-white max-w-[70vw] truncate">
            {currentVideo?.title || `Highlight ${currentIndex + 1}`}
          </h3>
        </div>

        <button
          onClick={onClose}
          aria-label="Close highlights"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Video Frame (9:16 vertical ratio) */}
      <div className="relative my-auto w-full max-w-[min(100%,43vh)] rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10">
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
          onClick={() => goTo(-1)}
          disabled={currentIndex === 0}
          aria-label="Previous highlight"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
        >
          <ChevronUp className="h-6 w-6" />
        </button>

        <span className="text-xs font-semibold text-white/80 bg-black/50 px-2 py-1 rounded-full">
          {currentIndex + 1}/{videos.length}
        </span>

        <button
          onClick={() => goTo(1)}
          disabled={currentIndex === videos.length - 1}
          aria-label="Next highlight"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-3 text-center text-xs text-white/50 pointer-events-none hidden sm:block">
        Use ↑ / ↓ arrow keys or scroll to navigate · ESC to close
      </div>
    </div>
  );
}
