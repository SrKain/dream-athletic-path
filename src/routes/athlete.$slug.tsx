import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  Award,
  Calendar,
  DollarSign,
  GraduationCap,
  Languages,
  MapPin,
  Play,
  Ruler,
  School,
  Sparkles,
  Trophy,
} from "lucide-react";

import { ReelsRow } from "@/components/reels-viewer";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { getPublicAthlete, type PublicAthletePayload } from "@/lib/athletes.functions";
import { calculateAge } from "@/lib/catalog";
import { buildRecruitWhatsappUrl } from "@/lib/contact";
import { getAthleteDisplayImage } from "@/lib/mock-athlete-images";
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
  const { athlete, profile, media, achievements, videos } =
    Route.useLoaderData() as PublicAthletePayload;

  const age = calculateAge(athlete.birth_date);
  const firstName = athlete.full_name.split(" ")[0];

  const safeVideos = Array.isArray(videos) ? videos : [];
  const highlights = safeVideos.filter((item) => item.kind === "highlight");
  const inCourtVideos = safeVideos.filter((item) => item.kind === "in_court");
  const featureVideo = safeVideos.find((item) => item.kind === "feature");
  const presentationVideo = safeVideos.find((item) => item.kind === "presentation");

  const featureUrl = featureVideo?.youtube_url || profile?.highlight_video_url;
  const heroBackground = youtubeEmbedUrl(featureUrl, {
    autoplay: true,
    controls: false,
    loop: true,
    muted: true,
  });

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
    <main className="min-h-screen bg-background">
      {/* ── STICKY HEADER ── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="container-edge flex h-16 items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">
            Go Team Go
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Catalog
          </Link>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden bg-surface text-surface-foreground">
        {/* Background: Atmospheric YouTube Feature Video with Emerald Layer & Blur */}
        {heroBackground ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <iframe
              src={heroBackground}
              title=""
              tabIndex={-1}
              allow="autoplay; encrypted-media"
              className="absolute left-1/2 top-1/2 h-[190%] w-[190%] -translate-x-1/2 -translate-y-1/2 scale-105 border-0 opacity-70"
            />
            {/* Green emerald tint + blur overlay so the video acts purely as background kinetic texture */}
            <div className="absolute inset-0 bg-[oklch(0.22_0.08_162_/_0.78)] backdrop-blur-[5px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-surface to-surface" />
        )}

        <div className="container-edge relative z-10 py-10 sm:py-14 lg:py-16">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
            {/* Athlete Photo (Visual Anchor - 4:5 ratio) */}
            <div className="relative aspect-[4/5] w-36 shrink-0 overflow-hidden rounded-xl bg-white/10 shadow-2xl ring-2 ring-white/20 sm:w-48 md:w-56">
              <img
                src={photoUrl}
                alt={athlete.full_name}
                className="h-full w-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>

            {/* Athlete Info */}
            <div className="flex-1 space-y-4">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                  {athlete.full_name}
                </h1>
                <p className="mt-1.5 text-base font-medium text-primary-foreground/80 sm:text-lg">
                  {subtitle}
                </p>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {positionLabel && (
                  <span className="inline-flex items-center rounded-full bg-primary/25 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground border border-primary/30">
                    {positionLabel}
                  </span>
                )}
                {countryLabel && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-surface-foreground">
                    {athlete.country?.flag_emoji && <span>{athlete.country.flag_emoji}</span>}
                    {countryLabel}
                  </span>
                )}
                {profile?.seeking_opportunities && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/15 px-3 py-1 text-xs font-medium text-[var(--gold)]">
                    <Sparkles className="h-3 w-3" /> {profile.seeking_opportunities}
                  </span>
                )}
              </div>

              {/* Key Quick Stats */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-surface-foreground/80 pt-2">
                {athlete.height_cm && (
                  <span className="flex items-center gap-1.5">
                    <Ruler className="h-4 w-4 text-primary" /> {athlete.height_cm} cm
                  </span>
                )}
                {birthDateFormatted && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-primary" /> {birthDateFormatted}
                    {age !== null ? ` (${age} yrs)` : ""}
                  </span>
                )}
                {profile?.gpa && (
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 text-primary" /> GPA {profile.gpa}
                  </span>
                )}
                {(profile?.high_school_graduation || profile?.graduation_year) && (
                  <span className="flex items-center gap-1.5">
                    <School className="h-4 w-4 text-primary" /> Class of{" "}
                    {profile.high_school_graduation || profile.graduation_year}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <a
                  href={buildRecruitWhatsappUrl(athlete.full_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="liquid-button inline-flex h-11 items-center rounded-md px-6 text-xs font-semibold uppercase tracking-[0.16em]"
                >
                  Recruit Athlete
                </a>
                {featureVideo && (
                  <a
                    href="#featured-video"
                    className="inline-flex h-11 items-center gap-2 rounded-md border border-white/25 px-5 text-xs font-semibold uppercase tracking-wider text-surface-foreground transition hover:border-white/50 hover:bg-white/10"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" /> Watch Featured
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HIGHLIGHTS (INSTAGRAM-STYLE REELS) ── */}
      {highlights.length > 0 && <ReelsRow videos={highlights} athleteName={athlete.full_name} />}

      {/* ── ABOUT & FACT SHEET SECTION ── */}
      <section className="container-edge py-12 lg:py-16">
        <div className="space-y-8">
          <div>
            <p className="eyebrow text-primary">Athlete Profile</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              About {firstName}
            </h2>
            {(profile?.bio_en || profile?.bio_pt) && (
              <p className="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-muted-foreground whitespace-pre-line">
                {profile.bio_en || profile.bio_pt}
              </p>
            )}
          </div>

          {/* Complete Fact Sheet Grid */}
          <div className="rounded-xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
            <h3 className="font-display text-lg font-bold tracking-tight mb-6 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Key Recruiting Details
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <ProfileFact
                label="Position"
                value={positionLabel ?? "—"}
                icon={<Award className="h-4 w-4" />}
              />
              <ProfileFact
                label="Height"
                value={athlete.height_cm ? `${athlete.height_cm} cm` : "—"}
                icon={<Ruler className="h-4 w-4" />}
              />
              <ProfileFact
                label="Date of Birth"
                value={
                  birthDateFormatted
                    ? `${birthDateFormatted}${age !== null ? ` (${age} years old)` : ""}`
                    : "—"
                }
                icon={<Calendar className="h-4 w-4" />}
              />
              <ProfileFact
                label="Current School"
                value={profile?.current_school ?? "—"}
                icon={<School className="h-4 w-4" />}
              />
              <ProfileFact
                label="High School Graduation"
                value={
                  profile?.high_school_graduation ||
                  (profile?.graduation_year ? String(profile.graduation_year) : "—")
                }
                icon={<GraduationCap className="h-4 w-4" />}
              />
              <ProfileFact
                label="Country"
                value={countryLabel ?? "—"}
                icon={<MapPin className="h-4 w-4" />}
              />
              <ProfileFact
                label="Seeking Opportunities For"
                value={profile?.seeking_opportunities ?? "—"}
                icon={<Sparkles className="h-4 w-4" />}
              />
              <ProfileFact
                label="TOEFL / Duolingo Score"
                value={profile?.toefl_duolingo_score ?? "—"}
                icon={<Languages className="h-4 w-4" />}
              />
              <ProfileFact
                label="Current GPA"
                value={profile?.gpa ? String(profile.gpa) : "—"}
                icon={<GraduationCap className="h-4 w-4" />}
              />
              <ProfileFact
                label="Budget"
                value={profile?.budget ?? "—"}
                icon={<DollarSign className="h-4 w-4" />}
              />
              <ProfileFact
                label="Seasons of Eligibility Left"
                value={profile?.seasons_eligibility ?? "—"}
                icon={<Trophy className="h-4 w-4" />}
              />
              {profile?.english_level && (
                <ProfileFact
                  label="English Proficiency"
                  value={profile.english_level}
                  icon={<Languages className="h-4 w-4" />}
                />
              )}
            </dl>
          </div>
        </div>
      </section>

      {/* ── WHAT SHE/HE BRINGS TO THE TEAM ── */}
      {profile?.team_contribution_en && (
        <section className="container-edge py-6 pb-12">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 sm:p-8 backdrop-blur-sm">
            <p className="eyebrow text-primary">Impact & Strengths</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              What {firstName} Brings to the Team
            </h2>
            <p className="mt-4 text-base sm:text-lg leading-relaxed text-foreground/90 whitespace-pre-line">
              {profile.team_contribution_en}
            </p>
          </div>
        </section>
      )}

      {/* ── PRESENTATION VIDEO ── */}
      {presentationVideo && (
        <section className="container-edge py-12 border-t border-border/70">
          <p className="eyebrow text-primary">Presentation</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {presentationVideo.title || `Meet ${athlete.full_name}`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground mb-6">
            Personal statement, journey, and recruiting goals.
          </p>
          <YoutubePlayerFrame
            url={presentationVideo.youtube_url}
            title={`Presentation — ${athlete.full_name}`}
          />
        </section>
      )}

      {/* ── IN COURT VIDEOS (NEW) ── */}
      {inCourtVideos.length > 0 && (
        <section className="container-edge py-12 border-t border-border/70">
          <p className="eyebrow text-primary">In Action</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            In-Court Footage & Match Play
          </h2>
          <p className="mt-1 text-sm text-muted-foreground mb-6">
            Live game performances, set sequences, and tactical execution.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {inCourtVideos.map((video, idx) => (
              <article
                key={video.id}
                className="overflow-hidden rounded-xl border border-border/80 bg-card p-4 shadow-sm"
              >
                <h3 className="font-display text-base font-semibold mb-3 truncate">
                  {video.title || `Match Play Footage ${idx + 1}`}
                </h3>
                <YoutubePlayerFrame
                  url={video.youtube_url}
                  title={video.title || `In Court ${idx + 1}`}
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── FEATURED VIDEO SECTION ── */}
      {featureVideo && (
        <section
          id="featured-video"
          className="border-y border-border bg-surface py-16 text-surface-foreground lg:py-20"
        >
          <div className="container-edge">
            <p className="eyebrow text-primary">Featured Video</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {featureVideo.title || `${athlete.full_name} — Key Highlights`}
            </h2>
            <div className="mt-6">
              <YoutubePlayerFrame
                url={featureVideo.youtube_url}
                title={`Featured Video — ${athlete.full_name}`}
              />
            </div>
          </div>
        </section>
      )}

      {/* ── ACHIEVEMENTS ── */}
      {achievements.length > 0 && (
        <section className="container-edge py-16">
          <p className="eyebrow text-primary">Track Record</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Achievements & Awards
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {achievements.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition hover:shadow-md"
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title_en || item.title_pt || ""}
                    loading="lazy"
                    className="aspect-[16/9] w-full object-cover"
                  />
                )}
                <div className="flex gap-4 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--gold)]/15 text-[var(--gold)]">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold">
                      {item.title_en || item.title_pt}
                    </h3>
                    {(item.description_en || item.description_pt) && (
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        {item.description_en || item.description_pt}
                      </p>
                    )}
                    {item.achieved_on && (
                      <p className="mt-2 text-xs text-muted-foreground/70">
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

      {/* ── PHOTO GALLERY ── */}
      {media.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-16">
          <div className="container-edge">
            <p className="eyebrow text-primary">Media</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Photo Gallery
            </h2>
            <div className="mt-8 grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {media.map((item) =>
                item.kind === "video" ? (
                  <video
                    key={item.id}
                    controls
                    poster={item.thumbnail_url ?? undefined}
                    className="aspect-video w-full rounded-lg bg-black"
                  >
                    <source src={item.url} />
                  </video>
                ) : (
                  <img
                    key={item.id}
                    src={item.url}
                    alt={item.caption_en || item.caption_pt || athlete.full_name}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-lg object-cover shadow-sm transition hover:scale-[1.02]"
                  />
                ),
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── RECRUITMENT CALL TO ACTION ── */}
      <section className="border-t border-border py-16 lg:py-20">
        <div className="container-edge grid gap-6 text-center">
          <p className="eyebrow text-primary">Direct Scout Access</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Interested in Recruiting {athlete.full_name}?
          </h2>
          <p className="mx-auto max-w-xl text-base text-muted-foreground leading-relaxed">
            Connect directly with the Go Team Go agency team on WhatsApp to request full match
            film, academic transcripts, and recruitment dossiers.
          </p>
          <div className="pt-2">
            <a
              href={buildRecruitWhatsappUrl(athlete.full_name)}
              target="_blank"
              rel="noopener noreferrer"
              className="liquid-button inline-flex h-12 items-center rounded-md px-8 text-sm font-semibold uppercase tracking-[0.16em]"
            >
              Recruit Athlete
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

function YoutubePlayerFrame({ url, title }: { url?: string | null; title: string }) {
  if (!url) return null;
  const embed = youtubeEmbedUrl(url);
  if (!embed) return null;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-lg">
      <iframe
        src={embed}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="h-full w-full border-0"
      />
    </div>
  );
}

function ProfileFact({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/50 p-3.5">
      <div className="mt-0.5 text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </dt>
        <dd className="mt-1 font-display text-sm font-semibold text-foreground truncate">
          {value}
        </dd>
      </div>
    </div>
  );
}
