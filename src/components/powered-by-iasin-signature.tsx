import { useEffect, useRef, useState } from "react";

interface PoweredByIasinSignatureProps {
  className?: string;
}

export function PoweredByIasinSignature({ className = "" }: PoweredByIasinSignatureProps) {
  const containerRef = useRef<HTMLAnchorElement>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleMouseEnter = () => {
    // Replay animation smoothly on hover
    setAnimKey((prev) => prev + 1);
  };

  return (
    <a
      ref={containerRef}
      href="https://iasin.dev.br"
      target="_blank"
      rel="noreferrer"
      aria-label="Powered by Iasin"
      onMouseEnter={handleMouseEnter}
      className={`group inline-flex items-center gap-2 text-[10px] opacity-70 transition-opacity duration-300 hover:opacity-100 md:text-xs ${className}`}
    >
      <span className="uppercase tracking-[0.2em]">Powered by</span>
      <span className="relative inline-block font-semibold normal-case tracking-[0.14em]">
        <span className="relative z-10">iasin.</span>
        <svg
          key={animKey}
          aria-hidden="true"
          viewBox="0 0 100 8"
          fill="none"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none absolute -bottom-1 left-0 h-[3.5px] w-full overflow-visible"
        >
          <path
            d="M 2,4 L 98,4"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset={hasEnteredViewport ? 0 : 100}
            className={`text-foreground/75 ${
              hasEnteredViewport ? "animate-iasin-stroke" : "opacity-0"
            } motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:[stroke-dashoffset:0]`}
          />
        </svg>
      </span>
    </a>
  );
}
