import { useState, useEffect } from "react";
import { getAgencyLogoImage } from "@/lib/image-transform";
import { cn } from "@/lib/utils";

export interface AgencyLogoProps {
  logoUrl?: string | null;
  variant?: "header" | "footer";
  className?: string;
  alt?: string;
  textClassName?: string;
}

/**
 * Unified Agency Brand Logo component with 3-tier fallback:
 * 1. Optimized transformed URL (Supabase render/image with width=400, resize=contain)
 * 2. On error -> Raw original URL (raw Supabase Storage public object)
 * 3. On second error or missing URL -> Fallback typography "Go Team Go"
 */
export function AgencyLogo({
  logoUrl,
  variant = "header",
  className,
  alt = "Go Team Go Agency",
  textClassName,
}: AgencyLogoProps) {
  const cleanUrl = logoUrl?.trim() || null;
  const transformedUrl = cleanUrl ? getAgencyLogoImage(cleanUrl) : null;

  // Track the current source being attempted
  const [currentSrc, setCurrentSrc] = useState<string | null>(transformedUrl);
  const [hasFailed, setHasFailed] = useState<boolean>(!cleanUrl);

  // Sync state if logoUrl changes
  useEffect(() => {
    if (!cleanUrl) {
      setCurrentSrc(null);
      setHasFailed(true);
    } else {
      const nextTransformed = getAgencyLogoImage(cleanUrl);
      setCurrentSrc(nextTransformed);
      setHasFailed(false);
    }
  }, [cleanUrl]);

  const handleError = () => {
    if (cleanUrl && currentSrc && currentSrc !== cleanUrl) {
      // Fallback from transformed URL to raw original URL
      setCurrentSrc(cleanUrl);
    } else {
      // Raw URL failed or already attempted -> switch to text fallback
      setHasFailed(true);
      setCurrentSrc(null);
    }
  };

  const defaultImgClasses =
    variant === "header"
      ? "h-8 md:h-10 w-auto max-w-[200px] object-contain shrink-0"
      : "h-7 w-auto max-w-[180px] object-contain shrink-0";

  const defaultTextClasses =
    variant === "header"
      ? "font-display text-xl md:text-2xl font-bold tracking-tight text-foreground"
      : "font-display text-lg font-bold tracking-tight text-foreground";

  if (hasFailed || !currentSrc) {
    return <span className={cn(defaultTextClasses, textClassName)}>Go Team Go</span>;
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      decoding="async"
      onError={handleError}
      className={cn(defaultImgClasses, className)}
    />
  );
}
