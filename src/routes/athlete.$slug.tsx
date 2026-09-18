import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  DollarSign,
  FileText,
  GraduationCap,
  Languages,
  Mail,
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
import { useEffect, useMemo, useRef } from "react";

import { PoweredByIasinSignature } from "@/components/powered-by-iasin-signature";
import { PublicHeader } from "@/components/public-header";
import { PublicYoutubePlayer } from "@/components/public-youtube-player";
import { ReadingProgressBar } from "@/components/reading-progress-bar";
import { AthleteProfileSkeleton } from "@/components/skeletons/athlete-profile-skeleton";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { useActiveSection } from "@/hooks/use-active-section";
import { getPublicAthlete, type PublicAthletePayload } from "@/lib/athletes.functions";
import { calculateAge, getAthleteCountryEn, getAthletePositionEn } from "@/lib/catalog";
import { buildContactEmailUrl } from "@/lib/contact";
import {
  getAgencyLogoImage,
  getAthleteCardImage,
  getAthleteGalleryImage,
  getAthleteHeroImage,
  getOptimizedImageUrl,
} from "@/lib/image-transform";
import { getAthleteDisplayImage } from "@/lib/mock-athlete-images";
import { groupPublicVideos } from "@/lib/public-videos";
import { formatGpa, formatHeightImperial, formatWeightImperial } from "@/lib/units";
import { youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/youtube";

export const Route = createFileRoute("/athlete/$slug")({
  loader: async ({ params }) => {
    const result = await getPublicAthlete({ data: { slug: params.slug } });
    if (!result) throw notFound();
    return result;
  },
  pendingComponent: AthleteProfileSkeleton,
  pendingMs: 200,
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Athlete Not Found — Go Team Go Agency" },
          { name: "robots", content: "noindex, nofollow" },
        ],
      };
    }

    const { athlete, profile, visual } = loaderData;
    const sportName = athlete.sport?.name_en || "Volleyball";
    const posName = athlete.position?.name_en || "";
    const countryName = athlete.country?.name_en || "";
    const gradYear = profile?.high_school_graduation || profile?.graduation_year;
    const rawPhoto = athlete.photo_url ?? getAthleteDisplayImage(athlete);
    const photo = getOptimizedImageUrl(rawPhoto, {
      width: 1200,
      height: 630,
      resize: "cover",
      quality: 85,
    });
    const canonicalUrl = `https://portfolio.goteamgoagency.com/athlete/${athlete.slug}`;

    const titleParts = [
      athlete.full_name,
      countryName
        ? `${countryName} ${posName ? `${posName} ` : ""}${sportName}`
        : `${posName ? `${posName} ` : ""}${sportName}`,
      "Go Team Go Agency",
    ].filter(Boolean);
    const pageTitle = titleParts.join(" — ");

    const pageDescription = `${athlete.full_name}, ${countryName ? `${countryName} ` : ""}${posName ? `${posName}, ` : ""}${gradYear ? `class of ${gradYear}. ` : ""}Athletic metrics, scouting film, and academic recruiting profile represented by Go Team Go Agency for US college programs.`;

    const personSchema = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: athlete.full_name,
      url: canonicalUrl,
      image: photo,
      ...(athlete.birth_date ? { birthDate: athlete.birth_date } : {}),
      ...(athlete.country?.name_en ? { nationality: athlete.country.name_en } : {}),
      affiliation: {
        "@type": "SportsOrganization",
        name: "Go Team Go Agency",
        url: "https://portfolio.goteamgoagency.com",
        ...(visual?.logo_url ? { logo: visual.logo_url } : {}),
      },
      ...(posName
        ? { jobTitle: `${posName} — ${sportName}` }
        : { jobTitle: `Athlete — ${sportName}` }),
      hasOccupation: {
        "@type": "Occupation",
        name: "Student-Athlete",
        occupationalCategory: "Athlete",
      },
    };

    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://portfolio.goteamgoagency.com/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Athlete Catalog",
          item: "https://portfolio.goteamgoagency.com/#catalog",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: athlete.full_name,
          item: canonicalUrl,
        },
      ],
    };

    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: pageDescription },
        { name: "robots", content: "index, follow, max-image-preview:large" },
        { property: "og:title", content: pageTitle },
        { property: "og:description", content: pageDescription },
        { property: "og:url", content: canonicalUrl },
        { property: "og:site_name", content: "Go Team Go Agency" },
        { property: "og:locale", content: "en_US" },
        { property: "og:type", content: "profile" },
        { property: "og:image", content: photo },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        {
          property: "og:image:alt",
          content: `${athlete.full_name} — ${posName || "Athlete"} Scouting Profile`,
        },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: pageTitle },
        { name: "twitter:description", content: pageDescription },
        { name: "twitter:image", content: photo },
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(personSchema),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify(breadcrumbSchema),
        },
      ],
    };
  },
  component: PublicAthleteProfile,
});

function PublicAthleteProfile() {
  const { athlete, profile, media, achievements, videos, videosAvailable, nextAthlete, visual } =
    Route.useLoaderData() as PublicAthletePayload;

  const age = calculateAge(athlete.birth_date);
  const firstName = athlete.full_name.split(" ")[0];

  const { feature, presentations, highlights, inCourt, heroUrl } = groupPublicVideos(
    videos,
    profile?.highlight_video_url,
  );

  const photoUrl = loaderPhotoOrFallback(athlete);
  const positionLabel = athlete.position?.name_en;
  const countryLabel = athlete.country?.name_en;

  const birthDateFormatted = athlete.birth_date
    ? new Date(athlete.birth_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const gpaFormatted = formatGpa(profile?.gpa);

  // Watch film videos: prioritize all highlight videos; if none, check fallback heroUrl/feature/presentations
  const filmVideos = useMemo(() => {
    if (highlights.length > 0) return highlights;
    const fallbackList = [];
    if (feature) fallbackList.push(feature);
    if (presentations.length > 0) fallbackList.push(...presentations);
    if (inCourt.length > 0) fallbackList.push(...inCourt);
    return fallbackList;
  }, [highlights, feature, presentations, inCourt]);

  const sectionIds = useMemo(() => {
    const ids: string[] = [];
    if (inCourt.length > 0 || presentations.length > 0 || feature) ids.push("athlete-film");
    ids.push("fact-sheet");
    ids.push("about-athlete");
    if (achievements.length > 0) ids.push("achievements");
    if (media.length > 0) ids.push("gallery");
    ids.push("recruit-cta");
    return ids;
  }, [inCourt.length, presentations.length, feature, achievements.length, media.length]);

  const { activeId, setActiveId } = useActiveSection({ sectionIds });
  const navContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navContainerRef.current) return;
    const activeButton = navContainerRef.current.querySelector<HTMLElement>(
      `[data-nav-id="${activeId}"]`,
    );
    if (activeButton) {
      activeButton.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
    }
  }, [activeId]);

  return (
    <main className="min-h-screen bg-background text-foreground scroll-smooth">
      {/* ── READING PROGRESS BAR ── */}
      <ReadingProgressBar />
      {/* ── STICKY MAIN HEADER ── */}
      <PublicHeader visual={visual} showBackToCatalog backLabel="Back to Catalog" />

      {/* ── VISUAL BREADCRUMB NAVIGATION ── */}
      <nav
        aria-label="Breadcrumb"
        className="border-b border-border/50 bg-background/50 py-2.5 text-xs text-muted-foreground"
      >
        <div className="container-edge">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li>
              <Link to="/" className="hover:text-foreground transition-colors">
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="text-muted-foreground/60">
              /
            </li>
            <li>
              <Link to="/" hash="catalog" className="hover:text-foreground transition-colors">
                Athlete Catalog
              </Link>
            </li>
            <li aria-hidden="true" className="text-muted-foreground/60">
              /
            </li>
            <li
              aria-current="page"
              className="font-medium text-foreground truncate max-w-[200px] sm:max-w-none"
            >
              {athlete.full_name}
            </li>
          </ol>
        </div>
      </nav>

      {/* ── HERO SECTION COM LUXO MINIMALISTA (QUIET LUXURY) ── */}
      <section className="relative overflow-hidden bg-[#032812] text-[#f4f7e9] min-h-[500px] sm:min-h-[540px] flex items-center">
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

        {/* Máscara Verde Escura Profunda e Textura Sutil */}
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#032812]/98 via-[#032812]/94 to-[#021a0c]/98 backdrop-blur-[2px]" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_25%,rgba(246,158,0,0.15),transparent_55%)]" />

        <div className="container-edge relative z-10 px-6 sm:px-10 md:px-12 lg:px-16 xl:px-20 py-16 sm:py-20 lg:py-24 w-full">
          <div className="grid gap-10 lg:grid-cols-[auto_1fr] lg:gap-16 xl:gap-20 lg:items-center">
            {/* Retrato do Atleta em Proporção Editorial 4:5 */}
            <div className="flex justify-center sm:justify-start">
              <div className="relative aspect-[4/5] w-52 sm:w-60 md:w-72 shrink-0 overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/15">
                <img
                  src={getAthleteHeroImage(photoUrl)}
                  alt={`${athlete.full_name} — ${positionLabel ?? "Volleyball"} — Go Team Go Agency headshot`}
                  className="h-full w-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

                {/* Badge de Posição Discreto sobre a Foto */}
                {positionLabel && (
                  <span className="absolute bottom-3.5 left-3.5 right-3.5 text-center rounded-lg border border-white/20 bg-black/75 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#f69e00] backdrop-blur-md">
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
                    <span className="text-[#cad8cf] text-xs uppercase tracking-wider">Height:</span>
                    <span className="font-semibold">{formatHeightImperial(athlete.height_cm)}</span>
                  </div>
                )}
                {athlete.weight_kg && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#cad8cf] text-xs uppercase tracking-wider">Weight:</span>
                    <span className="font-semibold">{formatWeightImperial(athlete.weight_kg)}</span>
                  </div>
                )}
                {(profile?.high_school_graduation || profile?.graduation_year) && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#cad8cf] text-xs uppercase tracking-wider">
                      HIGH SCHOOL GRAD.:
                    </span>
                    <span className="font-semibold">
                      {profile.high_school_graduation || profile.graduation_year}
                    </span>
                  </div>
                )}
                {gpaFormatted && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#cad8cf] text-xs uppercase tracking-wider">
                      Current GPA:
                    </span>
                    <span className="font-bold text-[#f69e00]">{gpaFormatted}</span>
                  </div>
                )}
                {birthDateFormatted && (
                  <div className="flex items-center gap-2">
                    <span className="text-[#cad8cf] text-xs uppercase tracking-wider">Born:</span>
                    <span className="font-semibold">
                      {birthDateFormatted} {age !== null ? `(${age}y)` : ""}
                    </span>
                  </div>
                )}
              </div>

              {/* Botões de Ação de Alto Padrão */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <a
                  href={buildContactEmailUrl({
                    type: "athlete",
                    athleteName: athlete.full_name,
                    athleteSlug: athlete.slug,
                  })}
                  className="liquid-button inline-flex h-12 items-center gap-2.5 rounded-xl px-8 text-xs font-bold uppercase tracking-[0.16em] shadow-xl shadow-black/40"
                >
                  <Mail className="h-4 w-4" />
                  Recruit Athlete
                </a>

                {/* Botões de Watch Film diretos com link para o YouTube */}
                {filmVideos.map((video, idx) => {
                  const watchUrl = youtubeWatchUrl(video.youtube_url) ?? video.youtube_url;
                  const label =
                    video.title?.trim() ||
                    (filmVideos.length === 1 ? "Watch Film" : `Watch Film ${idx + 1}`);

                  return (
                    <a
                      key={video.id}
                      href={watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-white/20 bg-white/5 px-6 text-xs font-semibold uppercase tracking-wider text-[#f4f7e9] backdrop-blur-md transition hover:border-white/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Play className="h-3.5 w-3.5 fill-current text-[#f69e00]" /> {label}
                    </a>
                  );
                })}

                <a
                  href="#fact-sheet"
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-6 text-xs font-semibold uppercase tracking-wider text-[#cad8cf] transition hover:text-[#f4f7e9] hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <FileText className="h-3.5 w-3.5 text-[#f69e00]" /> Fact Sheet
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STICKY SUB-NAVIGATION BAR COM SCROLL-SPY ── */}
      <nav
        aria-label="Section shortcuts"
        className="sticky top-16 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md"
      >
        <div
          ref={navContainerRef}
          className="container-edge flex items-center gap-2 overflow-x-auto py-2.5 scrollbar-none text-xs font-semibold"
        >
          {(inCourt.length > 0 || presentations.length > 0 || feature) && (
            <a
              href="#athlete-film"
              data-nav-id="athlete-film"
              onClick={() => setActiveId("athlete-film")}
              aria-current={activeId === "athlete-film" ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition whitespace-nowrap ${
                activeId === "athlete-film"
                  ? "bg-primary/10 text-primary font-bold border border-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Video className="h-3.5 w-3.5 text-primary" /> Film & Footage
            </a>
          )}
          <a
            href="#fact-sheet"
            data-nav-id="fact-sheet"
            onClick={() => setActiveId("fact-sheet")}
            aria-current={activeId === "fact-sheet" ? "true" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition whitespace-nowrap ${
              activeId === "fact-sheet"
                ? "bg-primary/10 text-primary font-bold border border-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-primary" /> Recruiting Stats
          </a>
          <a
            href="#about-athlete"
            data-nav-id="about-athlete"
            onClick={() => setActiveId("about-athlete")}
            aria-current={activeId === "about-athlete" ? "true" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition whitespace-nowrap ${
              activeId === "about-athlete"
                ? "bg-primary/10 text-primary font-bold border border-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Award className="h-3.5 w-3.5 text-primary" /> About & Strengths
          </a>
          {achievements.length > 0 && (
            <a
              href="#achievements"
              data-nav-id="achievements"
              onClick={() => setActiveId("achievements")}
              aria-current={activeId === "achievements" ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition whitespace-nowrap ${
                activeId === "achievements"
                  ? "bg-primary/10 text-primary font-bold border border-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Trophy className="h-3.5 w-3.5 text-primary" /> Achievements
            </a>
          )}
          {media.length > 0 && (
            <a
              href="#gallery"
              data-nav-id="gallery"
              onClick={() => setActiveId("gallery")}
              aria-current={activeId === "gallery" ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition whitespace-nowrap ${
                activeId === "gallery"
                  ? "bg-primary/10 text-primary font-bold border border-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Gallery
            </a>
          )}
          <a
            href="#recruit-cta"
            data-nav-id="recruit-cta"
            onClick={() => setActiveId("recruit-cta")}
            aria-current={activeId === "recruit-cta" ? "true" : undefined}
            className="liquid-button inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider shadow-md shadow-black/20 transition hover:brightness-110 active:scale-95 whitespace-nowrap ml-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Mail className="h-3.5 w-3.5" /> Recruit
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
                  <span className="shrink-0 rounded-full border border-[#114f8f]/30 bg-[#114f8f]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#114f8f] dark:text-[#5ca5f0]">
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
                  <span className="shrink-0 rounded-full border border-[#084323]/30 bg-[#084323]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#084323] dark:text-[#4ade80]">
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
                {profile?.athlete_status && (
                  <FactCard
                    label="Athlete Status"
                    value={profile.athlete_status}
                    icon={<Award className="h-4 w-4" />}
                  />
                )}
                {profile?.college_start_date && (
                  <FactCard
                    label="College Start Date"
                    value={profile.college_start_date}
                    icon={<Calendar className="h-4 w-4" />}
                  />
                )}
                <FactCard
                  label="Current School"
                  value={profile?.current_school ?? "—"}
                  icon={<School className="h-4 w-4" />}
                />
                {profile?.course_of_interest && (
                  <FactCard
                    label="Course of Interest"
                    value={profile.course_of_interest}
                    icon={<BookOpen className="h-4 w-4" />}
                  />
                )}
                <FactCard
                  label="High School Graduation"
                  value={
                    profile?.high_school_graduation ||
                    (profile?.graduation_year ? String(profile.graduation_year) : "—")
                  }
                  icon={<GraduationCap className="h-4 w-4" />}
                />
                <FactCard
                  label="Current GPA"
                  value={gpaFormatted ?? "—"}
                  icon={<GraduationCap className="h-4 w-4" />}
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
            {profile?.bio_en ? (
              <p className="text-base sm:text-lg leading-relaxed text-muted-foreground whitespace-pre-line">
                {profile.bio_en}
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
                    src={getAthleteGalleryImage(item.image_url)}
                    alt={`${athlete.full_name} — ${item.title_en || "Achievement"}`}
                    loading="lazy"
                    className="aspect-[16/9] w-full object-cover"
                  />
                )}
                <div className="flex gap-4 p-5 sm:p-6">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-foreground">
                      {item.title_en}
                    </h3>
                    {item.description_en && (
                      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                        {item.description_en}
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
              {media.map((item, idx) =>
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
                    src={getAthleteGalleryImage(item.url)}
                    alt={item.caption_en || `${athlete.full_name} — Photo ${idx + 1}`}
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
            <Mail className="h-4 w-4" /> Direct Scout Access
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Interested in Recruiting {athlete.full_name}?
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            Connect directly with the Go Team Go agency team via email to request full match film,
            academic transcripts, and recruitment dossiers.
          </p>
          <div className="pt-2 flex justify-center">
            <a
              href={buildContactEmailUrl({
                type: "athlete",
                athleteName: athlete.full_name,
                athleteSlug: athlete.slug,
              })}
              className="liquid-button inline-flex h-12 items-center gap-2 rounded-xl px-8 text-xs font-bold uppercase tracking-[0.16em] shadow-xl shadow-black/30"
            >
              <Mail className="h-4 w-4" />
              Recruit {firstName} via Email
            </a>
          </div>
        </div>
      </section>

      {/* ── NEXT PROSPECT NAVIGATION CARD ── */}
      {nextAthlete && (
        <section className="border-t border-border/80 bg-muted/20 py-12">
          <div className="container-edge">
            <div className="max-w-xl mx-auto text-center mb-6">
              <span className="eyebrow text-primary">Next Prospect</span>
              <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground mt-1">
                Continue Scouting Recruits
              </h3>
            </div>
            <Link
              to="/athlete/$slug"
              params={{ slug: nextAthlete.slug }}
              preload="intent"
              className="group block max-w-md mx-auto overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-center gap-4">
                <div className="aspect-[4/5] w-20 sm:w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-950 shadow-inner">
                  <img
                    src={getAthleteCardImage(
                      nextAthlete.photo_url || getAthleteDisplayImage(nextAthlete),
                    )}
                    alt={`${nextAthlete.full_name} — ${getAthletePositionEn(nextAthlete) || "Athlete"}`}
                    className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Next Prospect
                  </span>
                  <h4 className="font-display text-base sm:text-lg font-bold text-card-foreground group-hover:text-primary transition truncate">
                    {nextAthlete.full_name}
                  </h4>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {[
                      formatHeightImperial(nextAthlete.height_cm),
                      getAthletePositionEn(nextAthlete),
                      getAthleteCountryEn(nextAthlete),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-2 group-hover:translate-x-0.5 transition-transform">
                    View Scouting Profile <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-16 border-t border-border/70 bg-background/60 py-10">
        <div className="container-edge flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            {visual?.logo_url ? (
              <img
                src={getAgencyLogoImage(visual.logo_url)}
                alt="Go Team Go Agency logo"
                className="h-7 w-auto object-contain"
              />
            ) : (
              <span className="font-display text-lg font-bold tracking-tight">Go Team Go</span>
            )}
            <span className="text-xs text-muted-foreground">
              · Connecting elite athletes with college programs across the USA.
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-muted-foreground">
            <a
              href={buildContactEmailUrl({ type: "footer" })}
              className="transition-colors hover:text-foreground underline-offset-4 hover:underline"
            >
              Get in touch
            </a>
            <span className="hidden sm:inline">·</span>
            <span>© {new Date().getFullYear()} Go Team Go Agency. All rights reserved.</span>
            <PoweredByIasinSignature className="mt-6 md:mt-0 md:self-end" />
          </div>
        </div>
      </footer>

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
