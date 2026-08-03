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
  name_pt: string;
  flag_emoji: string | null;
}

export interface Sport {
  id: string;
  name_en: string;
  name_pt: string;
  slug: string;
}

export interface Position {
  id: string;
  sport_id: string;
  name_en: string;
  name_pt: string;
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

export interface AthleteProfile {
  athlete_id: string;
  bio_en: string | null;
  bio_pt: string | null;
  highlight_video_url: string | null;
  stats: Record<string, string | number> | null;
  gpa: number | null;
  english_level: string | null;
  graduation_year: number | null;
}

export interface AthleteMedia {
  id: string;
  athlete_id: string;
  kind: MediaKind;
  url: string;
  thumbnail_url: string | null;
  caption_en: string | null;
  caption_pt: string | null;
  is_public: boolean;
  sort_order: number;
  created_at: string;
}

export interface Achievement {
  id: string;
  athlete_id: string;
  title_en: string;
  title_pt: string | null;
  description_en: string | null;
  description_pt: string | null;
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
  name_pt: string | null;
  description_en: string | null;
  description_pt: string | null;
  order_index: number;
  is_active: boolean;
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
  label_pt: string | null;
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
}
