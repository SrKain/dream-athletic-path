import { ExternalLink } from "lucide-react";

import { youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/youtube";

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
  const embedUrl = youtubeEmbedUrl(url, { autoplay: autoPlay, muted: autoPlay, playsinline: true });
  const watchUrl = youtubeWatchUrl(url);

  if (!embedUrl || !watchUrl) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-black shadow-lg">
      <div className={`relative w-full ${aspectClass}`}>
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          className="h-full w-full border-0"
        />
      </div>
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-10 items-center justify-center gap-2 bg-card/90 px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        Open on YouTube <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
