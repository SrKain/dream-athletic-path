import { isValidYoutubeUrl } from "@/lib/youtube";
import type { AthleteVideo } from "@/types/db";

export type PublicVideoGroups = {
  feature: AthleteVideo | undefined;
  presentations: AthleteVideo[];
  highlights: AthleteVideo[];
  inCourt: AthleteVideo[];
  heroUrl: string | null;
};

export function groupPublicVideos(
  videos: AthleteVideo[] | null | undefined,
  profileHighlightUrl?: string | null,
): PublicVideoGroups {
  const sortedVideos = (videos ?? [])
    .filter((video) => isValidYoutubeUrl(video.youtube_url))
    .sort((left, right) => left.sort_order - right.sort_order);

  const feature = sortedVideos.find((video) => video.kind === "feature");
  const presentations = sortedVideos.filter((video) => video.kind === "presentation");
  const highlights = sortedVideos.filter((video) => video.kind === "highlight");
  const inCourt = sortedVideos.filter((video) => video.kind === "in_court");
  const fallbackHighlight = isValidYoutubeUrl(profileHighlightUrl) ? profileHighlightUrl : null;

  return {
    feature,
    presentations,
    highlights,
    inCourt,
    heroUrl:
      feature?.youtube_url ??
      fallbackHighlight ??
      presentations[0]?.youtube_url ??
      highlights[0]?.youtube_url ??
      inCourt[0]?.youtube_url ??
      null,
  };
}
