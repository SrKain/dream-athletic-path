import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ConfigurationNotice } from "@/components/configuration-notice";
import { useI18n } from "@/i18n/i18n-provider";
import { buildAthleteShelves, filterAthletes, pickAceAthletes } from "@/lib/catalog";
import { listPublicAthletes, type PublicCatalogPayload } from "@/lib/athletes.functions";
import { catalogHeroImage, getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import { AthleteVideoCardMedia } from "@/components/athlete-video-card-media";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { AthleteCard } from "@/types/db";

export const Route = createFileRoute("/")({
  loader: () => listPublicAthletes(),
  head: () => ({
    meta: [
      { title: "Catálogo de atletas — Go Team Go" },
      {
        name: "description",
        content:
          "Catálogo de atletas brasileiros prontos para estudar e competir nos Estados Unidos. Perfis por esporte, posição e faixa etária.",
      },
      { property: "og:title", content: "Catálogo de atletas — Go Team Go" },
      {
        property: "og:description",
        content: "Perfis esportivos e acadêmicos de atletas brasileiros para programas nos EUA.",
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

  const positions = Array.from(
    new Set(catalogAthletes.map((item) => item.position?.name_pt).filter(Boolean)),
  ) as string[];
  const countries = Array.from(
    new Set(catalogAthletes.map((item) => item.country?.name_pt).filter(Boolean)),
  ) as string[];

  const filtered = useMemo(
    () => filterAthletes(catalogAthletes, { ageRange, country, position, search }),
    [ageRange, catalogAthletes, country, position, search],
  );
  const shelves = useMemo(
    () => buildAthleteShelves(filtered, positionOrder),
    [filtered, positionOrder],
  );
  const aces = useMemo(() => pickAceAthletes(filtered), [filtered]);

  const heroTitle =
    pick(visual?.hero_title_pt, visual?.hero_title_en) ||
    "Atletas prontos para jogar, estudar e competir nos EUA.";
  const heroSubtitle =
    pick(visual?.hero_subtitle_pt, visual?.hero_subtitle_en) ||
    "Explore perfis por posição, descubra destaques e encontre talentos brasileiros com contexto esportivo, acadêmico e visual de alto nível.";
  const catalogHeading =
    pick(visual?.catalog_heading_pt, visual?.catalog_heading_en) || "Nossos Atletas";

  if (!configured || !isSupabaseConfigured) return <ConfigurationNotice />;

  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="container-edge flex h-16 items-center justify-between md:h-20">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display text-xl font-semibold tracking-tight">Go Team Go</span>
            <span className="hidden h-1.5 w-1.5 rounded-full bg-primary md:block" />
            <span className="eyebrow hidden text-muted-foreground md:block">NCAA</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              search={{ redirect: undefined }}
              className="liquid-button inline-flex h-10 items-center rounded-md px-4 text-sm font-medium"
            >
              Área restrita
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border/70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(0.72_0.13_146_/_0.2),transparent_30%),linear-gradient(135deg,oklch(0.968_0.018_102),oklch(0.9_0.035_148))]" />
        <div className="absolute inset-y-0 right-0 w-2/3 opacity-20 [background:repeating-linear-gradient(90deg,transparent_0_22px,oklch(0.46_0.11_162_/_0.35)_22px_24px),linear-gradient(180deg,oklch(0.55_0.12_250_/_0.35),oklch(0.62_0.18_25_/_0.28))]" />
        <div className="container-edge relative grid gap-8 py-8 md:py-10 lg:grid-cols-12 lg:items-center lg:py-12">
          <div className="lg:col-span-7">
            <p className="eyebrow text-primary">Catálogo premium de vôlei · USA pathway</p>
            <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.1rem,4.4vw,3.6rem)] font-semibold leading-[1] tracking-tight">
              {heroTitle}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {heroSubtitle}
            </p>
          </div>
          <div className="relative lg:col-span-5">
            <div className="relative aspect-[16/9] overflow-hidden rounded-md bg-surface shadow-xl lg:aspect-[16/10]">
              <img
                src={catalogHeroImage}
                alt=""
                className="h-full w-full object-cover object-top"
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-linear-to-tr from-primary/55 via-primary/10 to-transparent" />
              <div className="glass-dark absolute bottom-4 left-4 right-4 rounded-md px-4 py-3 text-surface-foreground">
                <p className="text-xs font-semibold tracking-wide">
                  NCAA · D1 · D2 · D3 · NAIA · JUCO
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="catalog" className="container-edge py-10 md:py-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2 border-b border-border/70 pb-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {catalogHeading}
          </h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "atleta publicado" : "atletas publicados"}
        </p>
        <div className="glass-panel grid gap-3 rounded-md p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-md border border-white/50 bg-background/50 px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Buscar atleta, posição ou país"
            />
          </label>
          <select
            className="h-11 rounded-md border border-white/50 bg-background/50 px-3 text-sm"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="">Posições</option>
            {positions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="h-11 rounded-md border border-white/50 bg-background/50 px-3 text-sm"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Países</option>
            {countries.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="h-11 rounded-md border border-white/50 bg-background/50 px-3 text-sm"
            value={ageRange}
            onChange={(e) => setAgeRange(e.target.value)}
          >
            <option value="">Idade</option>
            <option value="under18">Até 18</option>
            <option value="19-22">19-22</option>
            <option value="23plus">23+</option>
          </select>
        </div>

        {filtered.length ? (
          <div className="mt-10 space-y-12">
            {aces.length > 0 && (
              <AthleteShelf
                title="Destaques"
                description="Perfis selecionados pela agência."
                athletes={aces}
                pick={pick}
                featureVideos={featureVideos}
              />
            )}
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
          <div className="py-24 text-center text-muted-foreground">Nenhum atleta encontrado.</div>
        )}
      </section>
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
      >
        {athlete.is_featured && (
          <span className="absolute left-2 top-2 rounded-md bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-foreground shadow-md">
            Destaque
          </span>
        )}
      </AthleteVideoCardMedia>
      <div className="p-3">
        <h3 className="truncate font-display text-base font-semibold tracking-tight">
          {athlete.full_name}
        </h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {pick(athlete.position?.name_pt, athlete.position?.name_en) || "Posição"} ·{" "}
          {pick(athlete.country?.name_pt, athlete.country?.name_en) || "País"}
        </p>
      </div>
    </Link>
  );
}
