import { useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import confetti from "canvas-confetti";

const CONFETTI_COLORS = [
  "#30b884", // Emerald (primary)
  "#26a074", // Emerald dark
  "#eab308", // Gold
  "#f5d042", // Gold light
  "#ffffff", // White accent
];

/**
 * Fires a confetti celebration. Returns a cleanup function that stops the animation.
 * `zIndex` allows rendering behind modal overlays.
 */
export function fireConfetti({ duration = 3000, zIndex = 9999 } = {}) {
  const animationEnd = Date.now() + duration;
  const defaults = {
    startVelocity: 30,
    spread: 360,
    ticks: 60,
    zIndex,
    colors: CONFETTI_COLORS,
  };

  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      clearInterval(interval);
      return;
    }
    const particleCount = 50 * (timeLeft / duration);
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);

  return () => clearInterval(interval);
}

/**
 * Confetti celebration component that fires when URL contains ?celebrate=true
 * Uses emerald and gold colors from UI&UX.md design system
 */
export function ConfettiCelebration() {
  const search = useSearch({ from: "/_authenticated/portal/" });
  const navigate = useNavigate();

  useEffect(() => {
    const shouldCelebrate = "celebrate" in search && search.celebrate === "true";
    if (!shouldCelebrate) return;

    const duration = 3000;
    const stop = fireConfetti({ duration });
    const timeout = setTimeout(() => {
      navigate({
        search: ((prev: Record<string, unknown>) => {
          const newSearch = { ...prev };
          delete newSearch.celebrate;
          return newSearch;
        }) as never,
        replace: true,
      });
    }, duration);

    return () => {
      stop();
      clearTimeout(timeout);
    };
  }, [search, navigate]);

  // This component doesn't render anything visible
  return null;
}
