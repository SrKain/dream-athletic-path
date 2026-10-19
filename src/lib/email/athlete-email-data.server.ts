import { getAdminClient } from "@/lib/supabase/clients.server";
import type { RecruitEmailData } from "./recruit-email-template";
export { assertAthleteEmailFields, getMissingAthleteEmailFields } from "./athlete-email-quality";

type AdminClient = ReturnType<typeof getAdminClient>;
/**
 * One batched loader for all recruitment channels. No queries per recipient and
 * Essential relations fail explicitly; achievements are optional enrichment.
 */
export async function loadAthletesEmailData(
  athleteIds: string[],
  admin: AdminClient = getAdminClient(),
): Promise<RecruitEmailData[]> {
  const ids = [...new Set(athleteIds.filter(Boolean))];
  if (ids.length === 0) return [];
  if (ids.length > 200) throw new Error("Mailer supports up to 200 athletes per load.");

  const [athletesRes, profilesRes, videosRes, achievementsRes] = await Promise.all([
    admin
      .from("athletes")
      .select("id, slug, full_name, photo_url, height_cm, nationality, sport_id, position_id")
      .in("id", ids),
    admin
      .from("athlete_profiles")
      .select(
        "athlete_id, high_school_graduation, graduation_year, gpa, athlete_status, highlight_note, budget, highlight_video_url, current_school, course_of_interest, college_start_date, seeking_opportunities, stats, bio_en, team_contribution_en",
      )
      .in("athlete_id", ids),
    admin
      .from("athlete_videos")
      .select("athlete_id, youtube_url, title, kind, sort_order")
      .in("athlete_id", ids)
      .in("kind", ["highlight", "feature"])
      .order("sort_order", { ascending: true }),
    Promise.resolve(
      admin
        .from("achievements")
        .select("athlete_id, title_en")
        .in("athlete_id", ids)
        .eq("is_public", true)
        .order("achieved_on", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true }),
    ).catch((error: unknown) => ({
      data: null,
      error: {
        message: error instanceof Error ? error.message : "Unexpected achievements query failure",
      },
    })),
  ]);

  for (const [name, result] of [
    ["athletes", athletesRes],
    ["athlete_profiles", profilesRes],
    ["athlete_videos", videosRes],
  ] as const) {
    if (result.error) throw new Error(`Mailer: failed loading ${name}: ${result.error.message}`);
  }

  if (achievementsRes.error) {
    console.error("[mailer] Optional athlete enrichment unavailable", {
      relation: "achievements",
      message: achievementsRes.error.message,
    });
  }

  const athleteRows = athletesRes.data ?? [];
  const sportIds = [
    ...new Set(athleteRows.map((a) => a.sport_id).filter((id): id is string => !!id)),
  ];
  const positionIds = [
    ...new Set(athleteRows.map((a) => a.position_id).filter((id): id is string => !!id)),
  ];
  const countryCodes = [
    ...new Set(athleteRows.map((a) => a.nationality).filter((id): id is string => !!id)),
  ];

  const [sportsRes, positionsRes, countriesRes] = await Promise.all([
    sportIds.length
      ? admin.from("sports").select("id, name_en").in("id", sportIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name_en: string | null }>, error: null }),
    positionIds.length
      ? admin.from("positions").select("id, name_en").in("id", positionIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name_en: string | null }>, error: null }),
    countryCodes.length
      ? admin.from("countries").select("code, name_en, flag_emoji").in("code", countryCodes)
      : Promise.resolve({
          data: [] as Array<{ code: string; name_en: string | null; flag_emoji: string | null }>,
          error: null,
        }),
  ]);
  for (const [name, result] of [
    ["sports", sportsRes],
    ["positions", positionsRes],
    ["countries", countriesRes],
  ] as const) {
    if (result.error) throw new Error(`Mailer: failed loading ${name}: ${result.error.message}`);
  }

  const profiles = new Map((profilesRes.data ?? []).map((p) => [p.athlete_id, p]));
  const sports = new Map((sportsRes.data ?? []).map((s) => [s.id, s.name_en]));
  const positions = new Map((positionsRes.data ?? []).map((p) => [p.id, p.name_en]));
  const countries = new Map((countriesRes.data ?? []).map((c) => [c.code, c]));
  const videosByAthlete = new Map<string, NonNullable<RecruitEmailData["videos"]>>();
  for (const video of videosRes.data ?? []) {
    if (!video.youtube_url) continue;
    const current = videosByAthlete.get(video.athlete_id) ?? [];
    if (current.length < 2) {
      current.push({ url: video.youtube_url, title: video.title, kind: video.kind });
      videosByAthlete.set(video.athlete_id, current);
    }
  }
  const achievements = new Map<string, string | null>();
  for (const achievement of achievementsRes.error ? [] : (achievementsRes.data ?? [])) {
    if (!achievements.has(achievement.athlete_id)) {
      achievements.set(achievement.athlete_id, achievement.title_en);
    }
  }

  const byId = new Map(athleteRows.map((a) => [a.id, a]));
  return ids.flatMap((id) => {
    const athlete = byId.get(id);
    if (!athlete) return [];
    const profile = profiles.get(id);
    const videos = videosByAthlete.get(id) ?? [];
    const country = athlete.nationality ? countries.get(athlete.nationality) : null;
    return [
      {
        athleteId: athlete.id,
        athleteName: athlete.full_name,
        athleteSlug: athlete.slug,
        photoUrl: athlete.photo_url,
        positionName: athlete.position_id ? (positions.get(athlete.position_id) ?? null) : null,
        sportName: athlete.sport_id ? (sports.get(athlete.sport_id) ?? null) : null,
        heightCm: athlete.height_cm,
        nationality: country?.name_en ?? athlete.nationality,
        countryFlag: country?.flag_emoji ?? null,
        highSchoolGraduation: profile?.high_school_graduation ?? null,
        graduationYear: profile?.graduation_year ?? null,
        gpa: profile?.gpa ?? null,
        athleteStatus: profile?.athlete_status ?? null,
        highlightNote: profile?.highlight_note ?? null,
        achievementTitle: achievements.get(id) ?? null,
        budget: profile?.budget ?? null,
        highlightVideoUrl:
          videos.find((v) => v.kind === "highlight")?.url ?? profile?.highlight_video_url ?? null,
        currentSchool: profile?.current_school ?? null,
        courseOfInterest: profile?.course_of_interest ?? null,
        collegeStartDate: profile?.college_start_date ?? null,
        seekingOpportunities: profile?.seeking_opportunities ?? null,
        stats: profile?.stats ?? null,
        aboutHer: profile?.bio_en ?? null,
        teamContribution: profile?.team_contribution_en ?? null,
        videos,
      },
    ];
  });
}

