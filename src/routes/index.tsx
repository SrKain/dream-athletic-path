import { Link, createFileRoute } from "@tanstack/react-router";
import { MessageCircle, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { AthleteVideoCardMedia } from "@/components/athlete-video-card-media";
import { ConfigurationNotice } from "@/components/configuration-notice";
import { PoweredByIasinSignature } from "@/components/powered-by-iasin-signature";
import { CatalogSkeleton } from "@/components/skeletons/catalog-skeleton";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { useI18n } from "@/i18n/i18n-provider";
import { listPublicAthletes, type PublicCatalogPayload } from "@/lib/athletes.functions";
import {
  buildAthleteShelves,
  filterAthletes,
  getAthleteCountryEn,
  getAthleteGradYear,
  getAthletePositionEn,
  getAthleteStatus,
} from "@/lib/catalog";
import { RECRUIT_WHATSAPP_NUMBER } from "@/lib/contact";
import { catalogHeroImage, getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { formatHeightImperial } from "@/lib/units";
import type { AthleteCard } from "@/types/db";

export const Route = createFileRoute("/")({
  loader: () => listPublicAthletes(),
  pendingComponent: CatalogSkeleton,
  pendingMs: 200,
  head: () => ({
    meta: [
      { title: "Athlete Catalog — Go Team Go Agency" },
      {
        name: "description",
        content:
          "Explore top Brazilian volleyball recruits ready to compete and study in the USA. Verified academic credentials, game film, and athletic metrics.",
      },
      { property: "og:title", content: "Athlete Catalog — Go Team Go Agency" },
      {
        property: "og:description",
        content:
          "Explore top Brazilian volleyball recruits ready to compete and study in the USA. Verified academic credentials, game film, and athletic metrics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Catalog,
});

function Catalog() {
  const { athletes, configured, visual, positionOrder, featureVideos } =
    Route.useLoaderData() as PublicCatalogPayload;
  const { pick } = useI18n();
  const [search, setSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [selectedGradYears, setSelectedGradYears] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  const catalogAthletes = athletes;

  // 1. Position Options
  const positions = useMemo(() => {
    const list = Array.from(
      new Set(catalogAthletes.map((item) => getAthletePositionEn(item)).filter(Boolean)),
    ) as string[];
    return list.sort((a, b) => a.localeCompare(b, "en-US"));
  }, [catalogAthletes]);

  // 2. High School Graduation Year Options
  const gradYears = useMemo(() => {
    const extracted = new Set<string>();
    for (const item of catalogAthletes) {
      const yr = getAthleteGradYear(item);
      if (yr) extracted.add(yr);
    }
    if (extracted.size === 0) {
      return ["2024", "2025", "2026", "2027", "2028"];
    }
    return Array.from(extracted).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [catalogAthletes]);

  // 3. Country Options
  const countries = useMemo(() => {
    const list = Array.from(
      new Set(catalogAthletes.map((item) => getAthleteCountryEn(item)).filter(Boolean)),
    ) as string[];
    return list.sort((a, b) => a.localeCompare(b, "en-US"));
  }, [catalogAthletes]);

  // 4. Student Status Options
  const studentStatuses = useMemo(() => {
    const standardStatuses = [
      "High School",
      "Freshman",
      "Sophomore",
      "Junior",
      "Senior",
      "Graduate Transfer",
    ];
    const present = new Set(
      catalogAthletes.map((item) => getAthleteStatus(item)).filter(Boolean) as string[],
    );
    const combined = Array.from(new Set([...standardStatuses, ...present]));
    return combined;
  }, [catalogAthletes]);

  const togglePosition = (pos: string) => {
    setSelectedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos],
    );
  };

  const toggleGradYear = (year: string) => {
    setSelectedGradYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year],
    );
  };

  const toggleCountry = (countryName: string) => {
    setSelectedCountries((prev) =>
      prev.includes(countryName) ? prev.filter((c) => c !== countryName) : [...prev, countryName],
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const hasActiveFilters =
    search.trim().length > 0 ||
    selectedPositions.length > 0 ||
    selectedGradYears.length > 0 ||
    selectedCountries.length > 0 ||
    selectedStatuses.length > 0;

  const showFilterChips = isSearchFocused || Boolean(search.trim()) || hasActiveFilters;

  const clearAllFilters = () => {
    setSearch("");
    setSelectedPositions([]);
    setSelectedGradYears([]);
    setSelectedCountries([]);
    setSelectedStatuses([]);
  };

  const filtered = useMemo(
    () =>
      filterAthletes(catalogAthletes, {
        countries: selectedCountries,
        gradYears: selectedGradYears,
        positions: selectedPositions,
        search,
        studentStatuses: selectedStatuses,
      }),
    [
      catalogAthletes,
      search,
      selectedCountries,
      selectedGradYears,
      selectedPositions,
      selectedStatuses,
    ],
  );

  const shelves = useMemo(
    () => buildAthleteShelves(filtered, positionOrder),
    [filtered, positionOrder],
  );

  const heroTitle =
    visual?.hero_title_en ||
    visual?.hero_title_pt ||
    "Athletes ready to play, study, and compete in the USA.";

  const heroSubtitle =
    visual?.hero_subtitle_en ||
    visual?.hero_subtitle_pt ||
    "Explore athlete profiles by position, watch game film, and discover top Brazilian recruits with verified academic and athletic credentials.";

  const catalogHeading = visual?.catalog_heading_en || visual?.catalog_heading_pt || "Our Athletes";
  const heroImageSrc = visual?.hero_background_url || catalogHeroImage;

  if (!configured || !isSupabaseConfigured) return <ConfigurationNotice />;

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground flex flex-col justify-between">
      <div>
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
          <div className="container-edge flex h-16 items-center justify-between md:h-20">
            <Link to="/" className="flex items-center gap-3">
              {visual?.logo_url ? (
                <img
                  src={visual.logo_url}
                  alt="Go Team Go"
                  className="h-8 md:h-10 w-auto object-contain"
                />
              ) : (
                <span className="font-display text-xl md:text-2xl font-bold tracking-tight text-foreground">
                  Go Team Go
                </span>
              )}
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border/70 min-h-[380px] md:min-h-[460px] flex items-center">
          <div className="absolute inset-0 z-0">
            <img
              src={heroImageSrc}
              alt=""
              className="h-full w-full object-cover object-center"
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#061b13] via-[#061b13]/95 to-[#061b13]/40 md:via-[#061b13]/90 md:to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#061b13]/80 via-transparent to-transparent" />
          </div>

          <div className="container-edge relative z-10 py-12 md:py-16">
            <div className="max-w-2xl">
              <h1 className="font-display text-[clamp(2.2rem,4.5vw,3.8rem)] font-semibold leading-[1.08] tracking-tight text-[#f4f7e9]">
                {heroTitle}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-[#b9c4bc] md:text-lg">
                {heroSubtitle}
              </p>
            </div>
          </div>
        </section>

        {/* Catalog Section */}
        <section id="catalog" className="container-edge py-10 md:py-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2 border-b border-border/70 pb-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
              {catalogHeading}
            </h2>
            <p className="text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "published athlete" : "published athletes"}
            </p>
          </div>

          {/* Filter Bar with 4 Specific Filters */}
          <div
            ref={filterBarRef}
            onBlur={(e) => {
              if (filterBarRef.current && filterBarRef.current.contains(e.relatedTarget as Node)) {
                return;
              }
              setIsSearchFocused(false);
            }}
            className="glass-panel rounded-xl p-4 sm:p-5"
          >
            {/* Top row: Search input & Clear all button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <label className="flex h-11 flex-1 min-w-0 items-center gap-2.5 rounded-lg border border-border/70 bg-background/70 px-3.5 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Search athlete, position, country, or graduation year"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search text"
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-card/60 px-4 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Clear all
                </button>
              )}
            </div>

            {/* Collapsible Filter Chips */}
            <div
              className={`grid transition-all duration-300 ease-out ${
                showFilterChips
                  ? "grid-rows-[1fr] opacity-100 mt-4 pt-3 border-t border-border/50"
                  : "grid-rows-[0fr] opacity-0 mt-0 pointer-events-none"
              }`}
            >
              <div className="overflow-hidden space-y-4">
                {/* 1. Position */}
                {positions.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Position
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 pt-0.5">
                      {positions.map((pos) => {
                        const active = selectedPositions.includes(pos);
                        return (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => togglePosition(pos)}
                            aria-pressed={active}
                            className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              active
                                ? "border-primary/50 bg-primary/10 font-semibold text-primary shadow-xs"
                                : "border-border/70 bg-card/60 text-card-foreground hover:bg-muted"
                            }`}
                          >
                            <span>{pos}</span>
                            {active && <X className="h-3 w-3 opacity-70" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. High School Graduation Year */}
                {gradYears.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      High School Graduation Year
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 pt-0.5">
                      {gradYears.map((year) => {
                        const active = selectedGradYears.includes(year);
                        return (
                          <button
                            key={year}
                            type="button"
                            onClick={() => toggleGradYear(year)}
                            aria-pressed={active}
                            className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              active
                                ? "border-primary/50 bg-primary/10 font-semibold text-primary shadow-xs"
                                : "border-border/70 bg-card/60 text-card-foreground hover:bg-muted"
                            }`}
                          >
                            <span>{year}</span>
                            {active && <X className="h-3 w-3 opacity-70" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Country */}
                {countries.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Country
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 pt-0.5">
                      {countries.map((cntry) => {
                        const active = selectedCountries.includes(cntry);
                        return (
                          <button
                            key={cntry}
                            type="button"
                            onClick={() => toggleCountry(cntry)}
                            aria-pressed={active}
                            className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              active
                                ? "border-primary/50 bg-primary/10 font-semibold text-primary shadow-xs"
                                : "border-border/70 bg-card/60 text-card-foreground hover:bg-muted"
                            }`}
                          >
                            <span>{cntry}</span>
                            {active && <X className="h-3 w-3 opacity-70" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 4. Student Status */}
                {studentStatuses.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Student Status
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 pt-0.5">
                      {studentStatuses.map((status) => {
                        const active = selectedStatuses.includes(status);
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => toggleStatus(status)}
                            aria-pressed={active}
                            className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              active
                                ? "border-primary/50 bg-primary/10 font-semibold text-primary shadow-xs"
                                : "border-border/70 bg-card/60 text-card-foreground hover:bg-muted"
                            }`}
                          >
                            <span>{status}</span>
                            {active && <X className="h-3 w-3 opacity-70" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Athlete Shelves by Position */}
          {filtered.length ? (
            <div className="mt-10 space-y-12">
              {shelves.map((shelf) => (
                <AthleteShelf
                  key={shelf.key}
                  title={shelf.title}
                  description={shelf.description}
                  athletes={shelf.athletes}
                  pick={pick}
                  featureVideos={featureVideos}
                />
              ))}
            </div>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 rounded-xl border border-border/70 bg-card/40 my-10 p-6">
              <p className="text-base font-medium text-foreground">
                No athletes found matching your search.
              </p>
              <p className="text-sm text-muted-foreground max-w-md">
                Try adjusting your search keywords, position, graduation year, country, or status
                filters.
              </p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-card/80 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <RotateCcw className="h-4 w-4" /> Clear filters
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Final CTA Section */}
      <section className="container-edge mt-14 md:mt-20">
        <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-[#082319] via-[#051710] to-[#040e0a] p-8 text-center text-[#f4f7e9] shadow-xl md:p-12">
          {/* Decorative background glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
          />

          <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center">
            <span className="eyebrow inline-block text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase md:text-sm">
              Looking for talent?
            </span>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
              Let's find your next athlete.
            </h2>
            <p className="mt-3 max-w-md text-sm text-[#b9c4bc] md:text-base">
              Connect with our recruitment directors to discover available prospects and receive
              comprehensive athletic profiles.
            </p>
            <div className="mt-6 flex justify-center">
              <a
                href={`https://wa.me/${RECRUIT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
                  "Hello! I'm looking for talent and would like to talk to Go Team Go Agency about available athletes.",
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="liquid-button inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold shadow-lg transition duration-300 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>Talk to Go Team Go</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-16 border-t border-border/70 bg-background/60 py-10">
        <div className="container-edge flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            {visual?.logo_url ? (
              <img src={visual.logo_url} alt="Go Team Go" className="h-7 w-auto object-contain" />
            ) : (
              <span className="font-display text-lg font-bold tracking-tight">Go Team Go</span>
            )}
            <span className="text-xs text-muted-foreground">
              · Connecting elite athletes with college programs across the USA.
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Go Team Go Agency. All rights reserved.</span>
            <PoweredByIasinSignature className="mt-6 md:mt-0 md:self-end" />
          </div>
        </div>
      </footer>

      <WhatsappFab />
    </main>
  );
}

function AthleteShelf({
  title,
  description,
  athletes,
  pick,
  featureVideos,
}: {
  title: string;
  description: string;
  athletes: AthleteCard[];
  pick: (pt?: string | null, en?: string | null) => string | null;
  featureVideos: Record<string, string>;
}) {
  if (!athletes.length) return null;

  return (
    <section>
      <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-border/70 pb-3">
        <h2 className="truncate font-display text-xl font-semibold tracking-tight md:text-2xl">
          {title}
        </h2>
        <p className="shrink-0 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {athletes.map((athlete) => (
          <AthleteCardItem
            key={athlete.id}
            athlete={athlete}
            pick={pick}
            videoUrl={featureVideos[athlete.id]}
          />
        ))}
      </div>
    </section>
  );
}

function AthleteCardItem({
  athlete,
  pick,
  videoUrl,
}: {
  athlete: AthleteCard;
  pick: (pt?: string | null, en?: string | null) => string | null;
  videoUrl?: string | null;
}) {
  const heightImperial = formatHeightImperial(athlete.height_cm);
  const positionLabel = getAthletePositionEn(athlete);
  const countryFlag = athlete.country?.flag_emoji;
  const countryName = getAthleteCountryEn(athlete);
  const countryDisplay = [countryFlag, countryName].filter(Boolean).join(" ");

  const subline = [heightImperial, positionLabel, countryDisplay].filter(Boolean).join(" · ");

  const rawStatus = getAthleteStatus(athlete);
  const showFreshmanBadge = Boolean(rawStatus && rawStatus.trim().toLowerCase() !== "junior");

  return (
    <Link
      to="/athlete/$slug"
      params={{ slug: athlete.slug }}
      className="group relative overflow-hidden rounded-md border border-border/70 bg-card transition duration-300 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative">
        <AthleteVideoCardMedia
          photoUrl={getAthleteDisplayImage(athlete)}
          alt={athlete.full_name}
          videoUrl={videoUrl}
        />
        {showFreshmanBadge && (
          <div className="pointer-events-none absolute left-2.5 top-2.5 z-10">
            <span className="inline-flex items-center rounded-sm border border-emerald-500/35 bg-emerald-950/90 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300 uppercase shadow-xs backdrop-blur-xs">
              FRESHMAN
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate font-display text-base font-semibold tracking-tight text-card-foreground">
          {athlete.full_name}
        </h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {subline || "Athlete Profile"}
        </p>
      </div>
    </Link>
  );
}
