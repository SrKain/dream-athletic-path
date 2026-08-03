import { z } from "zod";

import type { ProposalBlock, ProposalContent, ProposalLanguage } from "@/types/db";

const rowSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string().optional(),
  amount: z.number().optional(),
  frequency: z.string().optional(),
  timing: z.string().optional(),
  month: z.string().optional(),
  notes: z.string().optional(),
  url: z.string().optional(),
});

const blockTypes = [
  "cover",
  "school",
  "location",
  "team",
  "scholarship",
  "school_costs",
  "general_costs",
  "information",
  "payment",
  "links",
  "closing",
] as const;

export const proposalContentSchema = z.object({
  schemaVersion: z.literal(1),
  currency: z.string().min(3).max(3),
  accent: z.string().optional(),
  blocks: z.array(
    z.object({
      id: z.string(),
      type: z.enum(blockTypes),
      enabled: z.boolean(),
      title: z.string(),
      subtitle: z.string().optional(),
      body: z.string().optional(),
      imageUrl: z.string().optional(),
      logoUrl: z.string().optional(),
      rows: z.array(rowSchema).optional(),
      data: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    }),
  ),
});

const labels = {
  en: [
    "Scholarship Offer",
    "Details",
    "Location",
    "Team history",
    "Scholarship offer explained",
    "Additional costs not covered by the scholarship",
    "Additional costs not covered by the school",
    "Additional information",
    "Payment plan options",
    "Useful links",
    "Your next chapter starts here",
  ],
  pt: [
    "Proposta de bolsa",
    "Detalhes",
    "Localização",
    "Histórico da equipe",
    "Entenda a proposta de bolsa",
    "Custos adicionais não cobertos pela bolsa",
    "Custos adicionais não cobertos pela instituição",
    "Informações adicionais",
    "Opções de pagamento",
    "Links úteis",
    "Seu próximo capítulo começa aqui",
  ],
};

export function createDefaultProposalContent(language: ProposalLanguage = "en"): ProposalContent {
  const titles = labels[language];
  return {
    schemaVersion: 1,
    currency: "USD",
    accent: "#dfff1f",
    blocks: blockTypes.map((type, index) => ({
      id: crypto.randomUUID(),
      type,
      enabled: true,
      title: titles[index],
      rows: [
        "school",
        "team",
        "scholarship",
        "school_costs",
        "general_costs",
        "information",
        "payment",
        "links",
      ].includes(type)
        ? []
        : undefined,
      data: type === "scholarship" ? { totalCost: 0, scholarship: 0, outOfPocket: 0 } : undefined,
    })) as ProposalBlock[],
  };
}

export function parseProposalContent(value: unknown, language: ProposalLanguage = "en") {
  const parsed = proposalContentSchema.safeParse(value);
  return parsed.success ? parsed.data : createDefaultProposalContent(language);
}

export function proposalIsExpired(expiresAt: string | null, now = new Date()) {
  if (!expiresAt) return false;
  const end = new Date(`${expiresAt}T23:59:59`);
  return end.getTime() < now.getTime();
}

export function formatMoney(value: unknown, currency = "USD", language: ProposalLanguage = "en") {
  const amount = typeof value === "number" ? value : Number(value || 0);
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
