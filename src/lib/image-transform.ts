export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  resize?: "cover" | "contain" | "fill";
  format?: "origin";
}

function isSvgUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".svg");
  } catch {
    return url.toLowerCase().split("?")[0].endsWith(".svg");
  }
}

/**
 * Transforms a Supabase Storage public URL into an optimized Supabase Image Transformation URL.
 * If the URL is not from Supabase Storage or is already a transformed URL, returns a safe URL.
 * SVG files are preserved as original vector files since render/image does not support SVG format.
 *
 * Example:
 * Input:  https://[project].supabase.co/storage/v1/object/public/athlete-media/xyz.jpg
 * Output: https://[project].supabase.co/storage/v1/render/image/public/athlete-media/xyz.jpg?width=400&height=533&resize=cover&quality=80
 */
export function getOptimizedImageUrl(
  originalUrl: string | null | undefined,
  options: ImageTransformOptions = {},
): string {
  if (!originalUrl) return "";
  if (isSvgUrl(originalUrl)) return originalUrl;

  // Check if it is a Supabase Storage object public URL
  const objectPublicMarker = "/storage/v1/object/public/";
  const renderPublicMarker = "/storage/v1/render/image/public/";

  let targetUrl = originalUrl;
  if (originalUrl.includes(objectPublicMarker)) {
    targetUrl = originalUrl.replace(objectPublicMarker, renderPublicMarker);
  } else if (!originalUrl.includes(renderPublicMarker)) {
    // Non-Supabase URL (e.g. external unsplash, local asset, data url) - return as is
    return originalUrl;
  }

  try {
    const parsed = new URL(targetUrl);

    if (options.width) {
      parsed.searchParams.set("width", String(Math.round(options.width)));
    }
    if (options.height) {
      parsed.searchParams.set("height", String(Math.round(options.height)));
    }
    if (options.resize) {
      parsed.searchParams.set("resize", options.resize);
    }
    if (options.quality) {
      parsed.searchParams.set("quality", String(Math.round(options.quality)));
    }
    if (options.format) {
      parsed.searchParams.set("format", options.format);
    }

    return parsed.toString();
  } catch {
    return targetUrl;
  }
}

/**
 * Preset: Athlete card photo in catalog (400x533 px, 80% quality, aspect-ratio 3:4 / 4:5)
 * Reduces 1.2MB image down to ~36KB.
 */
export function getAthleteCardImage(url: string | null | undefined): string {
  return getOptimizedImageUrl(url, {
    width: 400,
    height: 533,
    resize: "cover",
    quality: 80,
  });
}

/**
 * Preset: Story avatar in highlights bar (120x120 px, 75% quality)
 * Reduces 1.2MB image down to ~4KB.
 */
export function getAthleteStoryAvatar(url: string | null | undefined): string {
  return getOptimizedImageUrl(url, {
    width: 120,
    height: 120,
    resize: "cover",
    quality: 75,
  });
}

/**
 * Preset: Athlete Profile Hero Image (720px max width, 78% quality)
 * Balanced between high-DPI display crispness and egress bandwidth.
 */
export function getAthleteHeroImage(url: string | null | undefined): string {
  return getOptimizedImageUrl(url, {
    width: 720,
    quality: 78,
  });
}

/**
 * Preset: Gallery / Thumbnail Image (600x450 px, 80% quality)
 */
export function getAthleteGalleryImage(url: string | null | undefined): string {
  return getOptimizedImageUrl(url, {
    width: 600,
    height: 450,
    resize: "cover",
    quality: 80,
  });
}

/**
 * Preset: Agency Branding Logo (260px max width, 85% quality)
 */
export function getAgencyLogoImage(url: string | null | undefined): string {
  return getOptimizedImageUrl(url, {
    width: 260,
    quality: 85,
  });
}

/**
 * Preset: Catalog Hero Background Image (1280px max width, 80% quality)
 */
export function getCatalogHeroBackgroundImage(url: string | null | undefined): string {
  return getOptimizedImageUrl(url, {
    width: 1280,
    quality: 80,
  });
}
