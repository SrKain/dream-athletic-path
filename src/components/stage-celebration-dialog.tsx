import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";

import { fireConfetti } from "@/components/confetti-celebration";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function StageCelebrationDialog({
  open,
  title,
  message,
  images,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  images: string[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    // Confetti renders behind the dialog overlay (Radix uses z-50).
    return fireConfetti({ duration: 3000, zIndex: 40 });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl">
            <PartyPopper className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {images.length > 0 && <ImageSlider images={images} />}

        <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {message}
        </p>

        <Button className="mt-2 w-full" onClick={onClose}>
          Continuar
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function ImageSlider({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);
  const total = images.length;
  const go = (delta: number) => setIndex((prev) => (prev + delta + total) % total);

  return (
    <div className="relative overflow-hidden rounded-xl bg-muted">
      <img
        src={images[index]}
        alt=""
        className="aspect-[16/9] w-full object-cover transition-opacity duration-300"
      />
      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="Imagem anterior"
            onClick={() => go(-1)}
            className="absolute top-1/2 left-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground shadow"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Próxima imagem"
            onClick={() => go(1)}
            className="absolute top-1/2 right-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground shadow"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {images.map((image, position) => (
              <button
                key={image}
                type="button"
                aria-label={`Ir para imagem ${position + 1}`}
                onClick={() => setIndex(position)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  position === index ? "w-5 bg-primary" : "w-1.5 bg-background/70",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}