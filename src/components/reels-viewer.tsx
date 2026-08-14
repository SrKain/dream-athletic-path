import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { youtubeEmbedUrl, youtubeThumbnail } from "@/lib/youtube";
import type { AthleteVideo } from "@/types/db";

/** Bolinhas de highlights + player vertical em tela cheia (doom scroll). */
export function ReelsRow({ videos, athleteName }: { videos: AthleteVideo[]; athleteName: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!videos.length) return null;

  return (
    <section className="container-edge py-10">
      <p className="eyebrow text-primary">Highlights</p>
      <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
        {videos.map((video, index) => (
          <button
            key={video.id}
            onClick={() => setOpenIndex(index)}
            className="group shrink-0 text-center"
            aria-label={`Abrir highlight ${video.title ?? index + 1}`}
          >
            <span className="block rounded-full bg-linear-to-tr from-primary to-accent p-[3px] transition group-hover:scale-105">
              <span className="block overflow-hidden rounded-full border-2 border-background">
                <img
                  src={youtubeThumbnail(video.youtube_url) ?? ""}
                  alt=""
                  className="h-20 w-20 object-cover md:h-24 md:w-24"
                  loading="lazy"
                />
              </span>
            </span>
            <span className="mt-2 block max-w-24 truncate text-xs text-muted-foreground">
              {video.title || `Reel ${index + 1}`}
            </span>
          </button>
        ))}
      </div>
      {openIndex !== null && (
        <ReelsOverlay
          videos={videos}
          startIndex={openIndex}
          athleteName={athleteName}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </section>
  );
}

function ReelsOverlay({
  videos,
  startIndex,
  athleteName,
  onClose,
}: {
  videos: AthleteVideo[];
  startIndex: number;
  athleteName: string;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: startIndex * node.clientHeight });
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, startIndex]);

  return (
    <div className="fixed inset-0 z-100 bg-surface/95 backdrop-blur-xl">
      <button
        onClick={onClose}
        aria-label="Fechar highlights"
        className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/20 text-surface-foreground"
      >
        <X className="h-5 w-5" />
      </button>
      <div
        ref={scrollRef}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {videos.map((video, index) => (
          <ReelSlide key={video.id} video={video} athleteName={athleteName} index={index} />
        ))}
      </div>
    </div>
  );
}

function ReelSlide({
  video,
  athleteName,
  index,
}: {
  video: AthleteVideo;
  athleteName: string;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(index === 0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.intersectionRatio > 0.6),
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const embed = youtubeEmbedUrl(video.youtube_url, { autoplay: visible, loop: true, muted: false });

  return (
    <div ref={ref} className="flex h-full snap-start items-center justify-center p-4">
      <div className="relative aspect-[9/16] h-full max-h-[92vh] w-full max-w-[min(100%,52vh)] overflow-hidden rounded-xl bg-black">
        {visible && embed ? (
          <iframe
            src={embed}
            title={video.title ?? `${athleteName} highlight`}
            allow="autoplay; encrypted-media; fullscreen"
            className="h-full w-full border-0"
          />
        ) : (
          <img
            src={youtubeThumbnail(video.youtube_url) ?? ""}
            alt=""
            className="h-full w-full object-cover opacity-60"
          />
        )}
      </div>
    </div>
  );
}
