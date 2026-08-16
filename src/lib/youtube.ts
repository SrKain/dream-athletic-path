/**
 * Utilitários para links do YouTube (watch, youtu.be, shorts, live, embed, mobile).
 * Implementa estratégia combinada de Web URL API + regex fallbacks para suportar 100% dos formatos.
 */

export function parseYoutubeId(url?: string | null): string | null {
  if (!url) return null;
  const raw = url.trim();
  if (!raw) return null;

  // Se já for diretamente o ID de 11 caracteres
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  // 1. Tentar parsing via URL API nativa
  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = parsed.hostname.toLowerCase();

    // Formato youtu.be/ID
    if (host.includes("youtu.be")) {
      const pathId = parsed.pathname.replace(/^\/+/, "").split("/")[0]?.split("?")[0]?.split("&")[0];
      if (pathId && /^[a-zA-Z0-9_-]{11}$/.test(pathId)) {
        return pathId;
      }
    }

    // Formato youtube.com/watch?v=ID (e m.youtube.com)
    if (host.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return v;
      }

      // Formato youtube.com/shorts/ID, /embed/ID, /live/ID, /v/ID
      const segments = parsed.pathname.split("/").filter(Boolean);
      const prefixIdx = segments.findIndex((seg) =>
        ["shorts", "embed", "live", "v"].includes(seg.toLowerCase()),
      );
      if (prefixIdx !== -1 && segments[prefixIdx + 1]) {
        const segId = segments[prefixIdx + 1].split("?")[0]?.split("&")[0];
        if (segId && /^[a-zA-Z0-9_-]{11}$/.test(segId)) {
          return segId;
        }
      }
    }
  } catch {
    // URL inválida para construtor nativo, prossegue para os regexes
  }

  // 2. Fallbacks de Regex resilientes
  const patterns: RegExp[] = [
    /[?&]v=([a-zA-Z0-9_-]{11})(?:[&#]|$)/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?&#]|$)/,
    /youtube\.com\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})(?:[?&#]|$)/,
    /youtube\.com\/watch\/([a-zA-Z0-9_-]{11})(?:[?&#]|$)/,
    /([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1] && /^[a-zA-Z0-9_-]{11}$/.test(match[1])) {
      return match[1];
    }
  }

  return null;
}

export function isValidYoutubeUrl(url?: string | null): boolean {
  return parseYoutubeId(url) !== null;
}

export function youtubeThumbnail(url?: string | null): string | null {
  const id = parseYoutubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export const youtubeThumbnailUrl = youtubeThumbnail;

export type EmbedOptions = {
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  start?: number;
  playsinline?: boolean;
};

export function youtubeEmbedUrl(url?: string | null, options: EmbedOptions = {}): string | null {
  const id = parseYoutubeId(url);
  if (!id) return null;

  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
  });

  if (options.controls === false) {
    params.set("controls", "0");
  } else {
    params.set("controls", "1");
  }

  if (options.autoplay) {
    params.set("autoplay", "1");
  }

  if (options.muted) {
    params.set("mute", "1");
  }

  if (options.loop) {
    params.set("loop", "1");
    params.set("playlist", id); // playlist=ID é obrigatório para loop no YouTube embed
  }

  if (options.start) {
    params.set("start", String(options.start));
  }

  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}
