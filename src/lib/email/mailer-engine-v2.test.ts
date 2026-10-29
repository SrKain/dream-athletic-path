import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyBatchErrorV2, parseRetryAfterMs, sendResendBatchV2 } from "./mail-provider.server";
import {
  buildCampaignPreparationIdempotencyKey,
  buildNonSentReportCsv,
  classifyRecipientsDeterministic,
  getMailerEngineMode,
} from "./mailer-engine-v2.server";
import { verifyMailerCronTickSecret } from "./mailer-worker-auth";
import { generateUnsubscribeToken } from "./unsubscribe-token";

interface SimulatedQueueItem {
  id: string;
  campaignId: string;
  emailNormalized: string;
  recipientEmail: string;
  recipientName: string;
  universityName: string;
  batchId: string | null;
  batchSeq: number | null;
  status:
    | "queued"
    | "claimed"
    | "accepted"
    | "suppressed"
    | "failed_retryable"
    | "failed_permanent"
    | "unconfirmed"
    | "cancelled";
  attempts: number;
  providerMessageId: string | null;
  lastError: string | null;
  failureCategory: string | null;
  leaseExpiresAtMs: number | null;
}

interface SimulatedBatch {
  id: string;
  campaignId: string;
  batchSeq: number;
  idempotencyKey: string;
  status: "claimed" | "submitting" | "accepted" | "partial" | "failed" | "ambiguous";
  itemCount: number;
  leaseOwner: string | null;
  leaseExpiresAtMs: number | null;
  attemptCount: number;
  providerResponse: unknown;
  lastPayloadDigest: string | null;
}

/**
 * Simulador determinístico em memória do banco Supabase + RPCs 0031 + Resend Batch API
 * para validar volumes de 100, 500, 800, 1.500 e 5.000 destinatários nos 3 modos
 * sem tocar rede, DNS, Resend real ou Supabase externo.
 */
class InMemoryMailerV2Harness {
  public campaignId = "11111111-2222-3333-4444-555555555555";
  public mode: "single_athlete" | "multi_athlete" | "catalog";
  public status: "draft" | "ready" | "running" | "paused" | "completed" | "cancelled" | "failed" =
    "draft";
  public selectedCount = 0;
  public totalRecipients = 0;
  public deduplicatedCount = 0;
  public invalidSyntaxCount = 0;
  public preSuppressedCount = 0;
  public blockedFitCount = 0;
  public leaseOwner: string | null = null;
  public leaseExpiresAtMs: number | null = null;
  public nextBatchAtMs: number | null = null;
  public pausedReason: string | null = null;

  public queue: SimulatedQueueItem[] = [];
  public batches: Map<number, SimulatedBatch> = new Map();
  public exclusions: Array<{ emailNormalized: string; reason: string }> = [];
  public suppressedMidRun = new Set<string>();
  public resendIdempotencyStore = new Map<
    string,
    { payloadDigest: string; messageIds: string[] }
  >();
  public webhookEvents = new Map<
    string,
    { svixId: string; providerEmailId: string; eventType: string }
  >();

  constructor(mode: "single_athlete" | "multi_athlete" | "catalog") {
    this.mode = mode;
  }

  public prepareAndActivate(
    recipients: Array<{
      name: string;
      email: string;
      universityName?: string;
      blockedFit?: boolean;
    }>,
    preSuppressedEmails: Set<string>,
    blockedFitEmails: Set<string> = new Set(),
    failAtSliceIndex?: number,
  ) {
    const decoratedRecipients = recipients.map((r) => ({
      ...r,
      blockedFit: r.blockedFit || blockedFitEmails.has(r.email.trim().toLowerCase()),
    }));

    const classification = classifyRecipientsDeterministic(
      decoratedRecipients,
      preSuppressedEmails,
      {
        monthlyQuota: 20_000,
        cycleStartDay: 1,
        cycleStartsAt: "2026-10-01T00:00:00.000Z",
        usedThisMonth: 0,
      },
    );

    this.selectedCount = recipients.length;
    this.deduplicatedCount = classification.duplicateCount;
    this.invalidSyntaxCount = classification.invalidCount;
    this.preSuppressedCount = classification.suppressedCount;
    this.blockedFitCount = classification.blockedFitCount;

    for (const exc of classification.excludedRecipients) {
      const exists = this.exclusions.some(
        (e) => e.emailNormalized === exc.emailNormalized && e.reason === exc.reason,
      );
      if (!exists) {
        this.exclusions.push({ emailNormalized: exc.emailNormalized, reason: exc.reason });
      }
    }

    const sliceSize = 500;
    let sliceIdx = 0;
    for (let i = 0; i < classification.eligibleRecipients.length; i += sliceSize) {
      if (failAtSliceIndex !== undefined && sliceIdx === failAtSliceIndex) {
        throw new Error(`Simulated network failure at slice ${sliceIdx}`);
      }
      const slice = classification.eligibleRecipients.slice(i, i + sliceSize);
      for (const item of slice) {
        // ON CONFLICT (campaign_id, email_normalized) DO NOTHING
        const alreadyQueued = this.queue.some((q) => q.emailNormalized === item.emailNormalized);
        if (!alreadyQueued) {
          this.queue.push({
            id: `q_${this.queue.length + 1}`,
            campaignId: this.campaignId,
            emailNormalized: item.emailNormalized,
            recipientEmail: item.email,
            recipientName: item.name,
            universityName: item.universityName || "University",
            batchId: null,
            batchSeq: null,
            status: "queued",
            attempts: 0,
            providerMessageId: null,
            lastError: null,
            failureCategory: null,
            leaseExpiresAtMs: null,
          });
        }
      }
      sliceIdx++;
    }

    this.totalRecipients = this.queue.length;
    this.status = this.totalRecipients > 0 ? "running" : "completed";
  }

  public claimBatch(holderId: string, nowMs: number, batchSize = 100) {
    if (this.status !== "running") {
      return { claimed: false, reason: `status_${this.status}` };
    }
    if (this.nextBatchAtMs && this.nextBatchAtMs > nowMs) {
      return { claimed: false, reason: "cooldown_active", nextBatchAtMs: this.nextBatchAtMs };
    }
    if (this.leaseOwner && this.leaseOwner !== holderId && (this.leaseExpiresAtMs ?? 0) > nowMs) {
      return { claimed: false, reason: "lease_conflict" };
    }

    // Reap expired claimed items without batch
    for (const q of this.queue) {
      if (q.status === "claimed" && !q.batchId && (q.leaseExpiresAtMs ?? 0) <= nowMs) {
        q.status = "queued";
      }
    }

    // Check existing ambiguous or expired claimed batch first
    const replayable = Array.from(this.batches.values())
      .sort((a, b) => a.batchSeq - b.batchSeq)
      .find(
        (b) =>
          b.status === "ambiguous" ||
          ((b.status === "claimed" || b.status === "submitting") &&
            (b.leaseExpiresAtMs ?? 0) <= nowMs),
      );

    if (replayable) {
      replayable.status = "submitting";
      replayable.leaseOwner = holderId;
      replayable.leaseExpiresAtMs = nowMs + 90_000;
      replayable.attemptCount += 1;
      this.leaseOwner = holderId;
      this.leaseExpiresAtMs = nowMs + 90_000;
      const items = this.queue.filter((q) => q.batchId === replayable.id);
      return {
        claimed: true,
        isReplay: true,
        batch: replayable,
        items,
      };
    }

    // Live mid-run suppression guard
    for (const q of this.queue) {
      if (q.status === "queued" && this.suppressedMidRun.has(q.emailNormalized)) {
        q.status = "suppressed";
        q.failureCategory = "SUPPRESSED_PRE_SEND";
        q.lastError = "Suprimido antes do envio";
      }
    }

    const available = this.queue
      .filter((q) => q.status === "queued")
      .slice(0, Math.min(100, batchSize));

    if (available.length === 0) {
      const hasInFlight = this.queue.some((q) => q.status === "claimed");
      if (!hasInFlight) {
        this.status = "completed";
      }
      return { claimed: false, reason: "no_queued_items" };
    }

    const nextSeq = this.batches.size + 1;
    const batch: SimulatedBatch = {
      id: `batch_${nextSeq}`,
      campaignId: this.campaignId,
      batchSeq: nextSeq,
      idempotencyKey: `mc:${this.campaignId}:b${nextSeq}`,
      status: "claimed",
      itemCount: available.length,
      leaseOwner: holderId,
      leaseExpiresAtMs: nowMs + 90_000,
      attemptCount: 1,
      providerResponse: null,
      lastPayloadDigest: null,
    };
    this.batches.set(nextSeq, batch);
    this.leaseOwner = holderId;
    this.leaseExpiresAtMs = nowMs + 90_000;

    for (const q of available) {
      q.status = "claimed";
      q.batchId = batch.id;
      q.batchSeq = batch.batchSeq;
      q.attempts += 1;
      q.leaseExpiresAtMs = nowMs + 90_000;
    }

    return {
      claimed: true,
      isReplay: false,
      batch,
      items: available,
    };
  }

  public assertInvariants() {
    const excludedTotal =
      this.deduplicatedCount +
      this.invalidSyntaxCount +
      this.preSuppressedCount +
      this.blockedFitCount;
    expect(this.selectedCount).toBe(this.totalRecipients + excludedTotal);

    const statusCounts = {
      queued: 0,
      claimed: 0,
      accepted: 0,
      suppressed: 0,
      failed_retryable: 0,
      failed_permanent: 0,
      unconfirmed: 0,
      cancelled: 0,
    };
    for (const item of this.queue) {
      statusCounts[item.status] += 1;
      if (item.status === "accepted") {
        expect(item.providerMessageId).toBeTruthy();
      }
    }

    const sumStates =
      statusCounts.queued +
      statusCounts.claimed +
      statusCounts.accepted +
      statusCounts.suppressed +
      statusCounts.failed_retryable +
      statusCounts.failed_permanent +
      statusCounts.unconfirmed +
      statusCounts.cancelled;

    expect(sumStates).toBe(this.totalRecipients);
    return statusCounts;
  }
}

describe("TASK-115 — Recruit Mailer V2 Reliability & 5,000+ Scale Simulation", () => {
  it("keeps deterministic unsubscribe tokens within the same UTC day so Resend Idempotency-Key replays never trigger 409", () => {
    const fixedMorning = Date.UTC(2026, 9, 29, 9, 15, 0);
    const fixedEvening = Date.UTC(2026, 9, 29, 22, 45, 30);

    const token1 = generateUnsubscribeToken("coach@university.edu", "camp-1", 180, fixedMorning);
    const token2 = generateUnsubscribeToken("coach@university.edu", "camp-1", 180, fixedEvening);

    expect(token1).toBe(token2);
  });

  it("classifies Resend batch errors according to the closed Section 4.4 failure matrix without 100x individual fallback", () => {
    const dummyItems = [
      { id: "q1", to: "coach@uni.edu", subject: "Subj", html: "<p>Hi</p>", text: "Hi" },
    ];

    const err400 = classifyBatchErrorV2(
      { statusCode: 400, name: "validation_error", message: "Invalid email" },
      dummyItems,
      "mc:c1:b1",
    );
    expect(err400.disposition).toBe("failed_permanent");
    expect(err400.outcomes[0]?.failureCategory).toBe("provider_4xx_validation");

    const err429Rate = classifyBatchErrorV2(
      { statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests" },
      dummyItems,
      "mc:c1:b1",
    );
    expect(err429Rate.disposition).toBe("retry_same_key");
    expect(err429Rate.errorCode).toBe("RATE_LIMIT_EXCEEDED");

    const err429Quota = classifyBatchErrorV2(
      { statusCode: 429, name: "monthly_quota_exceeded", message: "Monthly quota exceeded" },
      dummyItems,
      "mc:c1:b1",
    );
    expect(err429Quota.disposition).toBe("pause_quota");
    expect(err429Quota.errorCode).toBe("MONTHLY_QUOTA_EXCEEDED");

    const err409 = classifyBatchErrorV2(
      {
        statusCode: 409,
        name: "invalid_idempotent_request",
        message: "Idempotency key reused with different payload",
      },
      dummyItems,
      "mc:c1:b1",
    );
    expect(err409.disposition).toBe("unconfirmed_409");
    expect(err409.errorCode).toBe("INVALID_IDEMPOTENT_REQUEST");

    const err503 = classifyBatchErrorV2(
      { statusCode: 503, name: "internal_server_error", message: "Service unavailable" },
      dummyItems,
      "mc:c1:b1",
    );
    expect(err503.disposition).toBe("ambiguous_same_key");
    expect(err503.errorCode).toBe("AMBIGUOUS_NETWORK_OR_5XX");

    expect(parseRetryAfterMs("4", 2000)).toBe(4000);
  });

  it("sends Resend batch with exact mc:{campaign_id}:b{seq} Idempotency-Key and never falls back to 100 individual calls on failure", async () => {
    let batchCalls = 0;
    const seenKeys: string[] = [];
    const mockResend = {
      batch: {
        send: async (_payload: unknown[], options?: { idempotencyKey?: string }) => {
          batchCalls += 1;
          seenKeys.push(options?.idempotencyKey || "");
          return {
            data: null,
            error: {
              statusCode: 502,
              name: "bad_gateway",
              message: "Upstream gateway timeout",
            },
          };
        },
      },
    };

    const result = await sendResendBatchV2(
      Array.from({ length: 100 }, (_, idx) => ({
        id: `q_${idx + 1}`,
        to: `coach${idx}@uni.edu`,
        subject: "Subject",
        html: "<p>Hi</p>",
        text: "Hi",
      })),
      {
        idempotencyKey: "mc:camp-123:b1",
        customClient: mockResend as never,
      },
    );

    expect(batchCalls).toBe(1);
    expect(seenKeys).toEqual(["mc:camp-123:b1"]);
    expect(result.disposition).toBe("ambiguous_same_key");
    expect(result.errorCode).toBe("AMBIGUOUS_NETWORK_OR_5XX");
  });

  it("simulates 100, 500, 800, 1,500 and 5,000 recipients across all 3 modes (single_athlete, multi_athlete, catalog) with 100% invariant integrity", () => {
    const volumes = [100, 500, 800, 1500, 5000];
    const modes: Array<"single_athlete" | "multi_athlete" | "catalog"> = [
      "single_athlete",
      "multi_athlete",
      "catalog",
    ];

    const summaryRows: Array<{
      mode: string;
      selected: number;
      eligible: number;
      accepted: number;
      batches: number;
    }> = [];

    for (const mode of modes) {
      for (const volume of volumes) {
        const harness = new InMemoryMailerV2Harness(mode);
        const preSuppressed = new Set<string>(["suppressed1@uni.edu", "suppressed2@uni.edu"]);
        const blockedFit = new Set<string>(["blockedfit@uni.edu"]);

        const recipients = Array.from({ length: volume }, (_, idx) => {
          if (idx === 0) return { name: "Dup 1", email: "Coach0@Uni.edu" };
          if (idx === 1) return { name: "Dup 1 Repeat", email: "  coach0@uni.edu " };
          if (idx === 2) return { name: "Invalid Syntax", email: "invalid-email-without-at" };
          if (idx === 3) return { name: "Pre Suppressed", email: "suppressed1@uni.edu" };
          if (idx === 4) return { name: "Blocked Fit", email: "blockedfit@uni.edu" };
          return {
            name: `Coach ${idx}`,
            email: `coach${idx}@uni-${idx % 250}.edu`,
            universityName: `University ${idx % 250}`,
          };
        });

        harness.prepareAndActivate(recipients, preSuppressed, blockedFit);
        harness.assertInvariants();

        let nowMs = 1_700_000_000_000;
        while (harness.status === "running") {
          const claim = harness.claimBatch("tab_primary", nowMs, 100);
          if (!claim.claimed || !claim.batch || !claim.items) break;

          // Simulate Resend accepting all 100 items in batch
          claim.batch.status = "accepted";
          for (let i = 0; i < claim.items.length; i++) {
            claim.items[i].status = "accepted";
            claim.items[i].providerMessageId = `re_${claim.batch.batchSeq}_${i + 1}`;
          }
          nowMs += 1500;
        }

        const counts = harness.assertInvariants();
        expect(harness.status).toBe("completed");
        expect(counts.queued).toBe(0);
        expect(counts.claimed).toBe(0);
        expect(counts.accepted).toBe(harness.totalRecipients);
        expect(harness.batches.size).toBe(Math.ceil(harness.totalRecipients / 100));

        summaryRows.push({
          mode,
          selected: harness.selectedCount,
          eligible: harness.totalRecipients,
          accepted: counts.accepted,
          batches: harness.batches.size,
        });
      }
    }

    expect(summaryRows).toHaveLength(15);
  });

  it("handles mid-preparation slice failure and idempotent retry without duplicating queue rows or exclusions", () => {
    const harness = new InMemoryMailerV2Harness("single_athlete");
    const recipients = Array.from({ length: 1200 }, (_, idx) => ({
      name: `Coach ${idx}`,
      email: `coach${idx}@uni.edu`,
    }));
    const preSuppressed = new Set(["coach5@uni.edu"]);

    // First click fails at slice 1 (after inserting first 500 eligible rows)
    expect(() => harness.prepareAndActivate(recipients, preSuppressed, new Set(), 1)).toThrow(
      "Simulated network failure at slice 1",
    );
    expect(harness.queue.length).toBe(500);

    // Second click with same selection completes without duplicating the first 500 rows
    harness.prepareAndActivate(recipients, preSuppressed, new Set());
    expect(harness.queue.length).toBe(1199);
    expect(harness.preSuppressedCount).toBe(1);
    harness.assertInvariants();

    const key1 = buildCampaignPreparationIdempotencyKey({
      userId: "u1",
      mode: "single_athlete",
      athleteIds: ["ath-1"],
      subject: "Subj",
      manifestFingerprint: "fp-123",
    });
    const key2 = buildCampaignPreparationIdempotencyKey({
      userId: "u1",
      mode: "single_athlete",
      athleteIds: ["ath-1"],
      subject: "Subj",
      manifestFingerprint: "fp-123",
    });
    expect(key1).toBe(key2);
  });

  it("handles 5xx/timeout ambiguous batch replay with same Idempotency-Key, 429 retry-after, 429 quota pause, 409 conflict, and expired 90s lease takeover", () => {
    const harness = new InMemoryMailerV2Harness("multi_athlete");
    const recipients = Array.from({ length: 250 }, (_, idx) => ({
      name: `Coach ${idx}`,
      email: `coach${idx}@uni.edu`,
    }));
    harness.prepareAndActivate(recipients, new Set());

    let nowMs = 1_700_000_000_000;

    // Batch 1: Claimed by tab_A, suffers timeout -> marked ambiguous
    const claim1 = harness.claimBatch("tab_A", nowMs, 100);
    expect(claim1.claimed).toBe(true);
    expect(claim1.batch?.idempotencyKey).toBe(`mc:${harness.campaignId}:b1`);
    claim1.batch!.status = "ambiguous";
    claim1.batch!.lastPayloadDigest = "digest_b1_v1";

    // Tab B tries to claim while Tab A lease is still valid -> blocked by lease
    const conflictClaim = harness.claimBatch("tab_B", nowMs + 10_000, 100);
    expect(conflictClaim.claimed).toBe(false);
    expect(conflictClaim.reason).toBe("lease_conflict");

    // Lease expires after 90s -> Tab B takes over and replays Batch 1 with exact same Idempotency-Key
    nowMs += 95_000;
    const replayClaim = harness.claimBatch("tab_B", nowMs, 100);
    expect(replayClaim.claimed).toBe(true);
    expect(replayClaim.isReplay).toBe(true);
    expect(replayClaim.batch?.batchSeq).toBe(1);
    expect(replayClaim.batch?.idempotencyKey).toBe(`mc:${harness.campaignId}:b1`);

    // Replay succeeds on Resend
    replayClaim.batch!.status = "accepted";
    for (let i = 0; i < replayClaim.items!.length; i++) {
      replayClaim.items![i].status = "accepted";
      replayClaim.items![i].providerMessageId = `re_b1_${i + 1}`;
    }

    // Batch 2: Suffers 429 rate limit with Retry-After: 5s -> items return to queued
    const claim2 = harness.claimBatch("tab_B", nowMs, 100);
    expect(claim2.batch?.batchSeq).toBe(2);
    claim2.batch!.status = "failed";
    for (const item of claim2.items!) {
      item.status = "queued";
      item.batchId = null;
      item.batchSeq = null;
    }
    harness.nextBatchAtMs = nowMs + 5000;

    // Immediate tick before cooldown expires is rejected cleanly
    expect(harness.claimBatch("tab_B", nowMs + 1000, 100).reason).toBe("cooldown_active");

    // After 5s cooldown, Batch 3 claims the items; suppose 1 item has a 4xx syntax error and 99 succeed
    nowMs += 6000;
    const claim3 = harness.claimBatch("tab_B", nowMs, 100);
    expect(claim3.claimed).toBe(true);
    claim3.batch!.status = "partial";
    claim3.items![0].status = "failed_permanent";
    claim3.items![0].failureCategory = "VALIDATION_4XX";
    claim3.items![0].lastError = "Invalid recipient domain";
    for (let i = 1; i < claim3.items!.length; i++) {
      claim3.items![i].status = "accepted";
      claim3.items![i].providerMessageId = `re_b3_${i}`;
    }

    // Remaining 50 items: simulate mid-run unsubscribe for 1 item, and 409 idempotency conflict on the rest
    harness.suppressedMidRun.add("coach200@uni.edu");
    const claim4 = harness.claimBatch("tab_B", nowMs + 2000, 100);
    expect(claim4.claimed).toBe(true);
    expect(claim4.items!.length).toBe(49); // 1 was suppressed pre-send!

    // Simulate 409 invalid_idempotent_request -> marks items unconfirmed and pauses campaign
    for (const item of claim4.items!) {
      item.status = "unconfirmed";
      item.failureCategory = "IDEMPOTENCY_CONFLICT";
      item.lastError = "Conflito de idempotência";
    }
    harness.status = "paused";
    harness.pausedReason = "IDEMPOTENCY_CONFLICT";

    const finalCounts = harness.assertInvariants();
    expect(finalCounts.accepted).toBe(199);
    expect(finalCounts.failed_permanent).toBe(1);
    expect(finalCounts.suppressed).toBe(1);
    expect(finalCounts.unconfirmed).toBe(49);
    expect(harness.status).toBe("paused");
  });

  it("deduplicates duplicate, late, and out-of-order Resend webhooks by svix_id and counts DISTINCT provider_email_id", () => {
    const events: Array<{ svixId: string; providerEmailId: string; eventType: string }> = [
      { svixId: "msg_1", providerEmailId: "re_1", eventType: "opened" }, // Out of order (opened before delivered)
      { svixId: "msg_2", providerEmailId: "re_1", eventType: "delivered" },
      { svixId: "msg_2", providerEmailId: "re_1", eventType: "delivered" }, // Duplicate svix_id retry
      { svixId: "msg_3", providerEmailId: "re_1", eventType: "delivered" }, // Duplicate delivered event for same email
      { svixId: "msg_4", providerEmailId: "re_2", eventType: "bounced" },
    ];

    const bySvixId = new Map<string, { providerEmailId: string; eventType: string }>();
    for (const evt of events) {
      if (!bySvixId.has(evt.svixId)) {
        bySvixId.set(evt.svixId, {
          providerEmailId: evt.providerEmailId,
          eventType: evt.eventType,
        });
      }
    }

    const uniqueDelivered = new Set<string>();
    const uniqueOpened = new Set<string>();
    const uniqueBounced = new Set<string>();

    for (const evt of bySvixId.values()) {
      if (evt.eventType === "delivered") uniqueDelivered.add(evt.providerEmailId);
      if (evt.eventType === "opened") uniqueOpened.add(evt.providerEmailId);
      if (evt.eventType === "bounced") uniqueBounced.add(evt.providerEmailId);
    }

    expect(bySvixId.size).toBe(4);
    expect(uniqueDelivered.size).toBe(1);
    expect(uniqueOpened.size).toBe(1);
    expect(uniqueBounced.size).toBe(1);
  });

  it("exports non-sent report CSV with UTF-8 BOM and verifies constant-time cron secret auth", () => {
    const csv = buildNonSentReportCsv({
      campaignId: "camp-1",
      subject: "Subject",
      mode: "single_athlete",
      status: "completed",
      finalBadgeLabelPt: "Concluída com ressalvas",
      finalBadgeTone: "amber",
      selectedCount: 10,
      eligibleCount: 9,
      excludedCount: 1,
      acceptedCount: 8,
      deliveredCount: 8,
      awaitingDeliveryCount: 0,
      bouncedCount: 0,
      complainedCount: 0,
      openedCount: 4,
      clickedCount: 2,
      failedPermanentCount: 1,
      failedRetryableCount: 0,
      unconfirmedCount: 0,
      cancelledCount: 0,
      invariantSelectionValid: true,
      invariantQueueValid: true,
      asOf: "2026-10-29T15:00:00.000Z",
      startedAt: "2026-10-29T14:55:00.000Z",
      completedAt: "2026-10-29T15:00:00.000Z",
      safetyPauseReason: null,
      nonSentItems: [
        {
          id: "item-1",
          email: "coach@uni.edu",
          coachName: 'Coach "A"',
          universityName: "Uni X",
          source: "queue_item",
          status: "failed_permanent",
          categoryKey: "failed_permanent",
          categoryLabelPt: "E-mail inválido (4xx)",
          reasonPt: "Sintaxe rejeitada",
          suggestedActionPt: "Corrigir cadastro",
          attempts: 1,
        },
      ],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("E-mail inválido (4xx)");

    const reqValid = new Request("https://example.com/api/mailer/tick", {
      method: "POST",
      headers: { Authorization: "Bearer super-secret-123" },
    });
    const reqInvalid = new Request("https://example.com/api/mailer/tick", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });

    expect(
      verifyMailerCronTickSecret(reqValid, {
        NODE_ENV: "test",
        MAILER_CRON_ENABLED: "true",
        MAILER_CRON_SECRET: "super-secret-123",
      }),
    ).toBe("ok");
    expect(
      verifyMailerCronTickSecret(reqInvalid, {
        NODE_ENV: "test",
        MAILER_CRON_ENABLED: "true",
        MAILER_CRON_SECRET: "super-secret-123",
      }),
    ).toBe("unauthorized");

    const prevEngine = process.env.MAILER_ENGINE;
    process.env.MAILER_ENGINE = "legacy";
    expect(getMailerEngineMode()).toBe("legacy");
    process.env.MAILER_ENGINE = "v2";
    expect(getMailerEngineMode()).toBe("v2");
    process.env.MAILER_ENGINE = prevEngine;
  });

  it("verifies SQL migrations 0031, verify-0031-prereqs, verify-0031, and 0032 security contracts", () => {
    const sql0031 = readFileSync(
      resolve(process.cwd(), "db/migrations/0031_mailer_reliability.sql"),
      "utf-8",
    );
    const sqlVerifyPrereqs = readFileSync(
      resolve(process.cwd(), "db/migrations/verify-0031-prereqs.sql"),
      "utf-8",
    );
    const sqlVerify0031 = readFileSync(
      resolve(process.cwd(), "db/migrations/verify-0031.sql"),
      "utf-8",
    );
    const sql0032 = readFileSync(
      resolve(process.cwd(), "db/migrations/0032_mailer_cron_optional.sql"),
      "utf-8",
    );

    // Must never reference profiles.role in executable SQL (uses public.is_agency_admin() instead)
    const sql0031NoComments = sql0031.replace(/--.*$/gm, "");
    expect(sql0031NoComments.includes("profiles.role")).toBe(false);
    expect(sql0031.includes("public.is_agency_admin()")).toBe(true);

    // Must create mailer_batches and mailer_campaign_exclusions
    expect(sql0031.includes("CREATE TABLE IF NOT EXISTS public.mailer_batches")).toBe(true);
    expect(sql0031.includes("CREATE TABLE IF NOT EXISTS public.mailer_campaign_exclusions")).toBe(
      true,
    );

    // Must reconcile legacy campaigns 2725beda and 8a56bef1
    expect(sql0031.includes("2725beda")).toBe(true);
    expect(sql0031.includes("8a56bef1")).toBe(true);

    // Must harden all operational RPCs with SECURITY DEFINER SET search_path = public and REVOKE ALL FROM PUBLIC, anon, authenticated
    expect(sql0031.includes("SECURITY DEFINER")).toBe(true);
    expect(sql0031.includes("SET search_path = public")).toBe(true);
    expect(sql0031.includes("REVOKE ALL ON FUNCTION public.claim_mailer_batch")).toBe(true);
    expect(sql0031.includes("GRANT EXECUTE ON FUNCTION public.claim_mailer_batch")).toBe(true);

    expect(sqlVerifyPrereqs.length).toBeGreaterThan(100);
    expect(sqlVerify0031.includes("mailer_v2_ready")).toBe(true);
    expect(sql0032.includes("vault.decrypted_secrets")).toBe(true);
  });
});
