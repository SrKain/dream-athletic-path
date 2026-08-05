import { useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import confetti from "canvas-confetti";

/**
 * Confetti celebration component that fires when URL contains ?celebrate=true
 * Uses emerald and gold colors from UI&UX.md design system
 */
export function ConfettiCelebration() {
  const search = useSearch({ from: "/_authenticated/portal/" });
  const navigate = useNavigate();

  useEffect(() => {
    // Check if celebrate parameter is present
    const shouldCelebrate = "celebrate" in search && search.celebrate === "true";

    if (!shouldCelebrate) return;

    // Fire confetti bursts with emerald and gold colors
    const duration = 3000; // 3 seconds
    const animationEnd = Date.now() + duration;
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      zIndex: 9999,
      colors: [
        "#30b884", // Emerald (primary)
        "#26a074", // Emerald dark
        "#eab308", // Gold
        "#f5d042", // Gold light
        "#ffffff", // White accent
      ],
    };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        // Remove celebrate parameter from URL after animation completes
        navigate({
          search: ((prev: Record<string, unknown>) => {
            const newSearch = { ...prev };
            delete newSearch.celebrate;
            return newSearch;
          }) as never,
          replace: true,
        });
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      // Fire two bursts - one from each side
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

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [search, navigate]);

  // This component doesn't render anything visible
  return null;
}
