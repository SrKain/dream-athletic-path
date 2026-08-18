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
import { PublicYoutubePlayer } from "@/components/public-youtube-player";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { getPublicAthlete, type PublicAthletePayload } from "@/lib/athletes.functions";
import { calculateAge } from "@/lib/catalog";
import { buildRecruitWhatsappUrl } from "@/lib/contact";
import { getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import { groupPublicVideos } from "@/lib/public-videos";

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

  const { presentations, highlights, inCourt, heroUrl } = groupPublicVideos(
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,oklch(0.52_0.13_160_/_0.32),transparent_36%),linear-gradient(135deg,oklch(0.19_0.05_162),oklch(0.13_0.045_162))]" />

        <div className="container-edge relative z-10 grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-center lg:py-16">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
            <div className="relative aspect-[4/5] w-36 shrink-0 overflow-hidden rounded-xl bg-white/10 shadow-2xl ring-2 ring-white/20 sm:w-48 md:w-56">
              <img
                src={photoUrl}
                alt={athlete.full_name}
                className="h-full w-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                  {athlete.full_name}
                </h1>
                <p className="mt-1.5 text-base font-medium text-primary-foreground/80 sm:text-lg">
                  {subtitle}
                </p>
              </div>

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

              <div className="flex flex-wrap items-center gap-3 pt-3">
                <a
                  href={buildRecruitWhatsappUrl(athlete.full_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="liquid-button inline-flex h-11 items-center rounded-md px-6 text-xs font-semibold uppercase tracking-[0.16em]"
                >
                  Recruit Athlete
                </a>
                {heroUrl && (
                  <a
                    href="#hero-video"
                    className="inline-flex h-11 items-center gap-2 rounded-md border border-white/25 px-5 text-xs font-semibold uppercase tracking-wider text-surface-foreground transition hover:border-white/50 hover:bg-white/10"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" /> Watch Film
                  </a>
                )}
              </div>
            </div>
          </div>
          {heroUrl && (
            <div
              id="hero-video"
              className="rounded-xl border border-white/15 bg-black/30 p-2 shadow-2xl"
            >
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/75">
                Featured Film
              </p>
              <PublicYoutubePlayer
                url={heroUrl}
                title={`Featured video — ${athlete.full_name}`}
                autoPlay
              />
            </div>
          )}
        </div>
      </section>

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

      {/* ── ATHLETE PRESENTATION ── */}
      {(presentations.length > 0 || inCourt.length > 0) && (
        <section className="container-edge py-12 border-t border-border/70">
          <p className="eyebrow text-primary">Athlete Presentation</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Meet {athlete.full_name} On and Off the Court
          </h2>
          <p className="mt-1 text-sm text-muted-foreground mb-6">
            Personal story, recruiting goals, and match footage.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {presentations.map((video, idx) => (
              <article
                key={video.id}
                className="overflow-hidden rounded-xl border border-border/80 bg-card p-4 shadow-sm"
              >
                <h3 className="font-display text-base font-semibold mb-3">
                  {video.title || `Meet ${athlete.full_name} — Video ${idx + 1}`}
                </h3>
                <PublicYoutubePlayer
                  url={video.youtube_url}
                  title={video.title || `Presentation ${idx + 1} — ${athlete.full_name}`}
                />
              </article>
            ))}
            {inCourt.map((video, idx) => (
              <article
                key={video.id}
                className="overflow-hidden rounded-xl border border-border/80 bg-card p-4 shadow-sm"
              >
                <h3 className="font-display text-base font-semibold mb-3 truncate">
                  {video.title || `Match Play Footage ${idx + 1}`}
                </h3>
                <PublicYoutubePlayer
                  url={video.youtube_url}
                  title={video.title || `In Court ${idx + 1}`}
                />
              </article>
            ))}
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
            Connect directly with the Go Team Go agency team on WhatsApp to request full match film,
            academic transcripts, and recruitment dossiers.
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
