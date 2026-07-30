import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/auth-provider";
import type {
  AppNotification,
  Athlete,
  AthleteChecklistItem,
  AthleteDocument,
  AthleteMedia,
  AthleteStageProgress,
  ChecklistItem,
  PipelineStage,
} from "@/types/db";

export type PortalData = {
  athlete: Athlete | null;
  stages: PipelineStage[];
  progress: AthleteStageProgress[];
  checklist: AthleteChecklistItem[];
  checklistDefinitions: ChecklistItem[];
  documents: AthleteDocument[];
  media: AthleteMedia[];
  notifications: AppNotification[];
};

const initial: PortalData = {
  athlete: null,
  stages: [],
  progress: [],
  checklist: [],
  checklistDefinitions: [],
  documents: [],
  media: [],
  notifications: [],
};

export function usePortalData() {
  const { user } = useAuth();
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: athlete } = await supabase
      .from("athletes")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!athlete) {
      setLoading(false);
      return;
    }
    const athleteId = athlete.id as string;
    const [stages, progress, checklist, definitions, documents, media, notifications] =
      await Promise.all([
        supabase.from("pipeline_stages").select("*").order("order_index"),
        supabase.from("athlete_stage_progress").select("*").eq("athlete_id", athleteId),
        supabase.from("athlete_checklist_items").select("*").eq("athlete_id", athleteId),
        supabase.from("checklist_items").select("*").order("sort_order"),
        supabase
          .from("documents")
          .select("*")
          .eq("athlete_id", athleteId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("athlete_media")
          .select("*")
          .eq("athlete_id", athleteId)
          .order("created_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
    setData({
      athlete: athlete as Athlete,
      stages: (stages.data ?? []) as PipelineStage[],
      progress: (progress.data ?? []) as AthleteStageProgress[],
      checklist: (checklist.data ?? []) as AthleteChecklistItem[],
      checklistDefinitions: (definitions.data ?? []) as ChecklistItem[],
      documents: (documents.data ?? []) as AthleteDocument[],
      media: (media.data ?? []) as AthleteMedia[],
      notifications: (notifications.data ?? []) as AppNotification[],
    });
    setLoading(false);
  }, [user]);

  useEffect(() => void load(), [load]);
  return { data, loading, reload: load };
}
