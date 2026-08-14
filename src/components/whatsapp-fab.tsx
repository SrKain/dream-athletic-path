import { MessageCircle } from "lucide-react";

import { RECRUIT_WHATSAPP_NUMBER, buildRecruitWhatsappUrl } from "@/lib/contact";

export function WhatsappFab({ athleteName }: { athleteName?: string }) {
  const href = athleteName
    ? buildRecruitWhatsappUrl(athleteName)
    : `https://wa.me/${RECRUIT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
        "Olá! Quero falar com a Go Team Go sobre os atletas do catálogo.",
      )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:bottom-8 md:right-8"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
