/** Tipos de domínio espelhando o schema do Supabase externo. */

export type AppRole = "agency_admin" | "athlete" | "coach";

export type DocumentStatus = "pending" | "submitted" | "approved" | "rejected" | "resubmit";
export type StageStatus = "not_started" | "in_progress" | "blocked" | "completed";
export type MediaKind = "photo" | "video";
export type ProposalStatus = "draft" | "published" | "accepted" | "declined" | "archived";
export type ProposalDecision = "accepted" | "declined";
export type ProposalLanguage = "pt" | "en";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  locale: "pt" | "en";
  created_at: string;
}

export interface Country {
  code: string;
  name_en: string;
  name_pt?: string | null;
  flag_emoji: string | null;
}

export interface Sport {
  id: string;
  name_en: string;
  name_pt?: string | null;
  slug: string;
}

export interface Position {
  id: string;
  sport_id: string;
  name_en: string;
  name_pt?: string | null;
  abbreviation: string | null;
}

export interface Athlete {
  id: string;
  agency_id: string;
  user_id: string | null;
  slug: string;
  full_name: string;
  email: string | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  nationality: string | null;
  sport_id: string | null;
  position_id: string | null;
  photo_url: string | null;
  cover_url: string | null;
  current_stage_id: string | null;
  is_public: boolean;
  is_featured: boolean;
  created_at: string;
  deleted_at: string | null;
}

export type AthleteStatus =
  | "High School"
  | "Freshman"
  | "Sophomore"
  | "Junior"
  | "Senior"
  | "Graduate"
  | "Transfer"
  | "Graduate Transfer";

export interface AthleteProfile {
  athlete_id: string;
  bio_en: string | null;
  course_of_interest: string | null;
  highlight_video_url: string | null;
  stats: Record<string, string | number> | null;
  gpa: number | null;
  english_level: string | null;
  graduation_year: number | null;
  subtitle: string | null;
  current_school: string | null;
  high_school_graduation: string | null;
  seeking_opportunities: string | null;
  toefl_duolingo_score: string | null;
  budget: string | null;
  seasons_eligibility: string | null;
  team_contribution_en: string | null;
  athlete_status?: AthleteStatus | string | null;
  college_start_date?: string | null;
  highlight_note?: string | null;
}

export type AthleteVideoKind = "presentation" | "highlight" | "feature" | "in_court";

export interface AthleteVideo {
  id: string;
  athlete_id: string;
  kind: AthleteVideoKind;
  youtube_url: string;
  title: string | null;
  sort_order: number;
  created_at?: string;
}

export interface AgencyVisualSettings {
  agency_id: string;
  hero_title_en: string | null;
  hero_subtitle_en: string | null;
  catalog_heading_en: string | null;
  logo_url?: string | null;
  hero_background_url?: string | null;
  updated_at?: string;
}

export interface CatalogPositionOrder {
  position_id: string;
  sort_order: number;
}

export interface AthleteMedia {
  id: string;
  athlete_id: string;
  kind: MediaKind;
  url: string;
  thumbnail_url: string | null;
  caption_en: string | null;
  caption_pt?: string | null;
  is_public: boolean;
  sort_order: number;
  created_at: string;
}

export interface Achievement {
  id: string;
  athlete_id: string;
  title_en: string;
  title_pt?: string | null;
  description_en: string | null;
  description_pt?: string | null;
  achieved_on: string | null;
  image_url: string | null;
  medal: boolean;
  achievement_type: string | null;
  is_public: boolean;
}

export interface PipelineStage {
  id: string;
  agency_id: string;
  key: string;
  name_en: string;
  name_pt?: string | null;
  description_en: string | null;
  description_pt?: string | null;
  celebration_message_en: string | null;
  portal_message_pt?: string | null;
  portal_message_en: string | null;
  order_index: number;
  is_active: boolean;
}

export interface StageCelebrationImage {
  id: string;
  stage_id: string;
  storage_path: string;
  sort_order: number;
  created_at?: string;
}

export interface AthleteStageAnnouncement {
  id: string;
  athlete_id: string;
  stage_id: string;
  seen_at: string;
}

export interface AthleteStageProgress {
  id: string;
  athlete_id: string;
  stage_id: string;
  status: StageStatus;
  due_date: string | null;
  notes: string | null;
  owner_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ChecklistItem {
  id: string;
  stage_id: string;
  label_en: string;
  label_pt?: string | null;
  requires_document: boolean;
  sort_order: number;
}

export interface AthleteChecklistItem {
  id: string;
  athlete_id: string;
  checklist_item_id: string;
  status: DocumentStatus;
  completed_at: string | null;
  notes: string | null;
  document_id: string | null;
}

export interface AthleteDocument {
  id: string;
  athlete_id: string;
  stage_id: string | null;
  checklist_item_id: string | null;
  title: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: DocumentStatus;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Proposal {
  id: string;
  agency_id: string;
  athlete_id: string | null;
  recipient_name: string;
  recipient_email: string;
  recipient_sport: string | null;
  recipient_photo_url: string | null;
  title: string;
  language: ProposalLanguage;
  public_token: string;
  status: ProposalStatus;
  expires_at: string | null;
  active_version_id: string | null;
  draft_content: ProposalContent;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalVersion {
  id: string;
  proposal_id: string;
  version_number: number;
  language: ProposalLanguage;
  content: ProposalContent;
  created_by: string | null;
  published_at: string;
}

export interface ProposalResponse {
  id: string;
  proposal_id: string;
  proposal_version_id: string;
  decision: ProposalDecision;
  respondent_name: string;
  respondent_email: string;
  responded_at: string;
}

export type ProposalBlockType =
  | "cover"
  | "school"
  | "location"
  | "team"
  | "scholarship"
  | "school_costs"
  | "general_costs"
  | "information"
  | "payment"
  | "links"
  | "closing";

export interface ProposalRow {
  id: string;
  label: string;
  value?: string;
  amount?: number;
  frequency?: string;
  timing?: string;
  month?: string;
  notes?: string;
  url?: string;
}

export interface ProposalBlock {
  id: string;
  type: ProposalBlockType;
  enabled: boolean;
  title: string;
  subtitle?: string;
  body?: string;
  imageUrl?: string;
  logoUrl?: string;
  rows?: ProposalRow[];
  data?: Record<string, string | number | boolean | null>;
}

export interface ProposalContent {
  schemaVersion: 1;
  currency: string;
  accent?: string;
  blocks: ProposalBlock[];
}

export interface PublicProposalPayload {
  id: string;
  recipientName: string;
  recipientEmailHint: string;
  recipientSport: string | null;
  recipientPhotoUrl: string | null;
  title: string;
  language: ProposalLanguage;
  status: ProposalStatus;
  expiresAt: string | null;
  versionId: string;
  versionNumber: number;
  publishedAt: string;
  content: ProposalContent;
  response: null | {
    decision: ProposalDecision;
    respondentName: string;
    respondedAt: string;
  };
}

/** Atleta com relações resolvidas, usado no feed e no perfil público. */
export type PublicAthlete = Omit<Athlete, "agency_id" | "user_id" | "email" | "deleted_at">;

export interface AthleteCard extends PublicAthlete {
  position?: Pick<Position, "name_en" | "name_pt" | "abbreviation"> | null;
  sport?: Pick<Sport, "name_en" | "name_pt" | "slug"> | null;
  country?: Pick<Country, "name_en" | "name_pt" | "flag_emoji"> | null;
  profile?: Pick<
    AthleteProfile,
    "high_school_graduation" | "graduation_year" | "athlete_status" | "highlight_video_url"
  > | null;
}

/** Item de bolinha de Stories de Highlights na Home */
export interface HighlightStoryAthlete {
  athleteId: string;
  athleteName: string;
  athleteSlug: string;
  photoUrl: string | null;
  positionEn: string | null;
  latestHighlightDate: string;
  highlightsCount: number;
  firstHighlightIndex: number;
}

/** Item individual no feed global de Highlights */
export interface HighlightFeedItem {
  id: string;
  athleteId: string;
  athleteName: string;
  athleteSlug: string;
  athletePhoto: string | null;
  positionEn: string | null;
  countryEn: string | null;
  countryFlag: string | null;
  youtubeUrl: string;
  title: string | null;
  createdAt: string;
  likesCount: number;
}

export interface AthleteVideoLike {
  id: string;
  video_id: string;
  athlete_id: string;
  user_fingerprint: string;
  created_at: string;
}

export interface Coach {
  id: string;
  name: string;
  email: string;
  institution: string | null;
  created_at: string;
}

export type UniversityLeague = "NJCAA D1" | "NJCAA D2" | "NCAA D1" | "NCAA D2" | "NAIA";

export type UniversityBudgetLevel = "0–1000" | "1000–5000" | "5000–10000" | "10000+";

export type UniversityToeflLevel = "0" | "0–61" | "61+";

export interface UniversityCoach {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role?: string;
}

export interface UniversityHistoryEntry {
  id: string;
  date: string;
  event: string;
}

export interface University {
  id: string;
  name: string;
  city: string;
  state: string;
  league: UniversityLeague | null;
  source_url: string | null;
  is_hbcu: boolean;
  budget_level: UniversityBudgetLevel | null;
  toefl_level: UniversityToeflLevel | null;
  coaches: UniversityCoach[];
  history: UniversityHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export type SuppressionType = "temporary_6m" | "permanent";

export interface EmailSuppression {
  id: string;
  email: string;
  reason: string;
  suppression_type?: SuppressionType;
  expires_at?: string | null;
  created_at: string;
}

export type InterestSignalReason =
  "position_not_needed" | "fully_recruited" | "other_positions_only" | "specific_athlete_dislike";

export interface CoachInterestSignal {
  id: string;
  coach_id?: string | null;
  coach_email: string;
  reason: InterestSignalReason;
  athlete_id?: string | null;
  athlete_name?: string | null;
  position?: string | null;
  notes?: string | null;
  created_at: string;
  expires_at: string;
}

export type MailerCampaignMode = "single_athlete" | "multi_athlete" | "catalog";

export type MailerCampaignStatus =
  "draft" | "preparing" | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface MailerCampaignSnapshotRow {
  campaign_id: string;
  schema_version: number;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export interface MailerDomainCheck {
  domain: string;
  has_mx: boolean;
  checked_at: string;
}

export type MailerQueueStatus =
  | "pending"
  | "claimed"
  | "accepted"
  | "failed_retryable"
  | "failed_permanent"
  | "unconfirmed"
  | "cancelled"
  // Legacy compatibility statuses
  | "processing"
  | "sent"
  | "failed"
  | "retry"
  | "suppressed";

export type MailerBatchStatus =
  "claimed" | "submitting" | "accepted" | "partial" | "failed" | "ambiguous";

export type MailerExclusionReason =
  "duplicate" | "invalid" | "suppressed" | "blocked_fit" | "other";

export interface MailerBatch {
  id: string;
  campaign_id: string;
  seq: number;
  item_ids: string[];
  idempotency_key: string;
  status: MailerBatchStatus;
  attempts: number;
  provider_http_status?: number | null;
  provider_response?: Record<string, unknown> | null;
  last_error?: string | null;
  claimed_at: string;
  submitted_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export interface MailerCampaignExclusion {
  id?: string;
  campaign_id?: string;
  coachId?: string | null;
  email: string;
  emailNormalized: string;
  name?: string | null;
  universityName?: string | null;
  reason: MailerExclusionReason;
  details?: string | null;
  created_at?: string;
}

export interface MailerPreflightQuota {
  monthlyQuota: number;
  cycleStartDay: number;
  cycleStartsAt: string;
  usedThisMonth: number;
  remainingBeforeSend: number;
  remainingAfterSend: number;
  projectedUsagePercent: number;
  warning80Percent: boolean;
  blocked: boolean;
}

export interface MailerPreflightResult {
  selectedCount: number;
  eligibleCount: number;
  duplicateCount: number;
  invalidCount: number;
  suppressedCount: number;
  blockedFitCount: number;
  otherExcludedCount: number;
  excludedTotalCount: number;
  invariantValid: boolean;
  manifestFingerprint: string;
  quota: MailerPreflightQuota;
  eligibleRecipients: Array<{
    coachId?: string | null;
    name: string;
    lastName?: string;
    universityName?: string;
    email: string;
    emailNormalized: string;
  }>;
  excludedRecipients: MailerCampaignExclusion[];
}

export interface MailerCampaign {
  id: string;
  created_at: string;
  created_by: string | null;
  mode: MailerCampaignMode;
  subject: string;
  athlete_ids: string[];
  recipients_count: number;
  selected_count?: number;
  eligible_count?: number;
  manifest_count?: number;
  manifest_fingerprint?: string | null;
  accepted_count?: number;
  delivered_count?: number;
  failed_permanent_count?: number;
  failed_retryable_count?: number;
  unconfirmed_count?: number;
  cancelled_count?: number;
  exclusions_summary?: Record<string, number>;
  safety_pause_reason?: string | null;
  engine_version?: "v2" | "legacy" | string;
  idempotency_key?: string | null;
  filters: Record<string, unknown>;
  status?: MailerCampaignStatus;
  total_recipients?: number;
  sent_count?: number;
  failed_count?: number;
  suppressed_count?: number;
  current_batch?: number;
  total_batches?: number;
  batch_size?: number;
  delay_between_batches_sec?: number;
  delay_between_items_ms?: number;
  next_batch_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  paused_at?: string | null;
  cancelled_at?: string | null;
  last_error?: string | null;
  controller_id?: string | null;
  controller_lease_expires_at?: string | null;
}

export interface MailerQueueItem {
  id: string;
  campaign_id: string;
  coach_id?: string | null;
  recipient_email: string;
  email_normalized?: string;
  recipient_name: string;
  university_name?: string | null;
  email_type: "athlete_teaser" | "athlete_teaser_multi" | "catalog_general";
  subject: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: MailerQueueStatus;
  batch_number: number;
  batch_id?: string | null;
  batch_seq?: number | null;
  failure_category?: string | null;
  attempts: number;
  max_attempts: number;
  reserved_by?: string | null;
  reserved_at?: string | null;
  reservation_expires_at?: string | null;
  next_retry_at?: string | null;
  provider_message_id?: string | null;
  last_error?: string | null;
  error_code?: string | null;
  processed_at?: string | null;
  created_at: string;
}

export interface MailerRateLimit {
  id: string;
  window_started_at: string;
  dispatches_in_window: number;
  max_dispatches_per_window: number;
  window_duration_seconds: number;
  last_batch_completed_at?: string | null;
  pause_between_batches_seconds: number;
  locked_until?: string | null;
  updated_at: string;
}

export interface CampaignProgress {
  campaignId: string;
  status: MailerCampaignStatus;
  subject: string;
  mode?: MailerCampaignMode;
  engineVersion?: string;
  selectedCount?: number;
  eligibleCount?: number;
  totalRecipients: number;
  sentCount: number;
  acceptedCount?: number;
  failedCount: number;
  failedPermanentCount?: number;
  failedRetryableCount?: number;
  suppressedCount: number;
  pendingCount: number;
  processingCount: number;
  claimedCount?: number;
  cancelledCount: number;
  unconfirmedCount?: number;
  decidedCount?: number;
  statesSum?: number;
  invariantValid?: boolean;
  submissionPercent?: number;
  deliveryPercent?: number;
  deliveredCount?: number;
  bouncedCount?: number;
  complainedCount?: number;
  openedCount?: number;
  clickedCount?: number;
  awaitingDeliveryCount?: number;
  currentBatch: number;
  totalBatches: number;
  batchSize: number;
  lastBatchStatus?: string | null;
  lastBatchAttempts?: number;
  lastBatchIdempotencyKey?: string | null;
  exclusionsSummary?: Record<string, number>;
  safetyPauseReason?: string | null;
  percentComplete: number;
  nextBatchAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt?: string | null;
  throughputPerSec?: number;
  estimatedRemainingSeconds: number | null;
  lastError: string | null;
  substate?: string;
  substateLabel?: string;
  substateDescription?: string;
  lastProgressAt?: string | null;
  asOf?: string;
}

export interface MailerNonSentReportItem {
  id: string;
  email: string;
  coachName: string;
  universityName: string;
  source: "preflight_exclusion" | "queue_item";
  status: string;
  categoryKey:
    | "duplicate"
    | "invalid"
    | "suppressed"
    | "blocked_fit"
    | "failed_permanent"
    | "failed_retryable"
    | "unconfirmed"
    | "cancelled";
  categoryLabelPt: string;
  reasonPt: string;
  suggestedActionPt: string;
  attempts: number;
}

export interface MailerCampaignFinalReport {
  campaignId: string;
  subject: string;
  mode: MailerCampaignMode;
  status: MailerCampaignStatus;
  finalBadgeLabelPt:
    | "Concluída — tudo aceito"
    | "Concluída com ressalvas"
    | "Pausada por segurança"
    | "Interrompida — reabra para retomar"
    | "Cancelada";
  finalBadgeTone: "emerald" | "amber" | "rose" | "slate";
  selectedCount: number;
  eligibleCount: number;
  excludedCount: number;
  acceptedCount: number;
  deliveredCount: number;
  awaitingDeliveryCount: number;
  bouncedCount: number;
  complainedCount: number;
  openedCount: number;
  clickedCount: number;
  failedPermanentCount: number;
  failedRetryableCount: number;
  unconfirmedCount: number;
  cancelledCount: number;
  invariantSelectionValid: boolean;
  invariantQueueValid: boolean;
  asOf: string;
  startedAt: string | null;
  completedAt: string | null;
  safetyPauseReason: string | null;
  nonSentItems: MailerNonSentReportItem[];
}

export interface EnqueueResult {
  success: boolean;
  campaignId: string;
  totalRecipients: number;
  totalEnqueued: number;
  totalSuppressed: number;
  totalBatches: number;
  batchSize: number;
  status: MailerCampaignStatus;
  preflight?: MailerPreflightResult;
  reusedCampaign?: boolean;
  message?: string;
  errors?: string[];
}

export interface RecruitEmailLog {
  id: string;
  campaign_id?: string | null;
  athlete_id: string | null;
  athlete_ids?: string[];
  coach_id: string | null;
  university_id?: string | null;
  coach_role?: string | null;
  subject: string;
  status: "sent" | "failed" | "suppressed";
  error_message: string | null;
  sent_at: string;
  email_type?: "athlete_teaser" | "athlete_teaser_multi" | "catalog_general" | "catalog";
  recipient_email?: string | null;
  recipient_name?: string | null;
  university_name?: string | null;
  provider_id?: string | null;
}

export type EmailEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained"
  | "email.unsubscribed"
  | "email.failed"
  | "email.suppressed"
  | string;

export interface EmailEvent {
  id: string;
  svix_id?: string | null;
  provider?: string;
  provider_event_id?: string;
  provider_email_id: string | null;
  event_type: EmailEventType;
  recipient?: string;
  recipient_email?: string;
  subject?: string | null;
  campaign_id?: string | null;
  athlete_id?: string | null;
  clicked_url?: string | null;
  clicked_at?: string | null;
  user_agent?: string | null;
  is_probable_automated?: boolean;
  occurred_at: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface MailerMetricsTotals {
  sent: number;
  delivered: number;
  opened: number;
  unique_opened: number;
  clicked: number;
  unique_clicked: number;
  bounced: number;
  bounced_permanent: number;
  bounced_transient: number;
  delivery_delayed: number;
  unsubscribed: number;
  complained: number;
  failed: number;
  suppressed: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
  complaint_rate: number;
  unsubscribe_rate: number;
}

export interface MailerMetricsTimePoint {
  period: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}

export interface CampaignModePerformance {
  mode: "single_athlete" | "multi_athlete" | "catalog";
  label: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
}

export interface DeliveryProblemItem {
  id: string;
  recipient: string;
  university_name?: string | null;
  event_type: string;
  reason?: string | null;
  occurred_at: string;
}

export interface MailerMetricsReport {
  dataSource: "resend_api" | "local_database" | "unavailable";
  startDate: string;
  endDate: string;
  granularity: "daily" | "hourly";
  totals: MailerMetricsTotals;
  timeSeries: MailerMetricsTimePoint[];
  campaigns: CampaignModePerformance[];
  deliveryProblems: DeliveryProblemItem[];
  lastUpdated: string;
  apiConfigured: boolean;
  message?: string;
}
