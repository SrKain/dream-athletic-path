import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ConfigurationNotice } from "@/components/configuration-notice";
import { useI18n } from "@/i18n/i18n-provider";
import { buildAthleteShelves, filterAthletes } from "@/lib/catalog";
import { listPublicAthletes, type PublicCatalogPayload } from "@/lib/athletes.functions";
import { catalogHeroImage, getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import { AthleteVideoCardMedia } from "@/components/athlete-video-card-media";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { formatHeightImperial } from "@/lib/units";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { AthleteCard } from "@/types/db";

export const Route = createFileRoute("/")({
  loader: () => listPublicAthletes(),
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
  const [position, setPosition] = useState("");
  const [country, setCountry] = useState("");
  const [ageRange, setAgeRange] = useState("");

  const catalogAthletes = athletes;

  const positions = useMemo(() => {
    const list = Array.from(
      new Set(
        catalogAthletes
          .map((item) => item.position?.name_en || item.position?.name_pt)
          .filter(Boolean),
      ),
    ) as string[];
    return list.sort();
  }, [catalogAthletes]);

  const countries = useMemo(() => {
    const list = Array.from(
      new Set(
        catalogAthletes
          .map((item) => item.country?.name_en || item.country?.name_pt)
          .filter(Boolean),
      ),
    ) as string[];
    return list.sort();
  }, [catalogAthletes]);

  const filtered = useMemo(
    () => filterAthletes(catalogAthletes, { ageRange, country, position, search }),
    [ageRange, catalogAthletes, country, position, search],
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
        {/* Header - Bloco 1.1 e 2.1 */}
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

        {/* Hero Section Redesenhado - Bloco 2.3 e 5.1 */}
        <section className="relative overflow-hidden border-b border-border/70 min-h-[380px] md:min-h-[460px] flex items-center">
          {/* Background image com overlay em gradiente */}
          <div className="absolute inset-0 z-0">
            <img
              src={heroImageSrc}
              alt=""
              className="h-full w-full object-cover object-center"
              aria-hidden="true"
            />
            {/* Gradiente escuro da esquerda para a direita para contraste impecável do texto */}
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

        {/* Catalog Section - Bloco 4, 5.1 e 5.2 */}
        <section id="catalog" className="container-edge py-10 md:py-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2 border-b border-border/70 pb-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
              {catalogHeading}
            </h2>
            <p className="text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "published athlete" : "published athletes"}
            </p>
          </div>

          {/* Filter Bar */}
          <div className="glass-panel grid gap-3 rounded-md p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
            <label className="flex h-11 min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background/60 px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search athlete, position, or country"
              />
            </label>
            <select
              aria-label="Filter by position"
              className="h-11 rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground outline-none"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            >
              <option value="">All Positions</option>
              {positions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by country"
              className="h-11 rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground outline-none"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="">All Countries</option>
              {countries.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by age"
              className="h-11 rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground outline-none"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
            >
              <option value="">All Ages</option>
              <option value="under18">Under 18</option>
              <option value="19-22">19-22</option>
              <option value="23plus">23+</option>
            </select>
          </div>

          {/* Athlete Shelves by Position (No separate duplicate featured shelf) */}
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
            <div className="py-24 text-center text-muted-foreground">
              No athletes found matching your search.
            </div>
          )}
        </section>
      </div>

      {/* Footer - Bloco 2.2 e 5.1 */}
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
          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Go Team Go Agency. All rights reserved.
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
  const positionLabel = pick(athlete.position?.name_en, athlete.position?.name_pt);
  const heightImperial = formatHeightImperial(athlete.height_cm);
  const countryFlag = athlete.country?.flag_emoji;
  const countryName =
    pick(athlete.country?.name_en, athlete.country?.name_pt) || athlete.nationality;
  const countryDisplay = [countryFlag, countryName].filter(Boolean).join(" ");

  const subline = [positionLabel, heightImperial, countryDisplay].filter(Boolean).join(" · ");

  return (
    <Link
      to="/athlete/$slug"
      params={{ slug: athlete.slug }}
      className="group overflow-hidden rounded-md border border-border/70 bg-card transition duration-300 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <AthleteVideoCardMedia
        photoUrl={getAthleteDisplayImage(athlete)}
        alt={athlete.full_name}
        videoUrl={videoUrl}
      />
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
