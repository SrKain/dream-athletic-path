import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft, Award, Calendar, GraduationCap, MapPin, Play } from "lucide-react";

import { ReelsRow } from "@/components/reels-viewer";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { getPublicAthlete, type PublicAthletePayload } from "@/lib/athletes.functions";
import { calculateAge } from "@/lib/catalog";
import { buildRecruitWhatsappUrl } from "@/lib/contact";
import { getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import { youtubeEmbedUrl } from "@/lib/youtube";
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
            content: `${loaderData.athlete.full_name} — perfil esportivo e acadêmico do atleta representado pela Go Team Go.`,
          },
          { property: "og:title", content: `${loaderData.athlete.full_name} — Go Team Go` },
          {
            property: "og:description",
            content: `Vídeos, conquistas e dados do atleta ${loaderData.athlete.full_name}.`,
          },
          { property: "og:type", content: "profile" },
          { name: "twitter:card", content: "summary_large_image" },
          {
            property: "og:image",
            content: loaderData.athlete.photo_url ?? getAthleteDisplayImage(loaderData.athlete),
          },
        ]
      : [{ title: "Atleta não encontrado — Go Team Go" }, { name: "robots", content: "noindex" }],
  }),
  component: PublicAthleteProfile,
});

function PublicAthleteProfile() {
  const { athlete, profile, media, achievements, videos } =
    Route.useLoaderData() as PublicAthletePayload;
  const { locale, setLocale, pick } = useI18n();
  const stats =
    profile?.stats && typeof profile.stats === "object"
      ? Object.entries(profile.stats as Record<string, string | number>)
      : [];
  const age = calculateAge(athlete.birth_date);

  const highlights = videos.filter((item) => item.kind === "highlight");
  const featureVideo = videos.find((item) => item.kind === "feature");
  const presentationVideo = videos.find((item) => item.kind === "presentation");
  const heroBackground = youtubeEmbedUrl(featureVideo?.youtube_url, {
    autoplay: true,
    controls: false,
    loop: true,
    muted: true,
  });

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

      {/* HERO — vídeo destaque ao fundo sob máscara, foto do atleta em primeiro plano */}
      <section className="relative overflow-hidden bg-surface text-surface-foreground">
        {heroBackground && (
          <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
            <iframe
              src={heroBackground}
              title=""
              tabIndex={-1}
              allow="autoplay; encrypted-media"
              className="absolute left-1/2 top-1/2 h-[180%] w-[180%] -translate-x-1/2 -translate-y-1/2 border-0"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,oklch(0.66_0.13_146_/_0.28),transparent_35%),linear-gradient(135deg,oklch(0.19_0.05_162_/_0.92),oklch(0.11_0.025_162_/_0.96))]" />
        <div className="container-edge relative grid gap-8 py-10 sm:py-14 lg:grid-cols-12 lg:gap-12 lg:py-20">
          <div className="order-2 lg:order-1 lg:col-span-7 lg:self-end">
            <p className="eyebrow text-primary-foreground/70">Perfil de recrutamento</p>
            <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.6rem,6vw,5.2rem)] font-semibold leading-[0.94] tracking-tight">
              {athlete.full_name}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-surface-foreground/70 sm:text-lg">
              Performance, personalidade e potencial acadêmico em uma só visão.
            </p>
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
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
              href={buildRecruitWhatsappUrl(athlete.full_name)}
              target="_blank"
              rel="noopener noreferrer"
                className="liquid-button inline-flex h-12 items-center rounded-md px-7 text-sm font-semibold uppercase tracking-[0.16em]"
              >
                Recrutar atleta
              </a>
              {featureVideo && (
                <a
                  href="#video-destaque"
                  className="inline-flex h-12 items-center gap-2 rounded-md border border-white/20 px-5 text-sm font-semibold text-surface-foreground transition hover:border-white/40 hover:bg-white/10"
                >
                  <Play className="h-4 w-4 fill-current" /> Ver destaque
                </a>
              )}
            </div>
          </div>
          <div className="order-1 relative aspect-[4/5] overflow-hidden rounded-md bg-white/10 shadow-2xl sm:aspect-[3/4] lg:order-2 lg:col-span-5">
            <img
              src={getAthleteDisplayImage(athlete)}
              alt={athlete.full_name}
              className="h-full w-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-linear-to-tr from-primary/35 via-transparent to-transparent" />
          </div>
        </div>
      </section>

      {/* REELS — antes do "Sobre" */}
      <ReelsRow videos={highlights} athleteName={athlete.full_name} />

      <section className="container-edge grid gap-10 py-14 lg:grid-cols-12 lg:py-20">
        <div className="lg:col-span-7">
          <p className="eyebrow text-primary">A história por trás da performance</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Um atleta pronto para o próximo nível.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {pick(profile?.bio_pt, profile?.bio_en) || "Perfil esportivo em preparação."}
          </p>
          {presentationVideo && (
            <div className="mt-10">
              <VideoSectionHeading
                eyebrow="Apresentação"
                title={presentationVideo.title || `Conheça ${athlete.full_name}`}
              />
              <YoutubeFrame
                url={presentationVideo.youtube_url}
                title={`Apresentação de ${athlete.full_name}`}
              />
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

      {/* DESTAQUE — reaparece em bloco cheio no meio da apresentação */}
      {featureVideo && (
        <section
          id="video-destaque"
          className="border-y border-border bg-surface py-16 text-surface-foreground lg:py-24"
        >
          <div className="container-edge">
            <VideoSectionHeading
              eyebrow="Destaque principal"
              title={featureVideo.title || `${athlete.full_name} em quadra`}
              dark
            />
            <YoutubeFrame
              url={featureVideo.youtube_url}
              title={`Vídeo destaque de ${athlete.full_name}`}
            />
          </div>
        </section>
      )}

      {achievements.length > 0 && (
        <section className="container-edge py-16">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Conquistas</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {achievements.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-md border border-border/70 bg-card"
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={pick(item.title_pt, item.title_en) ?? ""}
                    loading="lazy"
                    className="aspect-[16/9] w-full object-cover"
                  />
                )}
                <div className="flex gap-3 p-5">
                  <Award className="h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      {pick(item.title_pt, item.title_en)}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {pick(item.description_pt, item.description_en)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

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
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-md object-cover"
                  />
                ),
              )}
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-border py-16">
        <div className="container-edge grid gap-6 text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            Interessado em {athlete.full_name}?
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Fale diretamente com a equipe da Go Team Go pelo WhatsApp e receba o dossiê completo do
            atleta.
          </p>
          <div>
            <a
              href={buildRecruitWhatsappUrl(athlete.full_name)}
              target="_blank"
              rel="noopener noreferrer"
              className="liquid-button inline-flex h-12 items-center rounded-md px-7 text-sm font-semibold uppercase tracking-[0.16em]"
            >
              Recrutar
            </a>
          </div>
        </div>
      </section>
      <WhatsappFab athleteName={athlete.full_name} />
    </main>
  );
}

function YoutubeFrame({ url, title }: { url: string; title: string }) {
  const embed = youtubeEmbedUrl(url);
  if (!embed) return null;
  return (
    <div className="mt-5 aspect-video w-full overflow-hidden rounded-md bg-black shadow-xl">
      <iframe
        src={embed}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
        className="h-full w-full border-0"
      />
    </div>
  );
}

function VideoSectionHeading({
  eyebrow,
  title,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  dark?: boolean;
}) {
  return (
    <div>
      <p className={`eyebrow ${dark ? "text-primary" : "text-primary"}`}>{eyebrow}</p>
      <h2 className="mt-3 max-w-3xl font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface/80 p-4">
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
