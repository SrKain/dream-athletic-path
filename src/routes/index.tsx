import { Link, createFileRoute } from "@tanstack/react-router";
import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { ConfigurationNotice } from "@/components/configuration-notice";
import { useI18n } from "@/i18n/i18n-provider";
import { listPublicAthletes } from "@/lib/athletes.functions";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { AthleteCard } from "@/types/db";

export const Route = createFileRoute("/")({
  loader: () => listPublicAthletes(),
  component: Catalog,
});

function Catalog() {
  const { athletes, configured } = Route.useLoaderData() as {
    athletes: AthleteCard[];
    configured: boolean;
  };
  const { locale, setLocale, t, pick } = useI18n();
  const [search, setSearch] = useState("");
  const [sport, setSport] = useState("");
  const [position, setPosition] = useState("");
  const [country, setCountry] = useState("");
  const [ageRange, setAgeRange] = useState("");

  const sports = Array.from(
    new Map(
      athletes.flatMap((item) => (item.sport ? [[item.sport.slug, item.sport]] : [])),
    ).values(),
  );
  const positions = Array.from(
    new Set(athletes.map((item) => item.position?.name_pt).filter(Boolean)),
  ) as string[];
  const countries = Array.from(
    new Set(athletes.map((item) => item.country?.name_pt).filter(Boolean)),
  ) as string[];
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return athletes.filter((athlete) => {
      const matchesSport = !sport || athlete.sport?.slug === sport;
      const matchesPosition = !position || athlete.position?.name_pt === position;
      const matchesCountry = !country || athlete.country?.name_pt === country;
      const age = athlete.birth_date
        ? Math.floor((Date.now() - new Date(athlete.birth_date).getTime()) / 31_557_600_000)
        : null;
      const matchesAge =
        !ageRange ||
        age === null ||
        (ageRange === "under18"
          ? age <= 18
          : ageRange === "19-22"
            ? age >= 19 && age <= 22
            : age >= 23);
      const haystack = [
        athlete.full_name,
        athlete.position?.name_pt,
        athlete.position?.name_en,
        athlete.sport?.name_pt,
        athlete.sport?.name_en,
        athlete.country?.name_pt,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return (
        matchesSport &&
        matchesPosition &&
        matchesCountry &&
        matchesAge &&
        (!term || haystack.includes(term))
      );
    });
  }, [ageRange, athletes, country, position, search, sport]);
  const featured = filtered.find((item) => item.is_featured) ?? filtered[0];

  if (!configured || !isSupabaseConfigured) return <ConfigurationNotice />;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="container-edge flex h-16 items-center justify-between md:h-20">
          <Link to="/" className="font-display text-xl font-semibold">
            Go Team Go
          </Link>
          <div className="flex items-center gap-4">
            <span className="eyebrow hidden text-muted-foreground md:block">Athlete catalog</span>
            <button
              className="rounded-full border px-3 py-1.5 text-xs font-semibold"
              onClick={() => setLocale(locale === "pt" ? "en" : "pt")}
            >
              {locale === "pt" ? "EN" : "PT"}
            </button>
            <Link
              to="/login"
              search={{ redirect: undefined }}
              className="inline-flex h-10 items-center rounded-md bg-foreground px-4 text-sm font-medium text-background"
            >
              Área restrita
            </Link>
          </div>
        </div>
      </header>

      {featured && (
        <section className="bg-surface text-surface-foreground">
          <div className="container-edge grid min-h-[32rem] items-end gap-10 py-14 lg:grid-cols-12">
            <div className="pb-4 lg:col-span-7">
              <p className="eyebrow text-gold">Atleta em destaque</p>
              <h1 className="mt-5 text-[clamp(3rem,7vw,6rem)] font-semibold leading-[0.94] tracking-[-0.045em]">
                {featured.full_name}
              </h1>
              <p className="mt-5 text-white/65">
                {pick(featured.sport?.name_pt, featured.sport?.name_en)} ·{" "}
                {pick(featured.position?.name_pt, featured.position?.name_en)} ·{" "}
                {pick(featured.country?.name_pt, featured.country?.name_en)}
              </p>
              <Link
                to="/athlete/$slug"
                params={{ slug: featured.slug }}
                className="mt-8 inline-flex h-12 items-center rounded-md bg-gold px-6 text-sm font-semibold text-gold-foreground"
              >
                Conhecer atleta
              </Link>
            </div>
            <AthleteImage athlete={featured} featured />
          </div>
        </section>
      )}

      <section className="container-edge py-16">
        <div className="flex flex-col gap-5 border-b pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow text-primary">{t("feed.recent")}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">{t("feed.title")}</h2>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row">
            <label className="flex h-11 min-w-72 items-center gap-2 rounded-md border bg-card px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Nome, esporte ou posição"
              />
            </label>
            <label className="flex h-11 items-center gap-2 rounded-md border bg-card px-3">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <select
                value={sport}
                onChange={(event) => setSport(event.target.value)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="">Todos os esportes</option>
                {sports.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name_pt}
                  </option>
                ))}
              </select>
            </label>
            <select
              className="h-11 rounded-md border bg-card px-3 text-sm"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            >
              <option value="">Posições</option>
              {positions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="h-11 rounded-md border bg-card px-3 text-sm"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="">Países</option>
              {countries.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="h-11 rounded-md border bg-card px-3 text-sm"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
            >
              <option value="">Idades</option>
              <option value="under18">Até 18</option>
              <option value="19-22">19–22</option>
              <option value="23plus">23+</option>
            </select>
          </div>
        </div>

        {filtered.length ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((athlete) => (
              <Link
                key={athlete.id}
                to="/athlete/$slug"
                params={{ slug: athlete.slug }}
                className="group"
              >
                <AthleteImage athlete={athlete} />
                <div className="pt-4">
                  <h3 className="font-display text-xl font-semibold group-hover:text-primary">
                    {athlete.full_name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pick(athlete.sport?.name_pt, athlete.sport?.name_en) || "Atleta"} ·{" "}
                    {athlete.position?.abbreviation ??
                      pick(athlete.position?.name_pt, athlete.position?.name_en)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center text-muted-foreground">Nenhum atleta encontrado.</div>
        )}
      </section>
    </main>
  );
}

function AthleteImage({ athlete, featured = false }: { athlete: AthleteCard; featured?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-gradient-to-br from-stone-300 to-stone-600 ${featured ? "aspect-[4/3] lg:col-span-5" : "aspect-[4/5]"}`}
    >
      {athlete.photo_url ? (
        <img
          src={athlete.photo_url}
          alt={athlete.full_name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full items-center justify-center font-display text-6xl font-semibold text-white/60">
          {athlete.full_name
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("")}
        </div>
      )}
    </div>
  );
}
