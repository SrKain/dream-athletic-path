import { useEffect, useState, type RefObject } from "react";

export function useInViewAutoplay<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting && entry.intersectionRatio >= 0.55),
      { threshold: [0.55] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return active;
}