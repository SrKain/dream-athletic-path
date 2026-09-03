import { createServerFn } from "@tanstack/react-start";
import { requireAgency } from "@/lib/supabase/auth-middleware";

export const sendRecruitEmailServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { athleteId: string; coachIds: string[] }) => data)
  .handler(async ({ data }) => {
    const { sendRecruitEmailToCoaches } = await import("./recruit-email.server");
    return sendRecruitEmailToCoaches(data);
  });
