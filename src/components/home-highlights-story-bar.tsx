import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useRef, useState, useEffect } from "react";

import { getAthleteStoryAvatar } from "@/lib/image-transform";
import { getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import type { HighlightStoryAthlete } from "@/types/db";

interface HomeHighlightsStoryBarProps {
  stories: HighlightStoryAthlete[];
  onSelectAthlete: (story: HighlightStoryAthlete) => void;
}

export function HomeHighlightsStoryBar({ stories, onSelectAthlete }: HomeHighlightsStoryBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [stories]);

  const scrollBy = (offset: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  if (!stories || stories.length === 0) return null;

  return (
    <section
      id="highlights-bar"
      aria-label="Athletes Highlights"
      className="border-b border-border/70 bg-surface/50 pt-9 pb-6 md:pt-12 md:pb-8"
    >
      <div className="container-edge">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#f69e00] animate-pulse" />
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground md:text-xl">
              Highlights
            </h2>
            <span className="text-xs font-bold text-foreground/80">
              · {stories.length} {stories.length === 1 ? "Athlete" : "Athletes"}
            </span>
          </div>

          {/* Desktop Scroll Controls */}
          <div className="hidden sm:flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => scrollBy(-240)}
              disabled={!canScrollLeft}
              aria-label="Scroll highlights left"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-card/80 text-foreground transition hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f69e00]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(240)}
              disabled={!canScrollRight}
              aria-label="Scroll highlights right"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-card/80 text-foreground transition hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f69e00]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Trilha horizontal de bolinhas */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          role="region"
          aria-label="Athletes Highlights Reel"
          className="flex items-start gap-4 sm:gap-6 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x snap-mandatory"
        >
          {stories.map((story) => {
            const photoSrc =
              story.photoUrl ??
              getAthleteDisplayImage({
                photo_url: story.photoUrl,
                full_name: story.athleteName,
                slug: story.athleteSlug,
                position: story.positionEn
                  ? { name_en: story.positionEn, name_pt: null, abbreviation: null }
                  : null,
              });

            const firstName = story.athleteName.split(" ")[0];
            const lastName = story.athleteName.split(" ").slice(1).join(" ");
            const shortName = lastName ? `${firstName} ${lastName.charAt(0)}.` : firstName;

            return (
              <button
                key={story.athleteId}
                type="button"
                onClick={() => onSelectAthlete(story)}
                className="group flex flex-col items-center gap-2 shrink-0 snap-start focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f69e00] rounded-xl p-1 transition cursor-pointer"
                aria-label={`Watch highlights for ${story.athleteName}`}
              >
                {/* Bolinha com anel de cor fixa laranja oficial (#f69e00) */}
                <div className="relative p-[3px] rounded-full bg-[#f69e00] group-hover:scale-105 group-hover:shadow-[0_0_16px_rgba(246,158,0,0.45)] transition-all duration-300">
                  <div className="p-[2px] rounded-full bg-background">
                    <div className="relative h-16 w-16 sm:h-18 sm:w-18 md:h-20 md:w-20 rounded-full overflow-hidden bg-zinc-900 flex items-center justify-center shadow-inner">
                      <img
                        src={getAthleteStoryAvatar(photoSrc)}
                        alt={story.athleteName}
                        className="h-full w-full object-cover object-top group-hover:scale-110 transition-transform duration-300"
                        loading="lazy"
                      />
                      {/* Play overlay sutil ao hover */}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f69e00] text-black shadow-md">
                          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Badge de quantidade de vídeos se > 1 */}
                  {story.highlightsCount > 1 && (
                    <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#032812] px-1 text-[10px] font-bold text-[#f69e00] ring-2 ring-background shadow-xs">
                      {story.highlightsCount}
                    </span>
                  )}
                </div>

                {/* Nome do atleta abaixo em Quicksand Bold */}
                <div className="flex flex-col items-center max-w-[76px] sm:max-w-[84px] text-center">
                  <span className="truncate text-xs font-bold text-foreground group-hover:text-[#f69e00] transition-colors leading-tight">
                    {shortName}
                  </span>
                  {story.positionEn && (
                    <span className="text-[11px] font-semibold text-foreground/75 truncate leading-tight">
                      {story.positionEn}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
