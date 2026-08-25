import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";

import { RECRUIT_WHATSAPP_NUMBER, buildRecruitWhatsappUrl } from "@/lib/contact";

export function WhatsappFab({ athleteName }: { athleteName?: string }) {
  const [isFooterVisible, setIsFooterVisible] = useState(false);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsFooterVisible(Boolean(entry?.isIntersecting));
      },
      {
        threshold: 0.05,
      },
    );

    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  const href = athleteName
    ? buildRecruitWhatsappUrl(athleteName)
    : `https://wa.me/${RECRUIT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
        "Hello! I'd like to talk to Go Team Go Agency about the athletes in the catalog.",
      )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      aria-hidden={isFooterVisible}
      tabIndex={isFooterVisible ? -1 : 0}
      className={`fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-all duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:bottom-8 md:right-8 ${
        isFooterVisible
          ? "pointer-events-none translate-y-4 scale-75 opacity-0"
          : "translate-y-0 scale-100 opacity-100 hover:scale-105"
      }`}
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
