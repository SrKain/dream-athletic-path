import { useEffect, useState } from "react";

export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    const updateProgress = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (scrollHeight > 0) {
        const percentage = Math.min(Math.max((scrollY / scrollHeight) * 100, 0), 100);
        setProgress(percentage);
      } else {
        setProgress(0);
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateProgress);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    updateProgress();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-50 h-[3px] w-full pointer-events-none bg-black/10 dark:bg-white/10 overflow-hidden"
    >
      <div
        className="h-full bg-gradient-to-r from-primary via-emerald-500 to-gold transition-none motion-safe:transition-[width] motion-safe:duration-75 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
