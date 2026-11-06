import { getAdminClient } from "@/lib/supabase/clients.server";
import type { MailerCronStatus } from "@/types/db";
import { getCampaignProgressV2, runCampaignTick } from "./mailer-engine-v2.server";

export async function controlCampaignV2(
  campaignId: string,
  action: "pause" | "resume" | "cancel",
  customAdmin = getAdminClient(),
) {
  const res = await customAdmin.rpc("mailer_control_campaign", {
    p_campaign_id: campaignId,
    p_action: action,
  });
  if (res.error) return { success: false, message: res.error.message };
  return res.data as { success: boolean; message: string };
}

export async function getLatestActiveCampaignV2(customAdmin = getAdminClient()) {
  const res = await customAdmin
    .from("mailer_campaigns")
    .select("id")
    .in("status", ["running", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data ? getCampaignProgressV2(res.data.id, customAdmin) : null;
}

export async function getMailerCronStatus(
  customAdmin = getAdminClient(),
): Promise<MailerCronStatus> {
  const enabled =
    process.env.MAILER_CRON_ENABLED?.trim().toLowerCase() === "true" &&
    Boolean(process.env.MAILER_CRON_SECRET?.trim());
  const res = await customAdmin.rpc("mailer_cron_status");
  if (res.error) return { enabled: false, active: false, schedule: null, error: res.error.message };
  const status = res.data as MailerCronStatus;
  return { ...status, enabled: enabled && status.enabled && status.active };
}

export async function syncCampaignV2(campaignId: string, customAdmin = getAdminClient()) {
  const base = {
    requiresReconciliation: false,
    unconfirmedCount: 0,
    unconfirmedRecipients: [] as import("./mailer-queue.server").UnconfirmedRecipientSummary[],
  };
  const res = await customAdmin.rpc("mailer_sync_lease", { p_campaign_id: campaignId });
  if (res.error) return { ...base, success: false, message: res.error.message };
  const lease = res.data as { active: boolean; controllerId?: string; expiresAt?: string };
  if (lease.active)
    return {
      ...base,
      success: true,
      message: `Outro executor ativo: ${lease.controllerId}, até ${lease.expiresAt}. Acompanhando.`,
    };
  const tick = await runCampaignTick(campaignId, { customAdmin });
  return {
    ...base,
    success: tick.success,
    requiresReconciliation: (tick.progress?.unconfirmedCount || 0) > 0,
    unconfirmedCount: tick.progress?.unconfirmedCount || 0,
    message: tick.message || "Tick executado.",
  };
}
