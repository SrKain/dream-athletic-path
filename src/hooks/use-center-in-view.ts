import { useEffect, useState, type RefObject } from "react";

/**
 * Retorna true quando o elemento está próximo do centro da viewport.
 * Usado para autoplay das prévias em telas touch (mobile).
 */
export function useCenterInView(ref: RefObject<HTMLElement | null>, enabled = true) {
  const [centered, setCentered] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof IntersectionObserver === "undefined") {
      setCentered(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setCentered(entry.isIntersecting && entry.intersectionRatio > 0.7),
      { rootMargin: "-30% 0px -30% 0px", threshold: [0, 0.7, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, ref]);

  return centered;
}
