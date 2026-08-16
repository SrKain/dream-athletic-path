import { ChevronDown, ChevronUp, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { youtubeEmbedUrl, youtubeThumbnail } from "@/lib/youtube";
import type { AthleteVideo } from "@/types/db";

/**
 * Carrossel horizontal de Highlights em formato de Stories do Instagram.
 * Ao clicar, abre o player vertical em tela cheia (Reels / Shorts).
 */
export function ReelsRow({
  videos,
  athleteName,
}: {
  videos: AthleteVideo[];
  athleteName: string;
}) {
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

      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-none">
        {videos.map((video, index) => {
          const thumb = youtubeThumbnail(video.youtube_url);
          const title = video.title || `Highlight ${index + 1}`;

          return (
            <button
              key={video.id || index}
              onClick={() => setOpenIndex(index)}
              className="group shrink-0 flex flex-col items-center text-center cursor-pointer transition hover:scale-105"
              aria-label={`Watch highlight: ${title}`}
            >
              {/* Instagram-style colorful ring */}
              <span className="block rounded-full bg-gradient-to-tr from-primary via-[var(--gold)] to-accent p-[2.5px] shadow-md transition group-hover:shadow-primary/30">
                <span className="block h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-full border-2 border-background bg-surface">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-primary/20 text-primary">
                      <Play className="h-7 w-7 fill-current ml-0.5" />
                    </div>
                  )}
                </span>
              </span>
              <span className="mt-2 block max-w-[84px] sm:max-w-[96px] truncate text-xs font-medium text-muted-foreground group-hover:text-foreground">
                {title}
              </span>
            </button>
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
  const embedUrl = currentVideo
    ? youtubeEmbedUrl(currentVideo.youtube_url, {
        autoplay: true,
        playsinline: true,
      })
    : null;

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
      <div className="relative aspect-[9/16] h-full max-h-[82vh] sm:max-h-[86vh] w-full max-w-[min(100%,50vh)] overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10 my-auto">
        {embedUrl ? (
          <iframe
            key={`${currentVideo.id}-${currentIndex}`}
            src={embedUrl}
            title={currentVideo.title || `${athleteName} Highlight ${currentIndex + 1}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full border-0"
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
