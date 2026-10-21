import { createServerFn } from "@tanstack/react-start";
import { requireAgency } from "@/lib/supabase/auth-middleware";
import type { UniversityCoach } from "@/types/db";

export const saveUniversityCoachServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator(
    (data: { universityId: string; coach: Partial<UniversityCoach> & { email: string } }) => data,
  )
  .handler(async ({ data }) => {
    const { updateUniversityCoachAtomic } = await import("./coach-directory.server");
    return updateUniversityCoachAtomic(data.universityId, data.coach);
  });

export const deleteUniversityCoachServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .inputValidator((data: { universityId: string; coachIdOrEmail: string }) => data)
  .handler(async ({ data }) => {
    const { deleteUniversityCoachAtomic } = await import("./coach-directory.server");
    return deleteUniversityCoachAtomic(data.universityId, data.coachIdOrEmail);
  });
