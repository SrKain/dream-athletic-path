import { createServerFn } from "@tanstack/react-start";

import type { ProposalDecision, PublicProposalPayload } from "@/types/db";

export const getPublicProposal = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => ({ token: String(input.token).slice(0, 96) }))
  .handler(async ({ data }): Promise<PublicProposalPayload | null> => {
    const { getPublicServerClient } = await import("@/lib/supabase/clients.server");
    const client = getPublicServerClient();
    if (!client) return null;
    const { data: payload, error } = await client.rpc("get_public_proposal", {
      _token: data.token,
    });
    if (error) throw new Response(error.message, { status: 400 });
    return (payload ?? null) as PublicProposalPayload | null;
  });

export const respondToProposal = createServerFn({ method: "POST" })
  .validator(
    (input: { token: string; name: string; email: string; decision: ProposalDecision }) => ({
      token: String(input.token).slice(0, 96),
      name: String(input.name).trim().slice(0, 160),
      email: String(input.email).trim().toLowerCase().slice(0, 254),
      decision: input.decision,
    }),
  )
  .handler(async ({ data }) => {
    const { getPublicServerClient } = await import("@/lib/supabase/clients.server");
    const client = getPublicServerClient();
    if (!client) throw new Response("Supabase não configurado", { status: 503 });
    const { data: response, error } = await client.rpc("respond_to_proposal", {
      _token: data.token,
      _name: data.name,
      _email: data.email,
      _decision: data.decision,
    });
    if (error) throw new Response(error.message, { status: 400 });
    return response as { id: string; decision: ProposalDecision; respondedAt: string };
  });
