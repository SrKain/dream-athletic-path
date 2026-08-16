import { createServerFn } from "@tanstack/react-start";

import type {
  Achievement,
  AgencyVisualSettings,
  AthleteCard,
  AthleteMedia,
  AthleteProfile,
  AthleteVideo,
} from "@/types/db";

export type PublicAthletePayload = {
  athlete: AthleteCard;
  profile: AthleteProfile | null;
  media: AthleteMedia[];
  achievements: Achievement[];
  videos: AthleteVideo[];
};

export type PublicCatalogPayload = {
  athletes: AthleteCard[];
  configured: boolean;
  visual: AgencyVisualSettings | null;
  positionOrder: string[];
  featureVideos: Record<string, string>;
};

export const PUBLIC_ATHLETE_SELECT =
  "id, slug, full_name, birth_date, height_cm, weight_kg, nationality, sport_id, position_id, photo_url, cover_url, is_public, is_featured, created_at, position:positions(name_en,name_pt,abbreviation), sport:sports(name_en,name_pt,slug), country:countries(name_en,name_pt,flag_emoji)";

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
    };
    if (!client) return empty;

    const [athletesResult, visualResult, orderResult] = await Promise.all([
      client
        .from("athletes")
        .select(PUBLIC_ATHLETE_SELECT)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(60),
      client.from("agency_visual_settings").select("*").limit(1).maybeSingle(),
      client.from("catalog_position_order").select("position_id, sort_order").order("sort_order"),
    ]);

    if (athletesResult.error) {
      console.error("[feed] erro ao carregar atletas:", athletesResult.error.message);
      return { ...empty, configured: true };
    }

    const athletes = (athletesResult.data ?? []) as unknown as AthleteCard[];
    const featureVideos: Record<string, string> = {};
    if (athletes.length) {
      const athleteIds = athletes.map((item) => item.id);
      const [videosResult, profilesResult] = await Promise.all([
        client
          .from("athlete_videos")
          .select("athlete_id, youtube_url, sort_order, kind")
          .in("athlete_id", athleteIds)
          .order("sort_order"),
        client
          .from("athlete_profiles")
          .select("athlete_id, highlight_video_url")
          .in("athlete_id", athleteIds),
      ]);

      if (videosResult.error) console.error("[listPublicAthletes] athlete_videos:", videosResult.error.message);
      const allVideos = (videosResult.data ?? []) as {
        athlete_id: string;
        youtube_url: string;
        kind: string;
      }[];
      const profiles = (profilesResult.data ?? []) as {
        athlete_id: string;
        highlight_video_url: string | null;
      }[];

      // Prioridade para o card do catálogo: feature > highlight > presentation > in_court > profile.highlight_video_url
      for (const athleteId of athleteIds) {
        const athleteVids = allVideos.filter((v) => v.athlete_id === athleteId);
        const feature = athleteVids.find((v) => v.kind === "feature");
        const highlight = athleteVids.find((v) => v.kind === "highlight");
        const presentation = athleteVids.find((v) => v.kind === "presentation");
        const inCourt = athleteVids.find((v) => v.kind === "in_court");
        const prof = profiles.find((p) => p.athlete_id === athleteId);

        const chosenUrl =
          feature?.youtube_url ||
          highlight?.youtube_url ||
          presentation?.youtube_url ||
          inCourt?.youtube_url ||
          prof?.highlight_video_url;

        if (chosenUrl) {
          featureVideos[athleteId] = chosenUrl;
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
    };
  },
);

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
    const [profile, media, achievements, videos] = await Promise.all([
      client.from("athlete_profiles").select("*").eq("athlete_id", athleteId).maybeSingle(),
      client
        .from("athlete_media")
        .select("*")
        .eq("athlete_id", athleteId)
        .eq("is_public", true)
        .order("sort_order"),
      client
        .from("achievements")
        .select("*")
        .eq("athlete_id", athleteId)
        .eq("is_public", true)
        .order("achieved_on", { ascending: false }),
      client.from("athlete_videos").select("*").eq("athlete_id", athleteId).order("sort_order"),
    ]);

    if (videos.error) console.error("[getPublicAthlete] athlete_videos:", videos.error.message);
    return {
      athlete: athlete as unknown as AthleteCard,
      profile: (profile.data ?? null) as AthleteProfile | null,
      media: (media.data ?? []) as unknown as AthleteMedia[],
      achievements: (achievements.data ?? []) as unknown as Achievement[],
      videos: (videos.data ?? []) as unknown as AthleteVideo[],
    };
  });
