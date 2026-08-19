import { isValidYoutubeUrl } from "@/lib/youtube";
import type { AthleteVideo } from "@/types/db";

export type PublicVideoGroups = {
  allVideos: AthleteVideo[];
  feature: AthleteVideo | undefined;
  presentations: AthleteVideo[];
  highlights: AthleteVideo[];
  inCourt: AthleteVideo[];
  heroUrl: string | null;
  hasVideos: boolean;
};

export function groupPublicVideos(
  videos: AthleteVideo[] | null | undefined,
  profileHighlightUrl?: string | null,
): PublicVideoGroups {
  const sortedVideos = (videos ?? [])
    .filter((video) => isValidYoutubeUrl(video.youtube_url))
    .sort((left, right) => left.sort_order - right.sort_order);

  // Se houver highlight_video_url válido no perfil e ele não estiver na lista de vídeos, inclui como destaque
  if (
    isValidYoutubeUrl(profileHighlightUrl) &&
    !sortedVideos.some((v) => v.youtube_url === profileHighlightUrl)
  ) {
    sortedVideos.push({
      id: "profile-highlight-video",
      athlete_id: "",
      kind: "feature",
      youtube_url: profileHighlightUrl,
      title: "Featured Highlight Film",
      sort_order: -1,
      created_at: new Date().toISOString(),
    });
  }

  const feature = sortedVideos.find((video) => video.kind === "feature");
  const presentations = sortedVideos.filter((video) => video.kind === "presentation");
  const highlights = sortedVideos.filter((video) => video.kind === "highlight");
  const inCourt = sortedVideos.filter((video) => video.kind === "in_court");

  const heroUrl =
    presentations[0]?.youtube_url ??
    feature?.youtube_url ??
    inCourt[0]?.youtube_url ??
    highlights[0]?.youtube_url ??
    null;

  return {
    allVideos: sortedVideos,
    feature,
    presentations,
    highlights,
    inCourt,
    heroUrl,
    hasVideos: sortedVideos.length > 0,
  };
}
