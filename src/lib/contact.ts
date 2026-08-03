export const RECRUIT_WHATSAPP_NUMBER = "5511996699094";

export function buildRecruitWhatsappUrl(athleteName: string) {
  const message = `Olá! Tenho interesse em recrutar ${athleteName} pela Go Team Go.`;
  return `https://wa.me/${RECRUIT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
