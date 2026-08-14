/** Utilitários para links do YouTube (watch, youtu.be, shorts, embed). */

export function parseYoutubeId(url?: string | null): string | null {
  if (!url) return null;
  const value = url.trim();
  if (!value) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  const match = value.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

export function isValidYoutubeUrl(url?: string | null) {
  return parseYoutubeId(url) !== null;
}

export function youtubeThumbnail(url?: string | null) {
  const id = parseYoutubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

type EmbedOptions = {
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  start?: number;
};

export function youtubeEmbedUrl(url?: string | null, options: EmbedOptions = {}) {
  const id = parseYoutubeId(url);
  if (!id) return null;
  const params = new URLSearchParams({
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
    controls: options.controls === false ? "0" : "1",
  });
  if (options.autoplay) params.set("autoplay", "1");
  if (options.muted) params.set("mute", "1");
  if (options.loop) {
    params.set("loop", "1");
    params.set("playlist", id);
  }
  if (options.start) params.set("start", String(options.start));
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}
