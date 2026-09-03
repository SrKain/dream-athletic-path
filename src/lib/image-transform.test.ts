import { describe, expect, it } from "vitest";
import {
  getAgencyLogoImage,
  getAthleteCardImage,
  getAthleteGalleryImage,
  getAthleteHeroImage,
  getAthleteStoryAvatar,
  getCatalogHeroBackgroundImage,
  getOptimizedImageUrl,
} from "./image-transform";

describe("image-transform utility", () => {
  const supabaseObjectUrl =
    "https://ugxoweynkdzzfdbbppnv.supabase.co/storage/v1/object/public/athlete-media/123/photo.jpg";

  it("converts a Supabase Storage object public URL to a render/image URL with width and quality", () => {
    const result = getOptimizedImageUrl(supabaseObjectUrl, {
      width: 400,
      height: 533,
      resize: "cover",
      quality: 80,
    });

    expect(result).toContain("/storage/v1/render/image/public/athlete-media/123/photo.jpg");
    expect(result).toContain("width=400");
    expect(result).toContain("height=533");
    expect(result).toContain("resize=cover");
    expect(result).toContain("quality=80");
  });

  it("leaves external or non-Supabase URLs intact", () => {
    const external = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e";
    const local = "/assets/fallback.jpg";

    expect(getOptimizedImageUrl(external, { width: 400 })).toBe(external);
    expect(getOptimizedImageUrl(local, { width: 400 })).toBe(local);
  });

  it("handles null, undefined or empty input gracefully", () => {
    expect(getOptimizedImageUrl(null)).toBe("");
    expect(getOptimizedImageUrl(undefined)).toBe("");
    expect(getOptimizedImageUrl("")).toBe("");
  });

  it("correctly generates athlete card preset", () => {
    const card = getAthleteCardImage(supabaseObjectUrl);
    expect(card).toContain("width=400");
    expect(card).toContain("height=533");
    expect(card).toContain("resize=cover");
    expect(card).toContain("quality=80");
  });

  it("correctly generates story avatar preset", () => {
    const story = getAthleteStoryAvatar(supabaseObjectUrl);
    expect(story).toContain("width=120");
    expect(story).toContain("height=120");
    expect(story).toContain("quality=75");
  });

  it("correctly generates hero image preset", () => {
    const hero = getAthleteHeroImage(supabaseObjectUrl);
    expect(hero).toContain("width=720");
    expect(hero).toContain("quality=78");
  });

  it("correctly generates gallery image preset", () => {
    const gallery = getAthleteGalleryImage(supabaseObjectUrl);
    expect(gallery).toContain("width=600");
    expect(gallery).toContain("height=450");
    expect(gallery).toContain("quality=80");
  });

  it("correctly generates agency logo preset", () => {
    const logo = getAgencyLogoImage(supabaseObjectUrl);
    expect(logo).toContain("width=260");
    expect(logo).toContain("quality=85");
  });

  it("correctly generates catalog hero background preset", () => {
    const bg = getCatalogHeroBackgroundImage(supabaseObjectUrl);
    expect(bg).toContain("width=1280");
    expect(bg).toContain("quality=80");
  });
});
