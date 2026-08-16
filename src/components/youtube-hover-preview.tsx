import { useRef, useState } from "react";

import { useInViewAutoplay } from "@/hooks/use-in-view-autoplay";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/youtube";

export function YoutubeHoverPreview({
  url,
  imageUrl,
  title,
}: {
  url?: string | null;
  imageUrl: string;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewAutoplay(ref);
  const [hovered, setHovered] = useState(false);
  const embed = url ? youtubeEmbedUrl(url, { autoplay: true, loop: true }) : null;
  const thumbnail = (url && youtubeThumbnailUrl(url)) || imageUrl;
  const playing = Boolean(embed && (hovered || inView));

  return (
    <div
      ref={ref}
      className="relative h-full w-full overflow-hidden bg-muted"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img src={thumbnail} alt={title} className="h-full w-full object-cover object-top" />
      {playing && embed && (
        <iframe
          src={embed}
          title={`Prévia de vídeo de ${title}`}
          className="pointer-events-none absolute inset-0 h-full w-full scale-[1.02]"
          allow="autoplay; encrypted-media"
          loading="lazy"
        />
      )}
    </div>
  );
}
