import { createServerFn } from "@tanstack/react-start";

import type {
  Achievement,
  AgencyVisualSettings,
  AthleteCard,
  AthleteMedia,
  AthleteProfile,
  AthleteVideo,
  HighlightFeedItem,
  HighlightStoryAthlete,
} from "@/types/db";

export type PublicAthletePayload = {
  athlete: AthleteCard;
  profile: AthleteProfile | null;
  media: AthleteMedia[];
  achievements: Achievement[];
  videos: AthleteVideo[];
  videosAvailable: boolean;
  nextAthlete?: AthleteCard | null;
  visual: AgencyVisualSettings | null;
};

export type PublicCatalogPayload = {
  athletes: AthleteCard[];
  configured: boolean;
  visual: AgencyVisualSettings | null;
  positionOrder: string[];
  featureVideos: Record<string, string>;
  storyAthletes: HighlightStoryAthlete[];
  highlightFeed: HighlightFeedItem[];
};

export const PUBLIC_ATHLETE_SELECT =
  "id, slug, full_name, birth_date, height_cm, weight_kg, nationality, sport_id, position_id, photo_url, cover_url, is_public, is_featured, created_at, position:positions(name_en,name_pt,abbreviation), sport:sports(name_en,name_pt,slug), country:countries(name_en,name_pt,flag_emoji)";

export const AGENCY_VISUAL_PUBLIC_SELECT =
  "agency_id, hero_title_pt, hero_title_en, hero_subtitle_pt, hero_subtitle_en, catalog_heading_pt, catalog_heading_en, logo_url, hero_background_url";

export const PUBLIC_PROFILE_SELECT =
  "athlete_id, high_school_graduation, graduation_year, athlete_status, highlight_video_url, gpa, current_school, course_of_interest, english_level, toefl_duolingo_score, seeking_opportunities, budget, bio_en, team_contribution_en, college_start_date";

export const PUBLIC_MEDIA_SELECT =
  "id, athlete_id, kind, url, thumbnail_url, caption_en, is_public, sort_order, created_at";

export const PUBLIC_ACHIEVEMENTS_SELECT =
  "id, athlete_id, title_en, description_en, achieved_on, image_url, medal, achievement_type, is_public";

export const PUBLIC_VIDEOS_SELECT =
  "id, athlete_id, kind, youtube_url, title, sort_order, created_at";

/** Configuração visual da agência (logotipo, favicon, etc.). */
export const getAgencyVisual = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgencyVisualSettings | null> => {
    const { getPublicServerClient } = await import("@/lib/supabase/clients.server");
    const client = getPublicServerClient();
    if (!client) return null;
    const { data } = await client
      .from("agency_visual_settings")
      .select(AGENCY_VISUAL_PUBLIC_SELECT)
      .limit(1)
      .maybeSingle();
    return (data ?? null) as AgencyVisualSettings | null;
  },
);

/** Feed público — leitura anônima via RLS no Supabase externo. */
export const listPublicAthletes = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicCatalogPayload> => {
    const { getPublicServerClient } = await import("@/lib/supabase/clients.server");
    const client = getPublicServerClient();
    const empty: PublicCatalogPayload = {
      athletes: [],
      configured: false,
      featureVideos: {},
      positionOrder: [],
      visual: null,
      storyAthletes: [],
      highlightFeed: [],
    };
    if (!client) return empty;

    const [athletesResult, visualResult, orderResult] = await Promise.all([
      client
        .from("athletes")
        .select(PUBLIC_ATHLETE_SELECT)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(60),
      client
        .from("agency_visual_settings")
        .select(AGENCY_VISUAL_PUBLIC_SELECT)
        .limit(1)
        .maybeSingle(),
      client.from("catalog_position_order").select("position_id, sort_order").order("sort_order"),
    ]);

    if (athletesResult.error) {
      console.error("[feed] erro ao carregar atletas:", athletesResult.error.message);
      return { ...empty, configured: true };
    }

    const athletes = (athletesResult.data ?? []) as unknown as AthleteCard[];
    const featureVideos: Record<string, string> = {};
    const highlightFeed: HighlightFeedItem[] = [];
    const storyAthletes: HighlightStoryAthlete[] = [];

    if (athletes.length) {
      const athleteIds = athletes.map((item) => item.id);
      const [videosResult, profilesResult] = await Promise.all([
        client
          .from("athlete_videos")
          .select("id, athlete_id, youtube_url, sort_order, kind, title, created_at")
          .in("athlete_id", athleteIds)
          .order("sort_order"),
        client
          .from("athlete_profiles")
          .select(
            "athlete_id, highlight_video_url, high_school_graduation, graduation_year, athlete_status",
          )
          .in("athlete_id", athleteIds),
      ]);

      if (videosResult.error)
        console.error("[listPublicAthletes] athlete_videos:", videosResult.error.message);
      const allVideos = (videosResult.data ?? []) as {
        id: string;
        athlete_id: string;
        youtube_url: string;
        kind: string;
        title: string | null;
        created_at?: string;
      }[];
      const profiles = (profilesResult.data ?? []) as {
        athlete_id: string;
        highlight_video_url: string | null;
        high_school_graduation: string | null;
        graduation_year: number | null;
        athlete_status: string | null;
      }[];

      // Busca likes filtrados estritamente pelos IDs dos vídeos existentes (economiza egress)
      const allVideoIds = allVideos.map((v) => v.id).filter(Boolean);
      const likesByVideo: Record<string, number> = {};
      if (allVideoIds.length > 0) {
        const { data: likesData } = await client
          .from("athlete_video_likes")
          .select("video_id")
          .in("video_id", allVideoIds);

        if (likesData) {
          for (const row of likesData as { video_id: string }[]) {
            if (row.video_id) {
              likesByVideo[row.video_id] = (likesByVideo[row.video_id] || 0) + 1;
            }
          }
        }
      }

      // Prioridade para o card do catálogo: feature > highlight > presentation > in_court > profile.highlight_video_url
      const athleteHighlightMap = new Map<string, HighlightFeedItem[]>();

      for (const athlete of athletes) {
        const athleteId = athlete.id;
        const athleteVids = allVideos.filter((v) => v.athlete_id === athleteId);
        const feature = athleteVids.find((v) => v.kind === "feature");
        const highlight = athleteVids.find((v) => v.kind === "highlight");
        const presentation = athleteVids.find((v) => v.kind === "presentation");
        const inCourt = athleteVids.find((v) => v.kind === "in_court");
        const prof = profiles.find((p) => p.athlete_id === athleteId);

        if (prof) {
          athlete.profile = {
            high_school_graduation: prof.high_school_graduation,
            graduation_year: prof.graduation_year,
            athlete_status: prof.athlete_status,
            highlight_video_url: prof.highlight_video_url,
          };
        }

        const chosenUrl =
          feature?.youtube_url ||
          highlight?.youtube_url ||
          presentation?.youtube_url ||
          inCourt?.youtube_url ||
          prof?.highlight_video_url;

        if (chosenUrl) {
          featureVideos[athleteId] = chosenUrl;
        }

        // Coleta de clips de highlights para a trilha de Stories / Reels da Home
        const athleteHighlights = athleteVids.filter((v) => v.kind === "highlight");
        const items: HighlightFeedItem[] = [];

        for (const vid of athleteHighlights) {
          if (vid.youtube_url) {
            items.push({
              id: vid.id,
              athleteId: athlete.id,
              athleteName: athlete.full_name,
              athleteSlug: athlete.slug,
              athletePhoto: athlete.photo_url,
              positionEn: athlete.position?.name_en ?? null,
              countryEn: athlete.country?.name_en ?? null,
              countryFlag: athlete.country?.flag_emoji ?? null,
              youtubeUrl: vid.youtube_url,
              title: vid.title,
              createdAt: vid.created_at || athlete.created_at,
              likesCount: likesByVideo[vid.id] || 0,
            });
          }
        }

        // Fallback: se não tiver athlete_videos do tipo highlight, mas tiver highlight_video_url no profile
        if (items.length === 0 && prof?.highlight_video_url) {
          const fakeId = `prof-${athlete.id}`;
          items.push({
            id: fakeId,
            athleteId: athlete.id,
            athleteName: athlete.full_name,
            athleteSlug: athlete.slug,
            athletePhoto: athlete.photo_url,
            positionEn: athlete.position?.name_en ?? null,
            countryEn: athlete.country?.name_en ?? null,
            countryFlag: athlete.country?.flag_emoji ?? null,
            youtubeUrl: prof.highlight_video_url,
            title: `${athlete.full_name} Highlights`,
            createdAt: athlete.created_at,
            likesCount: likesByVideo[fakeId] || 0,
          });
        }

        if (items.length > 0) {
          athleteHighlightMap.set(athlete.id, items);
        }
      }

      // Ordenar todo o feed global de highlights do mais recente para o mais antigo
      const allGlobalHighlights: HighlightFeedItem[] = [];
      for (const list of athleteHighlightMap.values()) {
        allGlobalHighlights.push(...list);
      }

      allGlobalHighlights.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        return timeB - timeA;
      });

      highlightFeed.push(...allGlobalHighlights);

      // Montar a trilha de bolinhas (1 por atleta com highlight ativo), ordenada pela atleta com highlight mais recente
      const processedAthletes = new Set<string>();
      for (const item of allGlobalHighlights) {
        if (!processedAthletes.has(item.athleteId)) {
          processedAthletes.add(item.athleteId);
          const athleteItems = athleteHighlightMap.get(item.athleteId) || [];
          const firstIndex = highlightFeed.findIndex((h) => h.athleteId === item.athleteId);

          storyAthletes.push({
            athleteId: item.athleteId,
            athleteName: item.athleteName,
            athleteSlug: item.athleteSlug,
            photoUrl: item.athletePhoto,
            positionEn: item.positionEn,
            latestHighlightDate: item.createdAt,
            highlightsCount: athleteItems.length,
            firstHighlightIndex: firstIndex >= 0 ? firstIndex : 0,
          });
        }
      }
    }

    return {
      athletes,
      configured: true,
      featureVideos,
      positionOrder: ((orderResult.data ?? []) as { position_id: string }[]).map(
        (item) => item.position_id,
      ),
      visual: (visualResult.data ?? null) as AgencyVisualSettings | null,
      storyAthletes,
      highlightFeed,
    };
  },
);

/** Registra like no highlight com persistência segura */
export const likeHighlightVideo = createServerFn({ method: "POST" })
  .validator((data: { videoId: string; athleteId: string; userFingerprint?: string }) => ({
    videoId: String(data.videoId),
    athleteId: String(data.athleteId),
    userFingerprint: String(data.userFingerprint || "anonymous").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("@/lib/supabase/clients.server");
    const client = getPublicServerClient();
    if (!client) return { success: true, count: 1 };

    try {
      const { error } = await client.from("athlete_video_likes").insert({
        video_id: data.videoId,
        athlete_id: data.athleteId,
        user_fingerprint: data.userFingerprint,
      });

      if (error) {
        console.warn("[likeHighlightVideo] DB error or fallback:", error.message);
      }

      // Consulta contagem atualizada
      const { count } = await client
        .from("athlete_video_likes")
        .select("*", { count: "exact", head: true })
        .eq("video_id", data.videoId);

      return { success: true, count: count ?? 1 };
    } catch (err) {
      console.warn("[likeHighlightVideo] exception:", err);
      return { success: true, count: 1 };
    }
  });

/** Perfil público por slug (com fallback para slugs antigos). */
export const getPublicAthlete = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => ({ slug: String(data.slug).slice(0, 120) }))
  .handler(async ({ data }): Promise<PublicAthletePayload | null> => {
    const { getPublicServerClient } = await import("@/lib/supabase/clients.server");
    const client = getPublicServerClient();
    if (!client) return null;

    let { data: athlete } = await client
      .from("athletes")
      .select(PUBLIC_ATHLETE_SELECT)
      .eq("slug", data.slug)
      .eq("is_public", true)
      .maybeSingle();

    if (!athlete) {
      const { data: legacy } = await client
        .from("athlete_slug_history")
        .select("athlete_id")
        .eq("slug", data.slug)
        .maybeSingle();
      if (!legacy) return null;
      const retry = await client
        .from("athletes")
        .select(PUBLIC_ATHLETE_SELECT)
        .eq("id", legacy.athlete_id)
        .eq("is_public", true)
        .maybeSingle();
      athlete = retry.data;
    }
    if (!athlete) return null;

    const athleteId = (athlete as { id: string }).id;
    const positionId = (athlete as { position_id?: string }).position_id;

    const [profile, media, achievements, videos, visualResult] = await Promise.all([
      client
        .from("athlete_profiles")
        .select(PUBLIC_PROFILE_SELECT)
        .eq("athlete_id", athleteId)
        .maybeSingle(),
      client
        .from("athlete_media")
        .select(PUBLIC_MEDIA_SELECT)
        .eq("athlete_id", athleteId)
        .eq("is_public", true)
        .order("sort_order"),
      client
        .from("achievements")
        .select(PUBLIC_ACHIEVEMENTS_SELECT)
        .eq("athlete_id", athleteId)
        .eq("is_public", true)
        .order("achieved_on", { ascending: false }),
      client
        .from("athlete_videos")
        .select(PUBLIC_VIDEOS_SELECT)
        .eq("athlete_id", athleteId)
        .order("sort_order"),
      client
        .from("agency_visual_settings")
        .select(AGENCY_VISUAL_PUBLIC_SELECT)
        .limit(1)
        .maybeSingle(),
    ]);

    let nextAthlete: AthleteCard | null = null;
    if (positionId) {
      const { data: samePos } = await client
        .from("athletes")
        .select(PUBLIC_ATHLETE_SELECT)
        .eq("is_public", true)
        .eq("position_id", positionId)
        .neq("id", athleteId)
        .limit(1)
        .maybeSingle();
      if (samePos) {
        nextAthlete = samePos as unknown as AthleteCard;
      }
    }

    if (!nextAthlete) {
      const { data: fallbackNext } = await client
        .from("athletes")
        .select(PUBLIC_ATHLETE_SELECT)
        .eq("is_public", true)
        .neq("id", athleteId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackNext) {
        nextAthlete = fallbackNext as unknown as AthleteCard;
      }
    }

    if (videos.error) {
      console.error(
        "[getPublicAthlete] athlete_videos indisponível. Verifique a migration 0009 e as políticas RLS:",
        videos.error.message,
      );
    }
    return {
      athlete: athlete as unknown as AthleteCard,
      profile: (profile.data ?? null) as AthleteProfile | null,
      media: (media.data ?? []) as unknown as AthleteMedia[],
      achievements: (achievements.data ?? []) as unknown as Achievement[],
      videos: (videos.data ?? []) as unknown as AthleteVideo[],
      videosAvailable: !videos.error,
      nextAthlete,
      visual: (visualResult.data ?? null) as AgencyVisualSettings | null,
    };
  });
