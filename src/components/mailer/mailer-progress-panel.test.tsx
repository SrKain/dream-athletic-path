import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MailerProgressPanel, type MailerProgressPanelProps } from "./mailer-progress-panel";
import type { CampaignProgress } from "@/types/db";

const progress: CampaignProgress = {
  campaignId: "campaign",
  status: "running",
  subject: "Fixture",
  eligibleCount: 100,
  totalRecipients: 100,
  sentCount: 50,
  acceptedCount: 50,
  failedCount: 40,
  failedPermanentCount: 40,
  unconfirmedCount: 10,
  suppressedCount: 0,
  pendingCount: 0,
  processingCount: 0,
  cancelledCount: 0,
  currentBatch: 1,
  totalBatches: 1,
  batchSize: 100,
  percentComplete: 100,
  nextBatchAt: null,
  startedAt: new Date().toISOString(),
  completedAt: null,
  estimatedRemainingSeconds: null,
  lastError: null,
};
const noop = () => {};
const props: MailerProgressPanelProps = {
  progress,
  bounceStats: null,
  isDryRun: false,
  isOffline: false,
  isTabHidden: false,
  isAnotherTabActive: false,
  isOperatingQueue: false,
  isTriggeringWorker: false,
  cooldownRemainingSec: null,
  lastTickElapsedSec: null,
  statusMessage: null,
  showQueueRecipients: false,
  onToggleQueueRecipients: noop,
  queueStatusFilter: "all",
  onChangeQueueStatusFilter: noop,
  queueRecipients: [],
  queueRecipientsTotal: 0,
  queuePage: 1,
  onChangeQueuePage: noop,
  queueLoading: false,
  onRefreshQueueRecipients: noop,
  onPause: noop,
  onResume: noop,
  onCancel: noop,
  onTriggerWorker: noop,
  onOpenReconcileModal: noop,
  onDismiss: noop,
};
function render(
  update: Partial<CampaignProgress> = {},
  extra: Partial<MailerProgressPanelProps> = {},
) {
  return renderToStaticMarkup(
    <MailerProgressPanel {...props} progress={{ ...progress, ...update }} {...extra} />,
  );
}
describe("TASK-116 faithful UI", () => {
  it("counts only accepted recipients in primary percentage, with separate failure/unknown segments", () => {
    const html = render();
    expect(html).toContain("50%");
    expect(html).toContain("width:40%");
    expect(html).toContain("width:10%");
    expect(html).toContain("aceitos pela Resend");
    expect(html).not.toContain("elegíveis processados");
  });
  it("shows stalled health even though status is running, with resume and cron warning", () => {
    const html = render({
      pendingCount: 100,
      unconfirmedCount: 0,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      controllerLeaseExpiresAt: null,
    });
    expect(html).toContain("Fila parada há");
    expect(html).toContain("Retomar agora");
    expect(html).toContain("Fechar a aba pausa o envio");
    expect(html).not.toContain("Enviando lote");
  });
  it("explains missing webhook events after two minutes instead of presenting 0 percent as evidence", () => {
    const html = render({
      firstAcceptedAt: new Date(Date.now() - 180_000).toISOString(),
      webhookEventCount: 0,
    });
    expect(html).toContain("Sem eventos de webhook — verifique a integração");
    expect(html).not.toContain('text-sky-500">0%');
  });
  it("shows active cron, degradation and never labels completion while pending rows exist", () => {
    const html = render(
      { status: "completed", pendingCount: 1, unconfirmedCount: 0, degraded: true },
      { cronStatus: { enabled: true, active: true, schedule: "15 seconds" } },
    );
    expect(html).toContain("Rede de segurança: ativa");
    expect(html).toContain("Números aproximados");
    expect(html).toContain("Requer reconciliação");
    expect(html).not.toContain("Concluída — tudo aceito");
  });
});
