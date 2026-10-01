import { useEffect, useRef, useState } from "react";

import { useCenterInView } from "@/hooks/use-center-in-view";
import { youtubeEmbedUrl } from "@/lib/youtube";

/**
 * Capa do card do catálogo: foto por padrão e prévia em vídeo (YouTube mudo)
 * no hover em desktop ou automaticamente no card centralizado em mobile.
 */
export function AthleteVideoCardMedia({
  photoUrl,
  alt,
  videoUrl,
  children,
}: {
  photoUrl: string;
  alt: string;
  videoUrl?: string | null;
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverCapable, setHoverCapable] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setHoverCapable(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const centered = useCenterInView(containerRef, !hoverCapable && Boolean(videoUrl));
  const active = Boolean(videoUrl) && !reducedMotion && (hoverCapable ? hovered : centered);
  const embed = active
    ? youtubeEmbedUrl(videoUrl, { autoplay: true, controls: false, loop: true, muted: true })
    : null;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative aspect-[3/4] overflow-hidden bg-muted"
    >
      <img
        src={photoUrl}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
      />
      {embed && (
        <iframe
          src={embed}
          title={`Prévia de ${alt}`}
          allow="autoplay; encrypted-media"
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-[190%] w-[190%] -translate-x-[24%] -translate-y-[24%] animate-fade-in border-0"
        />
      )}
      {children}
    </div>
  );
}
