import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
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
  const [position, setPosition] = useState("");
  const [country, setCountry] = useState("");
  const [ageRange, setAgeRange] = useState("");

  const positions = Array.from(
    new Set(athletes.map((item) => item.position?.name_pt).filter(Boolean)),
  ) as string[];
  const countries = Array.from(
    new Set(athletes.map((item) => item.country?.name_pt).filter(Boolean)),
  ) as string[];

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return athletes.filter((athlete) => {
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
        athlete.country?.name_pt,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();

      return matchesPosition && matchesCountry && matchesAge && (!term || haystack.includes(term));
    });
  }, [ageRange, athletes, country, position, search]);

  if (!configured || !isSupabaseConfigured) return <ConfigurationNotice />;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-xl">
        <div className="container-edge flex h-16 items-center justify-between md:h-20">
          <Link to="/" className="font-display text-xl font-semibold">
            Go Team Go
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground md:block">Catálogo de vôlei</span>
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

      <section className="border-b bg-linear-to-br from-background via-card to-muted/40">
        <div className="container-edge grid gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-16">
          <div>
            <p className="eyebrow text-primary">{t("feed.recent")}</p>
            <h1 className="mt-4 max-w-2xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Talentos de vôlei prontos para o próximo nível
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Explore perfis completos, posições e contexto acadêmico em uma experiência visual inspirada em grandes plataformas de descoberta.
            </p>
          </div>
          <div className="rounded-3xl border bg-background/80 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary">Descubra atletas</p>
                <p className="mt-1 text-sm text-muted-foreground">Filtre por posição, país e idade para encontrar o perfil certo.</p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                Vôlei
              </span>
            </div>
            <div className="mt-6 space-y-3">
              <div className="rounded-2xl border bg-muted/40 p-4">
                <p className="text-sm font-medium">Pesquisa</p>
                <p className="mt-1 text-sm text-muted-foreground">Busque por nome, posição ou país.</p>
              </div>
              <div className="rounded-2xl border bg-muted/40 p-4">
                <p className="text-sm font-medium">Perfil completo</p>
                <p className="mt-1 text-sm text-muted-foreground">Acesse biografia, vídeo destaque e conquistas.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-edge py-12 md:py-16">
        <div className="flex flex-col gap-4 border-b pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow text-primary">Talentos para o próximo nível</p>
            <h2 className="mt-2 font-display text-3xl font-semibold">{t("feed.title")}</h2>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="flex h-11 min-w-70 items-center gap-2 rounded-full border bg-card px-3 shadow-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="Buscar atleta, posição ou país"
              />
            </label>
            <select
              className="h-11 rounded-full border bg-card px-3 text-sm shadow-sm"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            >
              <option value="">Posições</option>
              {positions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="h-11 rounded-full border bg-card px-3 text-sm shadow-sm"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="">Países</option>
              {countries.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="h-11 rounded-full border bg-card px-3 text-sm shadow-sm"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
            >
              <option value="">Idade</option>
              <option value="under18">Até 18</option>
              <option value="19-22">19–22</option>
              <option value="23plus">23+</option>
            </select>
          </div>
        </div>

        {filtered.length ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((athlete) => (
              <Link
                key={athlete.id}
                to="/athlete/$slug"
                params={{ slug: athlete.slug }}
                className="group overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <AthleteImage athlete={athlete} />
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold group-hover:text-primary">
                      {athlete.full_name}
                    </h3>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                      Vôlei
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {pick(athlete.position?.name_pt, athlete.position?.name_en) || "Posição"} ·{" "}
                    {pick(athlete.country?.name_pt, athlete.country?.name_en) || "País"}
                  </p>
                  <div className="mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                    Ver perfil
                  </div>
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

function AthleteImage({ athlete }: { athlete: AthleteCard }) {
  const imageSrc = athlete.photo_url ?? getMockAthleteImage(athlete.slug, athlete.full_name);

  return (
    <div className="relative aspect-4/5 overflow-hidden bg-linear-to-br from-stone-300 to-stone-600">
      <img
        src={imageSrc}
        alt={athlete.full_name}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
      />
    </div>
  );
}

function getMockAthleteImage(slug: string, fullName: string) {
  const images: Record<string, string> = {
    "marina-alves": "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=900&q=80",
    "gabriel-santos": "https://images.unsplash.com/photo-1521417531039-4f7d5f4d3f6b?auto=format&fit=crop&w=900&q=80",
  };

  return images[slug] ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0f172a&color=fff&size=640`;
}
