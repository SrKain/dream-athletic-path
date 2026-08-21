import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  Award,
  Calendar,
  DollarSign,
  FileText,
  GraduationCap,
  Languages,
  MapPin,
  MessageCircle,
  Play,
  Ruler,
  School,
  Sparkles,
  Trophy,
  Video,
  Weight,
} from "lucide-react";

import { ReelsRow } from "@/components/reels-viewer";
import { PublicYoutubePlayer } from "@/components/public-youtube-player";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { getPublicAthlete, type PublicAthletePayload } from "@/lib/athletes.functions";
import { calculateAge } from "@/lib/catalog";
import { buildRecruitWhatsappUrl } from "@/lib/contact";
import { getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import { groupPublicVideos } from "@/lib/public-videos";
import { formatHeightImperial, formatWeightImperial } from "@/lib/units";
import { youtubeEmbedUrl } from "@/lib/youtube";

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
            content: `${loaderData.athlete.full_name} — athletic and academic profile represented by Go Team Go.`,
          },
          { property: "og:title", content: `${loaderData.athlete.full_name} — Go Team Go` },
          {
            property: "og:description",
            content: `Videos, achievements and scouting stats for ${loaderData.athlete.full_name}.`,
          },
          { property: "og:type", content: "profile" },
          { name: "twitter:card", content: "summary_large_image" },
          {
            property: "og:image",
            content: loaderData.athlete.photo_url ?? getAthleteDisplayImage(loaderData.athlete),
          },
        ]
      : [{ title: "Athlete Not Found — Go Team Go" }, { name: "robots", content: "noindex" }],
  }),
  component: PublicAthleteProfile,
});

function PublicAthleteProfile() {
  const { athlete, profile, media, achievements, videos, videosAvailable } =
    Route.useLoaderData() as PublicAthletePayload;

  const age = calculateAge(athlete.birth_date);
  const firstName = athlete.full_name.split(" ")[0];

  const { feature, presentations, highlights, inCourt, heroUrl } = groupPublicVideos(
    videos,
    profile?.highlight_video_url,
  );

  const photoUrl = loaderPhotoOrFallback(athlete);
  const subtitle = profile?.subtitle || "Performance · Personality · Potential";
  const positionLabel = athlete.position?.name_en || athlete.position?.name_pt;
  const countryLabel = athlete.country?.name_en || athlete.country?.name_pt;

  const birthDateFormatted = athlete.birth_date
    ? new Date(athlete.birth_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main className="min-h-screen bg-background text-foreground scroll-smooth">
      {/* ── STICKY MAIN HEADER ── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="container-edge flex h-16 items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold tracking-tight text-foreground">
            Go Team Go
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-card/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Catalog
          </Link>
        </div>
      </header>

      {/* ── HERO SECTION COM LUXO MINIMALISTA (QUIET LUXURY) ── */}
      <section className="relative overflow-hidden bg-[#061b13] text-[#f4f7e9] min-h-[500px] sm:min-h-[540px] flex items-center">
        {/* Background YouTube Video com Overlay cinematográfico */}
        {heroUrl && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <iframe
              src={
                youtubeEmbedUrl(heroUrl, {
                  autoplay: true,
                  muted: true,
                  loop: true,
                  controls: false,
                }) ?? ""
              }
              title={`Hero Background Video — ${athlete.full_name}`}
              className="absolute top-1/2 left-1/2 w-[160vw] h-[160vh] min-w-[100%] min-h-[100%] -translate-x-1/2 -translate-y-1/2 object-cover opacity-25 pointer-events-none scale-125"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        )}

        {/* Máscara Verde Esmeralda Profunda e Textura Sutil */}
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#061b13]/98 via-[#04160f]/94 to-[#020b07]/98 backdrop-blur-[2px]" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_25%,rgba(48,184,132,0.18),transparent_55%)]" />

        <div className="container-edge relative z-10 px-6 sm:px-10 md:px-12 lg:px-16 xl:px-20 py-16 sm:py-20 lg:py-24 w-full">
          <div className="grid gap-10 lg:grid-cols-[auto_1fr] lg:gap-16 xl:gap-20 lg:items-center">
            {/* Retrato do Atleta em Proporção Editorial 4:5 */}
            <div className="flex justify-center sm:justify-start">
              <div className="relative aspect-[4/5] w-52 sm:w-60 md:w-72 shrink-0 overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/15">
                <img
                  src={photoUrl}
                  alt={athlete.full_name}
                  className="h-full w-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

                {/* Badge de Posição Discreto sobre a Foto */}
                {positionLabel && (
                  <span className="absolute bottom-3.5 left-3.5 right-3.5 text-center rounded-lg border border-white/20 bg-black/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#dfff1f] backdrop-blur-md">
                    {positionLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Informações Editoriais e Métricas Fluídas (Sem Caixas Clausuladas) */}
            <div className="flex flex-col justify-center space-y-7 md:space-y-8">
              <div className="space-y-3">
                <h1 className="font-display text-3xl font-bold tracking-tight text-[#f4f7e9] sm:text-4xl md:text-5xl lg:text-6xl">
                  {athlete.full_name}
                </h1>
                <p className="text-base sm:text-lg md:text-xl font-normal text-[#b9c4bc] leading-relaxed max-w-2xl">
                  {subtitle}
                </p>
              </div>

              {/* Linha Editorial de Métricas Essenciais (Quiet Luxury) */}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3.5 text-sm text-[#f4f7e9]/90 border-y border-white/10 py-4 md:py-5">
                {countryLabel && (
                  <div className="flex items-center gap-2 font-medium">
                    {athlete.country?.flag_emoji && <span>{athlete.country.flag_emoji}</span>}
                    <span>{countryLabel}</span>
                  </div>
                )}
                {athlete.height_cm && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#b9c4bc] text-xs uppercase tracking-wider">Height:</span>
                    <span className="font-semibold">{formatHeightImperial(athlete.height_cm)}</span>
                  </div>
                )}
                {athlete.weight_kg && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#b9c4bc] text-xs uppercase tracking-wider">Weight:</span>
                    <span className="font-semibold">{formatWeightImperial(athlete.weight_kg)}</span>
                  </div>
                )}
                {(profile?.high_school_graduation || profile?.graduation_year) && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#b9c4bc] text-xs uppercase tracking-wider">Class:</span>
                    <span className="font-semibold">
                      {profile.high_school_graduation || profile.graduation_year}
                    </span>
                  </div>
                )}
                {profile?.gpa && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#b9c4bc] text-xs uppercase tracking-wider">GPA:</span>
                    <span className="font-semibold text-[#dfff1f]">{profile.gpa}</span>
                  </div>
                )}
                {profile?.seasons_eligibility && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#b9c4bc] text-xs uppercase tracking-wider">
                      Eligibility:
                    </span>
                    <span className="font-semibold">{profile.seasons_eligibility}</span>
                  </div>
                )}
                {birthDateFormatted && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#b9c4bc] text-xs uppercase tracking-wider">Born:</span>
                    <span className="font-semibold">
                      {birthDateFormatted} {age !== null ? `(${age}y)` : ""}
                    </span>
                  </div>
                )}
              </div>

              {/* Botões de Ação de Alto Padrão */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <a
                  href={buildRecruitWhatsappUrl(athlete.full_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="liquid-button inline-flex h-12 items-center gap-2.5 rounded-xl px-8 text-xs font-bold uppercase tracking-[0.16em] shadow-xl shadow-emerald-950/40"
                >
                  <MessageCircle className="h-4 w-4 fill-current" />
                  Recruit Athlete
                </a>

                {(heroUrl || presentations.length > 0 || inCourt.length > 0) && (
                  <a
                    href="#athlete-film"
                    className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-white/20 bg-white/5 px-6 text-xs font-semibold uppercase tracking-wider text-[#f4f7e9] backdrop-blur-md transition hover:border-white/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Play className="h-3.5 w-3.5 fill-current text-[#dfff1f]" /> Watch Film
                  </a>
                )}

                <a
                  href="#fact-sheet"
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-6 text-xs font-semibold uppercase tracking-wider text-[#b9c4bc] transition hover:text-[#f4f7e9] hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <FileText className="h-3.5 w-3.5 text-[#dfff1f]" /> Fact Sheet
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STICKY SUB-NAVIGATION BAR PARA NAVEGAÇÃO RÁPIDA ── */}
      <nav
        aria-label="Section shortcuts"
        className="sticky top-16 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md"
      >
        <div className="container-edge flex items-center gap-2 overflow-x-auto py-2.5 scrollbar-none text-xs font-semibold">
          {(inCourt.length > 0 || presentations.length > 0 || feature) && (
            <a
              href="#athlete-film"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition whitespace-nowrap"
            >
              <Video className="h-3.5 w-3.5 text-primary" /> Film & Footage
            </a>
          )}
          {highlights.length > 0 && (
            <a
              href="#highlights"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Highlights
            </a>
          )}
          <a
            href="#fact-sheet"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition whitespace-nowrap"
          >
            <FileText className="h-3.5 w-3.5 text-primary" /> Recruiting Stats
          </a>
          <a
            href="#about-athlete"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition whitespace-nowrap"
          >
            <Award className="h-3.5 w-3.5 text-primary" /> About & Strengths
          </a>
          {achievements.length > 0 && (
            <a
              href="#achievements"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition whitespace-nowrap"
            >
              <Trophy className="h-3.5 w-3.5 text-amber-500" /> Achievements
            </a>
          )}
          {media.length > 0 && (
            <a
              href="#gallery"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Gallery
            </a>
          )}
          <a
            href="#recruit-cta"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-primary font-bold hover:bg-primary/10 transition whitespace-nowrap ml-auto"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Recruit
          </a>
        </div>
      </nav>

      {!videosAvailable && (
        <section className="container-edge py-6">
          <p
            role="status"
            className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          >
            Videos are temporarily unavailable. Please try again shortly.
          </p>
        </section>
      )}

      {/* ── HIGHLIGHTS (STORIES / REELS EM FORMATO CIRCULAR) ── */}
      {highlights.length > 0 && <ReelsRow videos={highlights} athleteName={athlete.full_name} />}

      {/* ── SEÇÃO DE VÍDEOS IN COURT & APRESENTAÇÃO ── */}
      {(inCourt.length > 0 || presentations.length > 0 || feature) && (
        <section id="athlete-film" className="container-edge py-10 lg:py-14">
          <div className="flex flex-col gap-1 mb-6">
            <p className="eyebrow text-primary">Scouting Film</p>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
              In Court & Presentation Film
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Full match footage, technical actions, and personal introduction for college coaches.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {presentations.map((video, idx) => (
              <article
                key={video.id}
                className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-3.5 flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold truncate text-foreground">
                    {video.title || `Presentation Film ${idx + 1}`}
                  </h3>
                  <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Introduction
                  </span>
                </div>
                <PublicYoutubePlayer
                  url={video.youtube_url}
                  title={video.title || `Presentation ${idx + 1} — ${athlete.full_name}`}
                  autoPlay={false}
                />
              </article>
            ))}

            {inCourt.map((video, idx) => (
              <article
                key={video.id}
                className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-3.5 flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold truncate text-foreground">
                    {video.title || `In Court Footage ${idx + 1}`}
                  </h3>
                  <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Match Play
                  </span>
                </div>
                <PublicYoutubePlayer
                  url={video.youtube_url}
                  title={video.title || `In Court ${idx + 1}`}
                  autoPlay={false}
                />
              </article>
            ))}

            {feature &&
              !presentations.some((p) => p.youtube_url === feature.youtube_url) &&
              !inCourt.some((c) => c.youtube_url === feature.youtube_url) && (
                <article
                  key={feature.id}
                  className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="mb-3.5 flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold truncate text-foreground">
                      {feature.title || `Featured Scouting Film`}
                    </h3>
                    <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      Featured
                    </span>
                  </div>
                  <PublicYoutubePlayer
                    url={feature.youtube_url}
                    title={feature.title || `Featured Film — ${athlete.full_name}`}
                    autoPlay={false}
                  />
                </article>
              )}
          </div>
        </section>
      )}

      {/* ── KEY RECRUITING DETAILS (FACT SHEET ESTRUTURADA) ── */}
      <section id="fact-sheet" className="container-edge py-10 lg:py-14">
        <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-8 lg:p-10 shadow-sm space-y-8">
          <div className="flex flex-col gap-1 border-b border-border/70 pb-6">
            <p className="eyebrow text-primary">Recruiting Dossier</p>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl text-foreground flex items-center gap-2.5">
              <Sparkles className="h-6 w-6 text-primary" /> Key Recruiting Details
            </h2>
            <p className="text-sm text-muted-foreground">
              Official athletic biometrics, verified academic records, and eligibility breakdown.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Bloco 1: Athletic Measurements */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                <Ruler className="h-4 w-4" /> Athletic Measurements
              </h3>
              <div className="space-y-3">
                <FactCard
                  label="Position"
                  value={positionLabel ?? "—"}
                  icon={<Award className="h-4 w-4" />}
                />
                <FactCard
                  label="Height"
                  value={formatHeightImperial(athlete.height_cm) ?? "—"}
                  icon={<Ruler className="h-4 w-4" />}
                />
                <FactCard
                  label="Weight"
                  value={formatWeightImperial(athlete.weight_kg) ?? "—"}
                  icon={<Weight className="h-4 w-4" />}
                />
                <FactCard
                  label="Date of Birth"
                  value={
                    birthDateFormatted
                      ? `${birthDateFormatted}${age !== null ? ` (${age} yrs)` : ""}`
                      : "—"
                  }
                  icon={<Calendar className="h-4 w-4" />}
                />
              </div>
            </div>

            {/* Bloco 2: Academic & Eligibility */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                <GraduationCap className="h-4 w-4" /> Academic & Eligibility
              </h3>
              <div className="space-y-3">
                <FactCard
                  label="Current School"
                  value={profile?.current_school ?? "—"}
                  icon={<School className="h-4 w-4" />}
                />
                <FactCard
                  label="High School Class"
                  value={
                    profile?.high_school_graduation ||
                    (profile?.graduation_year ? String(profile.graduation_year) : "—")
                  }
                  icon={<GraduationCap className="h-4 w-4" />}
                />
                <FactCard
                  label="Current GPA"
                  value={profile?.gpa ? String(profile.gpa) : "—"}
                  icon={<GraduationCap className="h-4 w-4" />}
                />
                <FactCard
                  label="Seasons Eligibility Left"
                  value={profile?.seasons_eligibility ?? "—"}
                  icon={<Trophy className="h-4 w-4" />}
                />
                {profile?.english_level && (
                  <FactCard
                    label="English Level"
                    value={profile.english_level}
                    icon={<Languages className="h-4 w-4" />}
                  />
                )}
                {profile?.toefl_duolingo_score && (
                  <FactCard
                    label="TOEFL / Duolingo Score"
                    value={profile.toefl_duolingo_score}
                    icon={<Languages className="h-4 w-4" />}
                  />
                )}
              </div>
            </div>

            {/* Bloco 3: Recruitment & Logistics */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Recruitment & Status
              </h3>
              <div className="space-y-3">
                <FactCard
                  label="Country"
                  value={countryLabel ?? "—"}
                  icon={<MapPin className="h-4 w-4" />}
                />
                <FactCard
                  label="Seeking Opportunities For"
                  value={profile?.seeking_opportunities ?? "—"}
                  icon={<Sparkles className="h-4 w-4" />}
                />
                <FactCard
                  label="Budget Range"
                  value={profile?.budget ?? "—"}
                  icon={<DollarSign className="h-4 w-4" />}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT & STRENGTHS SECTION ── */}
      <section id="about-athlete" className="container-edge py-10 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Bio Column */}
          <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-8 lg:p-10 shadow-sm space-y-4">
            <p className="eyebrow text-primary">Bio</p>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
              About {firstName}
            </h2>
            {profile?.bio_en || profile?.bio_pt ? (
              <p className="text-base sm:text-lg leading-relaxed text-muted-foreground whitespace-pre-line">
                {profile.bio_en || profile.bio_pt}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Bio will be updated shortly by the recruitment coordinator.
              </p>
            )}
          </div>

          {/* Team Contribution / Strengths */}
          <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6 sm:p-8 lg:p-10 backdrop-blur-sm shadow-sm space-y-4">
            <p className="eyebrow text-primary">Impact & Strengths</p>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
              What {firstName} Brings to the Team
            </h2>
            {profile?.team_contribution_en ? (
              <p className="text-base sm:text-lg leading-relaxed text-foreground/90 whitespace-pre-line">
                {profile.team_contribution_en}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Performance strengths and coach insights available upon direct request.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── ACHIEVEMENTS & AWARDS ── */}
      {achievements.length > 0 && (
        <section id="achievements" className="container-edge py-12 border-t border-border/70">
          <p className="eyebrow text-primary">Track Record</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
            Achievements & Awards
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {achievements.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition hover:shadow-md"
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title_en || item.title_pt || ""}
                    loading="lazy"
                    className="aspect-[16/9] w-full object-cover"
                  />
                )}
                <div className="flex gap-4 p-5 sm:p-6">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-500">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-foreground">
                      {item.title_en || item.title_pt}
                    </h3>
                    {(item.description_en || item.description_pt) && (
                      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                        {item.description_en || item.description_pt}
                      </p>
                    )}
                    {item.achieved_on && (
                      <p className="mt-2.5 text-xs font-medium text-muted-foreground/80">
                        {new Date(item.achieved_on).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── PHOTO & MEDIA GALLERY ── */}
      {media.length > 0 && (
        <section id="gallery" className="border-t border-border bg-muted/20 py-14">
          <div className="container-edge">
            <p className="eyebrow text-primary">Media</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
              Photo Gallery
            </h2>
            <div className="mt-8 grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {media.map((item) =>
                item.kind === "video" ? (
                  <video
                    key={item.id}
                    controls
                    poster={item.thumbnail_url ?? undefined}
                    className="aspect-video w-full rounded-xl bg-black"
                  >
                    <source src={item.url} />
                  </video>
                ) : (
                  <img
                    key={item.id}
                    src={item.url}
                    alt={item.caption_en || item.caption_pt || athlete.full_name}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-xl object-cover shadow-sm transition hover:scale-[1.02] duration-300"
                  />
                ),
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── DIRECT RECRUITMENT CALL TO ACTION ── */}
      <section
        id="recruit-cta"
        className="border-t border-border py-16 lg:py-20 bg-gradient-to-b from-card/40 to-background"
      >
        <div className="container-edge grid gap-6 text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
            <MessageCircle className="h-4 w-4" /> Direct Scout Access
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Interested in Recruiting {athlete.full_name}?
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            Connect directly with the Go Team Go agency team on WhatsApp to request full match film,
            academic transcripts, and recruitment dossiers.
          </p>
          <div className="pt-2 flex justify-center">
            <a
              href={buildRecruitWhatsappUrl(athlete.full_name)}
              target="_blank"
              rel="noopener noreferrer"
              className="liquid-button inline-flex h-12 items-center gap-2 rounded-xl px-8 text-xs font-bold uppercase tracking-[0.16em] shadow-xl shadow-emerald-950/30"
            >
              <MessageCircle className="h-4 w-4 fill-current" />
              Recruit {firstName} on WhatsApp
            </a>
          </div>
        </div>
      </section>

      <WhatsappFab athleteName={athlete.full_name} />
    </main>
  );
}

/* ── HELPERS & SUB-COMPONENTS ── */

function loaderPhotoOrFallback(athlete: PublicAthletePayload["athlete"]) {
  return athlete.photo_url ?? getAthleteDisplayImage(athlete);
}

function FactCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5 transition hover:border-border">
      <div className="mt-0.5 text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-0.5 font-display text-sm font-semibold text-foreground truncate">
          {value}
        </dd>
      </div>
    </div>
  );
}
