import { ArrowDown, Check, ExternalLink, MapPin, Sparkles } from "lucide-react";

import { formatMoney, proposalIsExpired } from "@/lib/proposals";
import type { ProposalBlock, ProposalContent, ProposalLanguage, ProposalRow } from "@/types/db";

export type ProposalExperienceData = {
  recipientName: string;
  recipientSport?: string | null;
  recipientPhotoUrl?: string | null;
  title: string;
  language: ProposalLanguage;
  expiresAt?: string | null;
  versionNumber?: number;
  content: ProposalContent;
};

const copy = {
  en: {
    prepared: "Prepared exclusively for",
    valid: "Valid until",
    explore: "Explore the offer",
    total: "Annual cost",
    award: "Scholarship",
    family: "Estimated out-of-pocket",
    empty: "Add content to this section",
  },
  pt: {
    prepared: "Preparada exclusivamente para",
    valid: "Válida até",
    explore: "Conheça a proposta",
    total: "Custo anual",
    award: "Bolsa oferecida",
    family: "Investimento estimado",
    empty: "Adicione conteúdo a esta seção",
  },
};

export function ProposalExperience({
  data,
  compact = false,
  footer,
}: {
  data: ProposalExperienceData;
  compact?: boolean;
  footer?: React.ReactNode;
}) {
  const blocks = data.content.blocks.filter((block) => block.enabled);
  const labels = copy[data.language];
  return (
    <div
      className={`proposal-theme min-h-screen bg-[#061b13] text-[#f4f7e9] ${compact ? "rounded-xl" : ""}`}
      style={{ "--proposal-accent": data.content.accent ?? "#dfff1f" } as React.CSSProperties}
    >
      {!compact && (
        <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#061b13]/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
            <span className="font-display text-sm font-semibold tracking-tight">GO TEAM GO</span>
            <div className="scrollbar-none hidden max-w-[65vw] gap-4 overflow-x-auto text-[10px] font-semibold uppercase tracking-[.16em] text-white/45 md:flex">
              {blocks.slice(1).map((block, index) => (
                <a
                  key={block.id}
                  href={`#proposal-${block.id}`}
                  className="whitespace-nowrap transition hover:text-[var(--proposal-accent)]"
                >
                  {String(index + 1).padStart(2, "0")} {block.title}
                </a>
              ))}
            </div>
          </div>
        </nav>
      )}
      <div className={compact ? "max-h-[78vh] overflow-y-auto" : ""}>
        {blocks.map((block, index) => (
          <ProposalSection
            key={block.id}
            block={block}
            index={index}
            data={data}
            labels={labels}
            compact={compact}
          />
        ))}
        {footer}
      </div>
    </div>
  );
}

function ProposalSection({
  block,
  index,
  data,
  labels,
  compact,
}: {
  block: ProposalBlock;
  index: number;
  data: ProposalExperienceData;
  labels: typeof copy.en;
  compact: boolean;
}) {
  if (block.type === "cover") {
    return (
      <section
        id={`proposal-${block.id}`}
        className={`relative isolate overflow-hidden ${compact ? "min-h-[540px]" : "min-h-[calc(100vh-4rem)]"}`}
      >
        {block.imageUrl || data.recipientPhotoUrl ? (
          <img
            src={block.imageUrl || data.recipientPhotoUrl || ""}
            alt=""
            className="absolute inset-0 -z-20 h-full w-full object-cover opacity-55"
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#061b13_5%,rgba(6,27,19,.88)_42%,rgba(6,27,19,.28)),radial-gradient(circle_at_80%_20%,rgba(223,255,31,.2),transparent_35%)]" />
        <div
          className={`mx-auto flex max-w-7xl flex-col justify-end px-6 ${compact ? "min-h-[540px] py-12" : "min-h-[calc(100vh-4rem)] py-16 md:px-10 md:py-24"}`}
        >
          <div className="max-w-4xl">
            <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-[var(--proposal-accent)]">
              <Sparkles className="h-4 w-4" /> {labels.prepared}
            </p>
            <p className="font-display text-lg text-white/60">{data.recipientSport}</p>
            <h1
              className={`mt-3 font-display font-semibold leading-[.9] tracking-[-.055em] ${compact ? "text-6xl" : "text-[clamp(4rem,10vw,9rem)]"}`}
            >
              {data.recipientName}
            </h1>
            <div className="mt-8 flex flex-wrap items-end gap-6 border-t border-white/20 pt-6">
              <div>
                <p className="text-[10px] uppercase tracking-[.2em] text-white/45">{data.title}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{block.title}</p>
              </div>
              {data.expiresAt && (
                <div className="ml-auto">
                  <p className="text-[10px] uppercase tracking-[.2em] text-white/45">
                    {labels.valid}
                  </p>
                  <p className="mt-1 font-semibold">
                    {new Date(`${data.expiresAt}T12:00:00`).toLocaleDateString(
                      data.language === "pt" ? "pt-BR" : "en-US",
                    )}
                  </p>
                </div>
              )}
              {!compact && (
                <a
                  href={
                    data.content.blocks[1]
                      ? `#proposal-${data.content.blocks[1].id}`
                      : "#proposal-end"
                  }
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--proposal-accent)] text-[#061b13]"
                  aria-label={labels.explore}
                >
                  <ArrowDown />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const isLight = index % 3 === 2;
  return (
    <section
      id={`proposal-${block.id}`}
      className={`border-t border-white/10 ${isLight ? "bg-[#edf0df] text-[#082016]" : "bg-[#061b13]"}`}
    >
      <div className={`mx-auto max-w-7xl px-6 ${compact ? "py-12" : "py-16 md:px-10 md:py-24"}`}>
        <header className="grid gap-5 md:grid-cols-[110px_1fr]">
          <span
            className={`font-display text-sm ${isLight ? "text-[#315442]" : "text-[var(--proposal-accent)]"}`}
          >
            {String(index).padStart(2, "0")}
          </span>
          <div>
            <p
              className={`text-[10px] font-semibold uppercase tracking-[.2em] ${isLight ? "text-[#315442]" : "text-white/40"}`}
            >
              {block.type.replace("_", " ")}
            </p>
            <h2
              className={`mt-3 max-w-4xl font-display font-semibold tracking-[-.04em] ${compact ? "text-4xl" : "text-[clamp(2.8rem,6vw,5.8rem)]"}`}
            >
              {block.title}
            </h2>
            {block.subtitle && (
              <p className="mt-4 max-w-2xl text-lg opacity-65">{block.subtitle}</p>
            )}
          </div>
        </header>
        <div className="mt-10 md:ml-[110px]">
          <BlockBody block={block} data={data} labels={labels} light={isLight} />
        </div>
      </div>
    </section>
  );
}

function BlockBody({
  block,
  data,
  labels,
  light,
}: {
  block: ProposalBlock;
  data: ProposalExperienceData;
  labels: typeof copy.en;
  light: boolean;
}) {
  const rows = block.rows ?? [];
  if (block.type === "scholarship") {
    const total = Number(block.data?.totalCost ?? 0),
      award = Number(block.data?.scholarship ?? 0),
      family = Number(block.data?.outOfPocket ?? total - award);
    return (
      <>
        <div className="grid gap-px overflow-hidden rounded-xl bg-white/15 md:grid-cols-3">
          <Money
            label={labels.total}
            value={formatMoney(total, data.content.currency, data.language)}
            accent={false}
          />
          <Money
            label={labels.award}
            value={formatMoney(award, data.content.currency, data.language)}
            accent
          />
          <Money
            label={labels.family}
            value={formatMoney(family, data.content.currency, data.language)}
            accent
          />
        </div>
        <Rows rows={rows} currency={data.content.currency} language={data.language} light={light} />
      </>
    );
  }
  if (["school_costs", "general_costs"].includes(block.type))
    return (
      <Rows
        rows={rows}
        currency={data.content.currency}
        language={data.language}
        light={light}
        table
      />
    );
  if (block.type === "links")
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <a
            key={row.id}
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className={`group flex items-center justify-between rounded-lg border p-5 transition ${light ? "border-[#173b2b]/20 hover:bg-white" : "border-white/15 hover:border-[var(--proposal-accent)]"}`}
          >
            <span>
              <b className="block">{row.label}</b>
              {row.value && <small className="mt-1 block opacity-55">{row.value}</small>}
            </span>
            <ExternalLink className="h-4 w-4 transition group-hover:-translate-y-1" />
          </a>
        ))}
      </div>
    );
  if (["information", "payment"].includes(block.type))
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <article
            key={row.id}
            className={`rounded-lg border p-5 ${light ? "border-[#173b2b]/15 bg-white/55" : "border-white/12 bg-white/[.035]"}`}
          >
            <Check className="mb-4 h-5 w-5 text-[var(--proposal-accent)]" />
            <h3 className="font-display text-xl font-semibold">{row.label}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed opacity-65">
              {row.notes || row.value}
            </p>
          </article>
        ))}
      </div>
    );
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {block.imageUrl && (
        <img
          src={block.imageUrl}
          alt=""
          className="aspect-[16/10] w-full rounded-xl object-cover"
        />
      )}
      <div>
        <p className="whitespace-pre-line text-lg leading-relaxed opacity-70">
          {block.body || labels.empty}
        </p>
        {block.logoUrl && (
          <img src={block.logoUrl} alt="" className="mt-8 max-h-24 max-w-48 object-contain" />
        )}
        {block.type === "location" && (
          <MapPin className="mt-8 h-8 w-8 text-[var(--proposal-accent)]" />
        )}
        <Rows rows={rows} currency={data.content.currency} language={data.language} light={light} />
      </div>
    </div>
  );
}

function Rows({
  rows,
  currency,
  language,
  light,
  table = false,
}: {
  rows: ProposalRow[];
  currency: string;
  language: ProposalLanguage;
  light: boolean;
  table?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <div
      className={`mt-8 overflow-hidden rounded-lg border ${light ? "border-[#173b2b]/15" : "border-white/12"}`}
    >
      {rows.map((row, index) => (
        <div
          key={row.id}
          className={`grid gap-2 border-b p-4 last:border-0 ${table ? "md:grid-cols-[1.2fr_.6fr_.6fr_1.6fr]" : "grid-cols-[1fr_auto]"} ${light ? "border-[#173b2b]/10" : "border-white/10"}`}
        >
          <b className="text-sm">{row.label}</b>
          {table && <span className="text-sm opacity-55">{row.frequency}</span>}
          {table && (
            <span className="text-sm font-semibold">
              {row.amount !== undefined ? formatMoney(row.amount, currency, language) : row.value}
            </span>
          )}
          <span className={`text-sm opacity-60 ${table ? "" : "text-right"}`}>
            {table
              ? row.notes || row.timing
              : row.amount !== undefined
                ? formatMoney(row.amount, currency, language)
                : row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Money({ label, value, accent }: { label: string; value: string; accent: boolean }) {
  return (
    <div
      className={`p-6 md:p-8 ${accent ? "bg-[var(--proposal-accent)] text-[#061b13]" : "bg-white/[.04]"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[.18em] opacity-55">{label}</p>
      <p className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">{value}</p>
    </div>
  );
}
