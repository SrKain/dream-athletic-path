import { ExternalLink, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { youtubeEmbedUrl, youtubeThumbnail, youtubeWatchUrl } from "@/lib/youtube";

export function PublicYoutubePlayer({
  url,
  title,
  autoPlay = false,
  aspectClass = "aspect-video",
}: {
  url: string;
  title: string;
  autoPlay?: boolean;
  aspectClass?: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const embedUrl = youtubeEmbedUrl(url, { autoplay: autoPlay, muted: autoPlay, playsinline: true });
  const thumbnailUrl = youtubeThumbnail(url);
  const watchUrl = youtubeWatchUrl(url);

  useEffect(() => {
    if (!autoPlay || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setIsLoaded(true);
  }, [autoPlay]);

  if (!embedUrl || !watchUrl) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-black shadow-lg">
      <div className={`relative w-full ${aspectClass}`}>
        {isLoaded ? (
          <iframe
            src={embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading={autoPlay ? "eager" : "lazy"}
            className="h-full w-full border-0"
          />
        ) : (
          <>
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="h-full w-full bg-surface" />
            )}
            <button
              type="button"
              onClick={() => setIsLoaded(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              aria-label={`Play ${title}`}
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </span>
            </button>
          </>
        )}
      </div>
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center justify-center gap-2 bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        Watch on YouTube <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
