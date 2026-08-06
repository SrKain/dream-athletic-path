import { useCallback, useEffect, useState } from "react";

import { replacePlaceholders, getFirstName } from "@/lib/email/placeholders";
import { supabase } from "@/lib/supabase/client";
import type { Athlete, AthleteStageProgress, PipelineStage } from "@/types/db";

export const STAGE_CELEBRATION_BUCKET = "stage-celebrations";

export function stageImageUrl(path: string) {
  return supabase.storage.from(STAGE_CELEBRATION_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function stageMessageOf(stage: Pick<PipelineStage, "portal_message_pt" | "portal_message_en">) {
  return (stage.portal_message_pt ?? stage.portal_message_en ?? "").trim();
}

type Announcement = {
  stage: PipelineStage;
  message: string;
  images: string[];
};

/**
 * Detects whether the athlete advanced to a stage that has a portal pop-up
 * configured and was not acknowledged yet.
 */
export function useStageAnnouncement({
  athlete,
  stages,
  progress,
}: {
  athlete: Athlete | null;
  stages: PipelineStage[];
  progress: AthleteStageProgress[];
}) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!athlete || !stages.length) return;

      const candidates = [...stages]
        .sort((a, b) => b.order_index - a.order_index)
        .filter((stage) => {
          if (!stageMessageOf(stage)) return false;
          const record = progress.find((item) => item.stage_id === stage.id);
          return stage.id === athlete.current_stage_id || record?.status === "completed";
        });
      if (!candidates.length) return;

      const { data: seen } = await supabase
        .from("athlete_stage_announcements")
        .select("stage_id")
        .eq("athlete_id", athlete.id);
      const seenIds = new Set((seen ?? []).map((row) => row.stage_id as string));

      const stage = candidates.find((item) => !seenIds.has(item.id));
      if (!stage || cancelled) return;

      const { data: images } = await supabase
        .from("stage_celebration_images")
        .select("storage_path")
        .eq("stage_id", stage.id)
        .order("sort_order");
      if (cancelled) return;

      const ordered = [...stages].sort((a, b) => a.order_index - b.order_index);
      const index = ordered.findIndex((item) => item.id === stage.id);
      const previous = index > 0 ? ordered[index - 1] : null;

      const message = replacePlaceholders(stageMessageOf(stage), {
        athlete_name: athlete.full_name,
        athlete_first_name: getFirstName(athlete.full_name),
        previous_stage: previous ? (previous.name_pt ?? previous.name_en) : "",
        new_stage: stage.name_pt ?? stage.name_en,
      })
        .replace(/\{\{[a-z_]+\}\}/g, "")
        .trim();

      setAnnouncement({
        stage,
        message,
        images: (images ?? []).map((row) => stageImageUrl(row.storage_path as string)),
      });
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [athlete, stages, progress]);

  const dismiss = useCallback(async () => {
    if (!announcement || !athlete) return;
    setAnnouncement(null);
    await supabase
      .from("athlete_stage_announcements")
      .upsert(
        { athlete_id: athlete.id, stage_id: announcement.stage.id },
        { onConflict: "athlete_id,stage_id" },
      );
  }, [announcement, athlete]);

  return { announcement, dismiss };
}