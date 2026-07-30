import { createServerFn } from "@tanstack/react-start";

import type { Achievement, AthleteCard, AthleteMedia, AthleteProfile } from "@/types/db";

export type PublicAthletePayload = {
  athlete: AthleteCard;
  profile: AthleteProfile | null;
  media: AthleteMedia[];
  achievements: Achievement[];
};

export const PUBLIC_ATHLETE_SELECT =
  "id, slug, full_name, birth_date, height_cm, weight_kg, nationality, sport_id, position_id, photo_url, cover_url, is_public, is_featured, created_at, position:positions(name_en,name_pt,abbreviation), sport:sports(name_en,name_pt,slug), country:countries(name_en,name_pt,flag_emoji)";

/** Feed público — leitura anônima via RLS no Supabase externo. */
export const listPublicAthletes = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ athletes: AthleteCard[]; configured: boolean }> => {
  const { getPublicServerClient } = await import("@/lib/supabase/clients.server");
  const client = getPublicServerClient();
  if (!client) return { athletes: [] as AthleteCard[], configured: false };

  const { data, error } = await client
    .from("athletes")
    .select(PUBLIC_ATHLETE_SELECT)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error("[feed] erro ao carregar atletas:", error.message);
    return { athletes: [] as AthleteCard[], configured: true };
  }
  return { athletes: (data ?? []) as unknown as AthleteCard[], configured: true };
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
    const [profile, media, achievements] = await Promise.all([
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
    ]);

    return {
      athlete: athlete as unknown as AthleteCard,
      profile: (profile.data ?? null) as AthleteProfile | null,
      media: (media.data ?? []) as unknown as AthleteMedia[],
      achievements: (achievements.data ?? []) as unknown as Achievement[],
    };
  });
