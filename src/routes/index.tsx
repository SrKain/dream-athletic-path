import { Link, createFileRoute } from "@tanstack/react-router";
import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { ConfigurationNotice } from "@/components/configuration-notice";
import { listPublicAthletes } from "@/lib/athletes.functions";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { AthleteCard } from "@/types/db";

export const Route = createFileRoute("/")({
  loader: () => listPublicAthletes(),
  component: Catalog,
});

function Catalog() {
  const { athletes, configured } = Route.useLoaderData();
  const [search, setSearch] = useState("");
  const [sport, setSport] = useState("");

  if (!configured || !isSupabaseConfigured) return <ConfigurationNotice />;

  const sports = Array.from(
    new Map(athletes.flatMap((item) => (item.sport ? [[item.sport.slug, item.sport]] : []))).values(),
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return athletes.filter((athlete) => {
      const matchesSport = !sport || athlete.sport?.slug === sport;
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
      return matchesSport && (!term || haystack.includes(term));
    });
  }, [athletes, search, sport]);
  const featured = filtered.find((item) => item.is_featured) ?? filtered[0];

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="container-edge flex h-16 items-center justify-between md:h-20">
          <Link to="/" className="font-display text-xl font-semibold">
            Go Team Go
          </Link>
          <div className="flex items-center gap-4">
            <span className="eyebrow hidden text-muted-foreground md:block">Athlete catalog</span>
            <Link
              to="/login"
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
                {featured.sport?.name_pt} · {featured.position?.name_pt} ·{" "}
                {featured.country?.name_pt}
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
            <p className="eyebrow text-primary">Talentos Go Team Go</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">Encontre seu próximo atleta</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
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
                    {athlete.sport?.name_pt ?? "Atleta"} ·{" "}
                    {athlete.position?.abbreviation ?? athlete.position?.name_pt}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center text-muted-foreground">
            Nenhum atleta encontrado.
          </div>
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
