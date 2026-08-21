import { useEffect, useRef, useState } from "react";

interface UseActiveSectionOptions {
  sectionIds: string[];
  rootMargin?: string;
  threshold?: number | number[];
}

export function useActiveSection({
  sectionIds,
  rootMargin = "-110px 0px -50% 0px",
  threshold = 0,
}: UseActiveSectionOptions) {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] || "");
  const manualClickTimer = useRef<NodeJS.Timeout | null>(null);
  const isManualScrolling = useRef<boolean>(false);

  const handleManualSelect = (id: string) => {
    setActiveId(id);
    isManualScrolling.current = true;
    if (manualClickTimer.current) clearTimeout(manualClickTimer.current);
    manualClickTimer.current = setTimeout(() => {
      isManualScrolling.current = false;
    }, 800);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (isManualScrolling.current) return;

        // Find the visible entry with the highest intersection ratio or topmost in viewport
        const visibleEntries = entries.filter((e) => e.isIntersecting);
        if (visibleEntries.length > 0) {
          // Sort by their position in document / top
          const topEntry = visibleEntries.reduce((prev, current) =>
            prev.boundingClientRect.top < current.boundingClientRect.top ? prev : current,
          );
          if (topEntry.target.id) {
            setActiveId(topEntry.target.id);
          }
        }
      },
      {
        rootMargin,
        threshold,
      },
    );

    const elements: HTMLElement[] = [];
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
        elements.push(el);
      }
    });

    return () => {
      observer.disconnect();
      if (manualClickTimer.current) clearTimeout(manualClickTimer.current);
    };
  }, [sectionIds, rootMargin, threshold]);

  return { activeId, setActiveId: handleManualSelect };
}
