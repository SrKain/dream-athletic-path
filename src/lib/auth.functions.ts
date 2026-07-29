import { createServerFn } from "@tanstack/react-start";

import { requireAgency, requireAuth } from "@/lib/supabase/auth-middleware";

export const inviteAthlete = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((input: { athleteId: string; email: string }) => ({
    athleteId: String(input.athleteId),
    email: String(input.email).trim().toLowerCase(),
  }))
  .handler(async ({ data, context }) => {
    const { getAdminClient } = await import("@/lib/supabase/clients.server");
    const admin = getAdminClient();
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const { data: athlete } = await admin
      .from("athletes")
      .select("id,agency_id,full_name")
      .eq("id", data.athleteId)
      .maybeSingle();
    if (!athlete) throw new Response("Atleta não encontrado", { status: 404 });

    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: `${appUrl}/auth/accept-invite`,
      data: { athlete_id: athlete.id, full_name: athlete.full_name },
    });
    if (error) throw new Response(error.message, { status: 400 });

    await admin.from("invitations").insert({
      agency_id: athlete.agency_id,
      athlete_id: athlete.id,
      email: data.email,
      role: "athlete",
      auth_user_id: invited.user?.id ?? null,
      invited_by: context.userId,
    });
    return { success: true };
  });

export const finalizeAthleteInvite = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    if (!context.email) throw new Response("E-mail ausente", { status: 400 });
    const { getAdminClient } = await import("@/lib/supabase/clients.server");
    const admin = getAdminClient();
    const { data: invitation } = await admin
      .from("invitations")
      .select("id,athlete_id,email,expires_at,accepted_at,revoked_at")
      .eq("email", context.email.toLowerCase())
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!invitation || !invitation.athlete_id) {
      throw new Response("Convite não encontrado", { status: 404 });
    }
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      throw new Response("Convite expirado", { status: 410 });
    }

    const { data: athlete } = await admin
      .from("athletes")
      .select("user_id,email")
      .eq("id", invitation.athlete_id)
      .single();
    if (athlete.user_id && athlete.user_id !== context.userId) {
      throw new Response("Convite já utilizado", { status: 409 });
    }

    const { error } = await admin
      .from("athletes")
      .update({ user_id: context.userId, email: context.email })
      .eq("id", invitation.athlete_id);
    if (error) throw new Response(error.message, { status: 400 });

    await admin.from("user_roles").upsert(
      { user_id: context.userId, role: "athlete" },
      { onConflict: "user_id,role" },
    );
    await admin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString(), auth_user_id: context.userId })
      .eq("id", invitation.id);
    return { success: true };
  });
