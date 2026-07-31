import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, Award, Calendar, GraduationCap, MapPin, Ruler, Weight } from "lucide-react";

import { getPublicAthlete, type PublicAthletePayload } from "@/lib/athletes.functions";
import { calculateAge } from "@/lib/catalog";
import { buildRecruitWhatsappUrl } from "@/lib/contact";
import { getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import { useI18n } from "@/i18n/i18n-provider";

export const Route = createFileRoute("/athlete/$slug")({
  loader: async ({ params }) => {
    const result = await getPublicAthlete({ data: { slug: params.slug } });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.athlete.full_name} — Go Team Go` },
          {
            name: "description",
            content: `${loaderData.athlete.full_name}, ${loaderData.athlete.sport?.name_pt ?? "atleta"} representado pela Go Team Go.`,
          },
          { property: "og:title", content: `${loaderData.athlete.full_name} — Go Team Go` },
          {
            property: "og:image",
            content: loaderData.athlete.photo_url ?? getAthleteDisplayImage(loaderData.athlete),
          },
        ]
      : [],
  }),
  component: PublicAthleteProfile,
});

function PublicAthleteProfile() {
  const { athlete, profile, media, achievements } = Route.useLoaderData() as PublicAthletePayload;
  const { locale, setLocale, pick } = useI18n();
  const stats =
    profile?.stats && typeof profile.stats === "object"
      ? Object.entries(profile.stats as Record<string, string | number>)
      : [];
  const age = calculateAge(athlete.birth_date);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="container-edge flex h-16 items-center justify-between md:h-20">
          <Link to="/" className="font-display text-xl font-semibold tracking-tight">
            Go Team Go
          </Link>
          <div className="flex items-center gap-3">
            <button
              className="glass-panel rounded-full px-3 py-1.5 text-xs font-semibold"
              onClick={() => setLocale(locale === "pt" ? "en" : "pt")}
            >
              {locale === "pt" ? "EN" : "PT"}
            </button>
            <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowLeft className="h-4 w-4" /> Catálogo
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-surface text-surface-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,oklch(0.66_0.13_146_/_0.28),transparent_35%),linear-gradient(135deg,oklch(0.19_0.05_162),oklch(0.11_0.025_162))]" />
        <div className="container-edge relative grid gap-10 py-12 lg:grid-cols-12 lg:py-20">
          <div className="lg:col-span-7 lg:self-end">
            <p className="eyebrow text-primary-foreground/70">
              {athlete.sport?.name_pt ?? "Atleta"} · Go Team Go
            </p>
            <h1 className="mt-5 font-display text-[clamp(3rem,7vw,6rem)] font-semibold leading-[0.94] tracking-tight">
              {athlete.full_name}
            </h1>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-surface-foreground/70">
              {athlete.position && (
                <span>{pick(athlete.position.name_pt, athlete.position.name_en)}</span>
              )}
              {athlete.country?.name_pt && (
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> {athlete.country.flag_emoji}{" "}
                  {pick(athlete.country.name_pt, athlete.country.name_en)}
                </span>
              )}
            </div>
            <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-md border border-white/15 bg-white/10 md:grid-cols-4">
              <HeroStat
                label="Altura"
                value={athlete.height_cm ? `${athlete.height_cm} cm` : "—"}
              />
              <HeroStat label="Peso" value={athlete.weight_kg ? `${athlete.weight_kg} kg` : "—"} />
              <HeroStat label="Idade" value={age !== null ? `${age} anos` : "—"} />
              <HeroStat
                label="Posição"
                value={pick(athlete.position?.name_pt, athlete.position?.name_en) ?? "—"}
              />
            </dl>
            <a
              href={buildRecruitWhatsappUrl(athlete.full_name)}
              target="_blank"
              rel="noopener noreferrer"
              className="liquid-button mt-8 inline-flex h-12 items-center rounded-md px-7 text-sm font-semibold uppercase tracking-[0.16em]"
            >
              Recrutar
            </a>
          </div>
          <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-white/10 shadow-2xl lg:col-span-5">
            <img
              src={getAthleteDisplayImage(athlete)}
              alt={athlete.full_name}
              className="h-full w-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-linear-to-tr from-primary/35 via-transparent to-transparent" />
          </div>
        </div>
      </section>

      <section className="container-edge grid gap-10 py-14 lg:grid-cols-12 lg:py-18">
        <div className="lg:col-span-7">
          <p className="eyebrow text-primary">Sobre</p>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            {pick(profile?.bio_pt, profile?.bio_en) || "Perfil esportivo em preparação."}
          </p>
          {profile?.highlight_video_url && (
            <video
              src={profile.highlight_video_url}
              controls
              className="mt-8 aspect-video w-full rounded-md bg-surface"
            />
          )}
          {achievements.length > 0 && (
            <div className="mt-12">
              <h2 className="font-display text-2xl font-semibold">Conquistas</h2>
              <div className="mt-5 space-y-4">
                {achievements.map((item) => (
                  <article key={item.id} className="flex gap-4 border-t border-border pt-4">
                    <Award className="h-5 w-5 text-primary" />
                    <div>
                      <h3 className="font-semibold">{pick(item.title_pt, item.title_en)}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {pick(item.description_pt, item.description_en)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
        <aside className="lg:col-span-5">
          <div className="glass-panel rounded-md p-6">
            <p className="eyebrow text-primary">Perfil acadêmico</p>
            <dl className="mt-5 grid grid-cols-2 gap-5">
              <Stat
                icon={GraduationCap}
                label="Conclusão"
                value={profile?.graduation_year ?? "—"}
              />
              <Stat icon={GraduationCap} label="GPA" value={profile?.gpa ?? "—"} />
              <Stat icon={Calendar} label="Inglês" value={profile?.english_level ?? "—"} />
              <Stat
                icon={MapPin}
                label="Nacionalidade"
                value={pick(athlete.country?.name_pt, athlete.country?.name_en) ?? "—"}
              />
              {stats.map(([label, value]) => (
                <Stat key={label} icon={Award} label={label} value={value} />
              ))}
            </dl>
          </div>
        </aside>
      </section>

      {media.length > 0 && (
        <section className="border-t border-border bg-muted/40 py-16">
          <div className="container-edge">
            <h2 className="font-display text-3xl font-semibold">Galeria</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {media.map((item) =>
                item.kind === "video" ? (
                  <video
                    key={item.id}
                    controls
                    poster={item.thumbnail_url ?? undefined}
                    className="aspect-video w-full rounded-md bg-black"
                  >
                    <source src={item.url} />
                  </video>
                ) : (
                  <img
                    key={item.id}
                    src={item.url}
                    alt={item.caption_pt ?? athlete.full_name}
                    className="aspect-[4/3] w-full rounded-md object-cover"
                  />
                ),
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-foreground/50">
        {label}
      </dt>
      <dd className="mt-2 font-display text-xl font-semibold">{value}</dd>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Award;
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </dt>
      <dd className="mt-1 font-display text-xl font-semibold">{value}</dd>
    </div>
  );
}
