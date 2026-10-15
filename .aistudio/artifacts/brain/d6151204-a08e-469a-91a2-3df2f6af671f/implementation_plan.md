# Mailer: Browser-Orchestrated Queue Architecture & Vercel Cron Decoupling

A robust architectural refactor of the recruiting Mailer module in Dream Athletic Path to eliminate Vercel Cron deployment blocks on the Hobby plan by transferring dispatch orchestration to the authenticated browser, while strictly preserving backend security, rate limiting, and recent Codex PR #2 email customizations.

## User Review & Critical Decisions

> [!IMPORTANT]
> The browser will now act as the dispatch orchestrator. It triggers short, authenticated micro-batches (2 emails per second), awaits completion before triggering the next cycle, and pauses during the global 60-second cooldown window every 150 emails. No Cron jobs or third-party scheduling services are required.

- **Confirmed Decision 1**: Dispatch cadence will be 2 emails per micro-batch cycle with an interval of approximately 1 second.
- **Confirmed Decision 2**: If the tab is backgrounded, dispatch continues and a discrete alert informs the admin to keep the tab open for uninterrupted throughput.
- **Confirmed Decision 3**: Strict individual item dispatch with server-side idempotency (`${campaignId}:${recipientEmail}`) to prevent duplicate sends if connections drop.
- **Confirmed Decision 4**: All recent Codex PR #2 features (custom subject per mode, coach surname greetings, personal composer blocks, "NOT A FIT" mailto, "VIEW FULL PROFILE", "Available" field) remain fully intact.

---

## 1. Overview & Core Concept

- **What It Does**: Resolves Vercel deploy errors caused by per-minute Cron jobs on the Hobby plan by removing cron dependencies. The browser orchestrates dispatch via chained short Server Function calls.
- **Target Audience**: Agency Administrators managing recruiting campaigns for college coaches.
- **Key Value**: Free-tier compliance (zero Vercel Hobby or Supabase add-on costs), zero serverless function timeouts, atomic concurrency control against duplicate dispatches, and seamless pause/resume capabilities.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. _Campaign Creation_: Admin selects athletes, filters, edits email blocks/subject in `/admin/mailer`, and clicks "Send Emails". The campaign is enqueued atomically.
  2. _Live Orchestration_: The browser automatically starts the dispatch loop. The Live Campaign Monitor shows real-time progress (sent, pending, failed, ETA, batch).
  3. _Cooldown Window_: Upon reaching 150 emails in a 60-second window, the orchestrator pauses, displaying a dynamic countdown badge. Dispatches resume automatically when the window opens.
  4. _Tab Guidance_: A discrete, elegant banner reminds the admin: _"Keep this browser tab open during sending. Progress is continuously persisted and can be paused or resumed anytime."_
  5. _Session Interruption & Recovery_: If the browser is closed or connection drops, unspent items remain safely stored as `pending` in Supabase. Reopening `/admin/mailer` identifies the active campaign and offers a one-click "Resume" action.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Browser-Orchestrated Micro-Batches vs. Background Server Workers**
  - _Chosen Approach_: Browser triggers `processMailerMicroBatchServerFn({ campaignId, batchSize: 2 })` sequentially with a ~1s cadence.
  - _Why_: Vercel Hobby serverless functions have a 10-15s maximum execution limit and kill un-awaited background tasks on response termination. Short 2-email bursts complete in ~500ms, eliminating timeout risks.
  - _Alternatives Considered_: Vercel Cron (blocked by Hobby tier), Supabase Edge Functions with cron (requires paid/external setup).
- **Decision 2: Transactional Row-Level Locking (`FOR UPDATE SKIP LOCKED`)**
  - _Chosen Approach_: Rely exclusively on PostgreSQL `claim_mailer_queue_batch` RPC. If the RPC fails, fail safely without un-locked fallback.
  - _Why_: Prevents race conditions and double-sends even when multiple browser tabs or admins are active.
- **Decision 3: Complete Preservation of Codex PR #2**
  - _Chosen Approach_: Retain all existing templates, canonical block structures (`EmailBlock[]`), and coach preference drawers without modification.
  - _Why_: Preserves production-tested customizations already merged into `main`.

---

## 4. Technical Architecture & Data Strategy

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   ADMIN BROWSER (/admin/mailer)                        │
│                                                                        │
│  [ Start / Resume ] ──► [ Enqueue Campaign ] ──► campaignId            │
│           │                                                            │
│           ▼                                                            │
│  [ Chained setTimeout Loop (~1.0s) ] ◄─── (await previous response)    │
│           │                                                            │
│           ├─── If running: call processMailerMicroBatchServerFn (2/tick)│
│           ├─── If cooldown: wait cooldownRemainingSec (60s countdown)  │
│           └─── If completed / paused: stop loop                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP POST (requireAgency)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      VERCEL SERVERLESS FUNCTION                        │
│                                                                        │
│  1. Validate agency admin session                                      │
│  2. Check global rate limit (mailer_rate_limits)                       │
│  3. Claim 2 items: RPC claim_mailer_queue_batch (FOR UPDATE SKIP LOCKED)│
│  4. For each item:                                                     │
│       - Verify idempotency / provider_message_id                       │
│       - Send via Resend SDK (emails.send)                              │
│       - Record provider_id in mailer_queue ('sent') & recruit_email_logs│
│  5. Atomically update mailer_campaigns counters                        │
│  6. Return progress & cooldown status                                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────┐
                     │         SUPABASE DB          │
                     │  - mailer_campaigns          │
                     │  - mailer_queue              │
                     │  - mailer_rate_limits        │
                     │  - recruit_email_logs        │
                     └──────────────────────────────┘
```

### Components to Update:

1. `vercel.json`: Remove `crons` array.
2. `src/server.ts`: Remove deprecated `/api/cron/process-mailer-queue` and `/api/mailer/process-queue` routes.
3. `src/lib/email/mailer-queue.server.ts`: Adapt queue worker for micro-batches (batchSize = 2), eliminate un-locked fallback, and remove fire-and-forget background ticks.
4. `src/lib/email/recruit-email.functions.ts`: Export authenticated `processMailerMicroBatchServerFn` with `requireAgency`.
5. `src/routes/_authenticated/admin/mailer.tsx`: Implement browser orchestrator loop with `useRef`, visibility detection, cooldown countdown, and recovery.
6. Test suites: Update unit tests for micro-batches, mock fixtures, and validate full build (`bun run validate`).
