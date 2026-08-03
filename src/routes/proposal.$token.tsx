import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ProposalExperience } from "@/components/proposal-experience";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/admin-ui";
import { getPublicProposal, respondToProposal } from "@/lib/proposals.functions";
import { proposalIsExpired } from "@/lib/proposals";
import type { ProposalDecision } from "@/types/db";

export const Route = createFileRoute("/proposal/$token")({
  loader: async ({ params }) => {
    const result = await getPublicProposal({ data: { token: params.token } });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} · ${loaderData.recipientName}` },
          {
            name: "description",
            content: `Proposta personalizada para ${loaderData.recipientName}.`,
          },
          { name: "robots", content: "noindex,nofollow" },
        ]
      : [],
  }),
  component: PublicProposalPage,
});

function PublicProposalPage() {
  const proposal = Route.useLoaderData();
  const token = Route.useParams().token;
  const router = useRouter();
  const [decision, setDecision] = useState<ProposalDecision | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const expired = proposalIsExpired(proposal.expiresAt);
  const closed =
    proposal.status === "accepted" || proposal.status === "declined" || Boolean(proposal.response);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision) return;
    setSending(true);
    try {
      await respondToProposal({ data: { token, name, email, decision } });
      toast.success(decision === "accepted" ? "Proposta aceita." : "Resposta registrada.");
      setDecision(null);
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível registrar a resposta.",
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <ProposalExperience
      data={proposal}
      footer={
        <section
          id="proposal-end"
          className="border-t border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(223,255,31,.18),transparent_38%),#061b13] px-6 py-24 text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--proposal-accent)]">
            GO TEAM GO
          </p>
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-semibold tracking-[-.04em] md:text-7xl">
            {closed
              ? proposal.status === "accepted"
                ? "Proposta aceita"
                : "Resposta registrada"
              : expired
                ? "Prazo encerrado"
                : proposal.language === "pt"
                  ? "Vamos construir essa história?"
                  : "Ready to write this story?"}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-white/55">
            {closed
              ? `Resposta registrada na versão ${proposal.versionNumber}.`
              : expired
                ? "A proposta continua disponível para consulta, mas não aceita novas respostas."
                : `Confirme sua decisão usando o e-mail ${proposal.recipientEmailHint}.`}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a className={secondaryButtonClass} href={`/proposal/${token}/pdf`}>
              <Download className="mr-2 h-4 w-4" /> Baixar PDF
            </a>
            {!closed && !expired && (
              <>
                <button className={buttonClass} onClick={() => setDecision("accepted")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Aceitar proposta
                </button>
                <button className={secondaryButtonClass} onClick={() => setDecision("declined")}>
                  <XCircle className="mr-2 h-4 w-4" /> Recusar
                </button>
              </>
            )}
          </div>
          {decision && (
            <form
              onSubmit={submit}
              className="mx-auto mt-8 grid max-w-lg gap-3 rounded-xl border border-white/15 bg-white/[.05] p-5 text-left"
            >
              <h3 className="font-display text-xl font-semibold">
                Confirmar {decision === "accepted" ? "aceite" : "recusa"}
              </h3>
              <input
                className={inputClass}
                required
                minLength={2}
                placeholder="Nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className={inputClass}
                required
                type="email"
                placeholder="E-mail do destinatário"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="flex gap-3">
                <button disabled={sending} className={buttonClass}>
                  {sending ? "Registrando..." : "Confirmar"}
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => setDecision(null)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </section>
      }
    />
  );
}
