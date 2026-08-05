import { createServerFn } from "@tanstack/react-start";

import { requireAgency } from "@/lib/supabase/auth-middleware";

export const notifyStageAdvancementServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator(
    (data: { athleteId: string; previousStageId: string | null; newStageId: string }) => data,
  )
  .handler(async ({ data }) => {
    const { sendStageCelebration } = await import("./stage-change.server");
    return sendStageCelebration(data);
  });
