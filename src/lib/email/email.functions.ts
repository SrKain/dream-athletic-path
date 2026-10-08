import { createServerFn } from "@tanstack/react-start";
import { requireAgency } from "@/lib/supabase/auth-middleware";

export const processScheduledEmailsServerFn = createServerFn({ method: "POST" })
  .middleware([requireAgency])
  .handler(async () => {
    const { processScheduledEmails } = await import("./email.server");
    return processScheduledEmails();
  });
