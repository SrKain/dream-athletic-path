export const RECRUIT_WHATSAPP_NUMBER = "5511999239490";

export function buildRecruitWhatsappUrl(athleteName: string) {
  const message = `Hello! I'm interested in recruiting ${athleteName} through Go Team Go Agency. I'd love to learn more about her and discuss her availability and recruiting profile.`;
  return `https://wa.me/${RECRUIT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
