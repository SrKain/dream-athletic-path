import { Resend } from "resend";
import { getAdminClient } from "@/lib/supabase/clients.server";
import { renderRecruitEmail, type RecruitEmailData } from "./recruit-email-template";

export interface SendRecruitEmailInput {
  athleteId: string;
  coachIds: string[];
}

export interface SendRecruitEmailResult {
  success: boolean;
  totalSent: number;
  totalFailed: number;
  message?: string;
  errors?: string[];
}

export async function sendRecruitEmailToCoaches(
  input: SendRecruitEmailInput,
): Promise<SendRecruitEmailResult> {
  const { athleteId, coachIds } = input;

  if (!coachIds || coachIds.length === 0) {
    return { success: false, totalSent: 0, totalFailed: 0, message: "No coaches selected." };
  }

  const admin = getAdminClient();

  // 1. Obter dados do atleta e relacionamentos
  const { data: athlete, error: athleteError } = await admin
    .from("athletes")
    .select(
      `
      id,
      slug,
      full_name,
      photo_url,
      height_cm,
      nationality,
      sport_id,
      position_id
    `,
    )
    .eq("id", athleteId)
    .single();

  if (athleteError || !athlete) {
    console.error("[recruit-email] Athlete not found:", athleteError?.message);
    return { success: false, totalSent: 0, totalFailed: 0, message: "Athlete not found." };
  }

  // Obter esporte, posição, país e perfil
  const [profileRes, sportRes, posRes, countryRes] = await Promise.all([
    admin.from("athlete_profiles").select("*").eq("athlete_id", athleteId).maybeSingle(),
    athlete.sport_id
      ? admin.from("sports").select("name_en").eq("id", athlete.sport_id).maybeSingle()
      : Promise.resolve({ data: null }),
    athlete.position_id
      ? admin.from("positions").select("name_en").eq("id", athlete.position_id).maybeSingle()
      : Promise.resolve({ data: null }),
    athlete.nationality
      ? admin
          .from("countries")
          .select("name_en, flag_emoji")
          .eq("code", athlete.nationality)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const profile = profileRes.data;
  const sportName = sportRes.data?.name_en ?? null;
  const positionName = posRes.data?.name_en ?? null;
  const countryFlag = countryRes.data?.flag_emoji ?? null;
  const nationalityName = countryRes.data?.name_en ?? athlete.nationality ?? null;

  const emailData: RecruitEmailData = {
    athleteName: athlete.full_name,
    athleteSlug: athlete.slug,
    photoUrl: athlete.photo_url,
    positionName,
    sportName,
    heightCm: athlete.height_cm,
    nationality: nationalityName,
    countryFlag,
    highSchoolGraduation: profile?.high_school_graduation,
    graduationYear: profile?.graduation_year,
    gpa: profile?.gpa,
    athleteStatus: profile?.athlete_status,
    highlightNote: profile?.highlight_note,
  };

  const { subject, html } = renderRecruitEmail(emailData);

  // 2. Obter coaches selecionados
  const { data: coaches, error: coachesError } = await admin
    .from("coaches")
    .select("id, name, email, institution")
    .in("id", coachIds);

  if (coachesError || !coaches || coaches.length === 0) {
    console.error("[recruit-email] Error fetching coaches:", coachesError?.message);
    return {
      success: false,
      totalSent: 0,
      totalFailed: 0,
      message: "Could not find selected coaches.",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Go Team Go <contact@goteamgoagency.com>";

  if (!apiKey) {
    console.warn("[recruit-email] RESEND_API_KEY missing. Simulating failures for audit logs.");
    // Gravar logs como falha por chave ausente
    const now = new Date().toISOString();
    const failureLogs = coaches.map((coach) => ({
      athlete_id: athleteId,
      coach_id: coach.id,
      subject,
      status: "failed",
      error_message: "RESEND_API_KEY is not configured.",
      sent_at: now,
    }));
    await admin.from("recruit_email_logs").insert(failureLogs);

    return {
      success: false,
      totalSent: 0,
      totalFailed: coaches.length,
      message: "RESEND_API_KEY environment variable is not configured.",
    };
  }

  const resend = new Resend(apiKey);
  let totalSent = 0;
  let totalFailed = 0;
  const errors: string[] = [];

  // 3. Disparo em lotes de até 100 e-mails por chamada (limite do batch send do Resend)
  const BATCH_SIZE = 100;
  for (let i = 0; i < coaches.length; i += BATCH_SIZE) {
    const chunk = coaches.slice(i, i + BATCH_SIZE);
    const emailsToSend = chunk.map((coach) => ({
      from,
      to: coach.email,
      subject,
      html,
    }));

    try {
      const batchResponse = await resend.batch.send(emailsToSend);

      if (batchResponse.error) {
        throw new Error(batchResponse.error.message);
      }

      const responseItems = batchResponse.data?.data ?? [];
      const now = new Date().toISOString();

      // Salvar logs individuais para cada coach
      const logsToInsert = chunk.map((coach, index) => {
        const itemResult = responseItems[index];
        const isSuccess = !!itemResult && !("error" in itemResult && itemResult.error);
        if (isSuccess) {
          totalSent++;
          return {
            athlete_id: athleteId,
            coach_id: coach.id,
            subject,
            status: "sent",
            error_message: null,
            sent_at: now,
          };
        } else {
          totalFailed++;
          const err =
            itemResult && "error" in itemResult && itemResult.error
              ? String(itemResult.error)
              : "Batch item send failed";
          return {
            athlete_id: athleteId,
            coach_id: coach.id,
            subject,
            status: "failed",
            error_message: err,
            sent_at: now,
          };
        }
      });

      await admin.from("recruit_email_logs").insert(logsToInsert);
    } catch (batchErr) {
      const errorMsg =
        batchErr instanceof Error ? batchErr.message : "Unknown error in Resend batch";
      console.error("[recruit-email] Batch send exception:", errorMsg);
      errors.push(errorMsg);
      totalFailed += chunk.length;

      const now = new Date().toISOString();
      const failureLogs = chunk.map((coach) => ({
        athlete_id: athleteId,
        coach_id: coach.id,
        subject,
        status: "failed",
        error_message: errorMsg,
        sent_at: now,
      }));
      await admin.from("recruit_email_logs").insert(failureLogs);
    }
  }

  return {
    success: totalSent > 0,
    totalSent,
    totalFailed,
    errors: errors.length > 0 ? errors : undefined,
  };
}
