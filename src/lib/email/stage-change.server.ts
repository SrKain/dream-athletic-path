import { createServerFn } from "@tanstack/start";
import { getAdminClient } from "@/lib/supabase/clients.server";
import { sendEmail } from "./email.server";
import { replacePlaceholders, getFirstName, type PlaceholderData } from "./placeholders";

/**
 * Server function to notify athlete of stage advancement with celebration email.
 * Loads the custom celebration message from pipeline_stages and sends it with placeholders replaced.
 */
export const notifyStageAdvancementServerFn = createServerFn({ method: "POST" })
  .validator((data: { 
    athleteId: string; 
    previousStageId: string | null; 
    newStageId: string;
  }) => data)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    
    // Load athlete data
    const { data: athlete, error: athleteError } = await admin
      .from("athletes")
      .select("id, full_name, email, agency_id")
      .eq("id", data.athleteId)
      .single();
    
    if (athleteError || !athlete) {
      console.error("[celebration] Failed to load athlete:", athleteError);
      return { success: false, error: "athlete_not_found" };
    }
    
    if (!athlete.email) {
      console.warn("[celebration] Athlete has no email:", athlete.id);
      return { success: false, error: "no_email" };
    }
    
    // Load new stage with celebration message
    const { data: newStage, error: stageError } = await admin
      .from("pipeline_stages")
      .select("id, name_en, celebration_message_en")
      .eq("id", data.newStageId)
      .single();
    
    if (stageError || !newStage) {
      console.error("[celebration] Failed to load new stage:", stageError);
      return { success: false, error: "stage_not_found" };
    }
    
    // Check if celebration message is configured
    if (!newStage.celebration_message_en || newStage.celebration_message_en.trim() === "") {
      console.log("[celebration] No celebration message configured for stage:", newStage.name_en);
      return { success: true, skipped: true, reason: "no_message_configured" };
    }
    
    // Load previous stage name (if exists)
    let previousStageName = "Previous Stage";
    if (data.previousStageId) {
      const { data: prevStage } = await admin
        .from("pipeline_stages")
        .select("name_en")
        .eq("id", data.previousStageId)
        .single();
      
      if (prevStage) {
        previousStageName = prevStage.name_en;
      }
    }
    
    // Load agency name
    const { data: agency } = await admin
      .from("agencies")
      .select("name")
      .eq("id", athlete.agency_id)
      .single();
    
    const agencyName = agency?.name ?? "Go Team Go";
    
    // Build portal link with celebration parameter
    const baseUrl = process.env.VITE_APP_URL ?? "http://localhost:3000";
    const portalLink = `${baseUrl}/portal?celebrate=true`;
    
    // Build placeholder data
    const placeholderData: PlaceholderData = {
      athlete_name: athlete.full_name,
      athlete_first_name: getFirstName(athlete.full_name),
      previous_stage: previousStageName,
      new_stage: newStage.name_en,
      agency_name: agencyName,
      portal_link: portalLink,
    };
    
    // Replace placeholders in custom message
    const customMessage = replacePlaceholders(
      newStage.celebration_message_en,
      placeholderData
    );
    
    // Send celebration email with sending window respect
    const result = await sendEmail({
      template: "stage_advancement_celebration",
      to: athlete.email,
      data: {
        name: athlete.full_name,
        previousStage: previousStageName,
        newStage: newStage.name_en,
        customMessage,
        portalLink,
      },
      respectSendingWindow: true, // Enable smart scheduling
    });
    
    if (!result.sent) {
      return { success: false, error: result.reason };
    }
    
    // Check if email was scheduled
    if ("scheduled" in result && result.scheduled) {
      return { 
        success: true, 
        scheduled: true,
        scheduledFor: result.scheduledFor,
        windowDescription: result.windowDescription
      };
    }
    
    return { success: true, scheduled: false };
  });
