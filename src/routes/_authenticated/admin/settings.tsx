import { createFileRoute } from "@tanstack/react-router";
import { Edit2, Image as ImageIcon, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel, buttonClass, inputClass } from "@/components/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { STAGE_CELEBRATION_BUCKET, stageImageUrl } from "@/hooks/use-stage-announcement";
import {
  AVAILABLE_PLACEHOLDERS,
  replacePlaceholders,
  getExamplePlaceholderData,
} from "@/lib/email/placeholders";
import type { ChecklistItem, PipelineStage, StageCelebrationImage } from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [stageName, setStageName] = useState("");
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [celebrationMessage, setCelebrationMessage] = useState("");
  const [portalMessage, setPortalMessage] = useState("");
  const [portalImages, setPortalImages] = useState<StageCelebrationImage[]>([]);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const [s, i] = await Promise.all([
      supabase.from("pipeline_stages").select("*").order("order_index"),
      supabase.from("checklist_items").select("*").order("sort_order"),
    ]);
    if (s.error) toast.error(s.error.message);
    if (i.error) toast.error(i.error.message);
    setStages((s.data ?? []) as PipelineStage[]);
    setItems((i.data ?? []) as ChecklistItem[]);
  }
  useEffect(() => void load(), []);

  async function addStage(event: React.FormEvent) {
    event.preventDefault();
    const { data: agency } = await supabase.from("agencies").select("id").limit(1).single();
    if (!agency) return toast.error("Create the agency before configuring the pipeline.");
    const key = stageName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const { error } = await supabase.from("pipeline_stages").insert({
      agency_id: agency.id,
      key,
      name_en: stageName,
      name_pt: stageName,
      order_index: (stages.length + 1) * 10,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Stage added.");
      setStageName("");
      await load();
    }
  }

  async function addChecklist(stageId: string) {
    const label = window.prompt("Name of the requested item");
    if (!label) return;
    const { error } = await supabase.from("checklist_items").insert({
      stage_id: stageId,
      label_en: label,
      label_pt: label,
      sort_order: items.filter((item) => item.stage_id === stageId).length * 10,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Item added.");
      await load();
    }
  }

  function openEditStage(stage: PipelineStage) {
    setEditingStage(stage);
    setCelebrationMessage(stage.celebration_message_en ?? "");
    setPortalMessage(stage.portal_message_pt ?? stage.portal_message_en ?? "");
    void loadStageImages(stage.id);
  }

  async function loadStageImages(stageId: string) {
    const { data, error } = await supabase
      .from("stage_celebration_images")
      .select("*")
      .eq("stage_id", stageId)
      .order("sort_order");
    if (error) toast.error(error.message);
    setPortalImages((data ?? []) as StageCelebrationImage[]);
  }

  async function uploadStageImages(files: FileList | null) {
    if (!editingStage || !files?.length) return;
    setUploading(true);
    let order = portalImages.length;
    for (const file of Array.from(files)) {
      const extension = file.name.split(".").pop() ?? "jpg";
      const path = `${editingStage.id}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await supabase.storage
        .from(STAGE_CELEBRATION_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploaded.error) {
        toast.error(uploaded.error.message);
        continue;
      }
      const inserted = await supabase.from("stage_celebration_images").insert({
        stage_id: editingStage.id,
        storage_path: path,
        sort_order: order * 10,
      });
      if (inserted.error) toast.error(inserted.error.message);
      order += 1;
    }
    setUploading(false);
    await loadStageImages(editingStage.id);
  }

  async function removeStageImage(image: StageCelebrationImage) {
    const { error } = await supabase.from("stage_celebration_images").delete().eq("id", image.id);
    if (error) return toast.error(error.message);
    await supabase.storage.from(STAGE_CELEBRATION_BUCKET).remove([image.storage_path]);
    await loadStageImages(image.stage_id);
  }

  async function moveStageImage(image: StageCelebrationImage, delta: number) {
    const index = portalImages.findIndex((item) => item.id === image.id);
    const target = portalImages[index + delta];
    if (!target) return;
    await Promise.all([
      supabase
        .from("stage_celebration_images")
        .update({ sort_order: target.sort_order })
        .eq("id", image.id),
      supabase
        .from("stage_celebration_images")
        .update({ sort_order: image.sort_order })
        .eq("id", target.id),
    ]);
    await loadStageImages(image.stage_id);
  }

  async function saveCelebrationMessage() {
    if (!editingStage) return;

    const { error } = await supabase
      .from("pipeline_stages")
      .update({
        celebration_message_en: celebrationMessage || null,
        portal_message_pt: portalMessage || null,
      })
      .eq("id", editingStage.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Stage settings saved!");
      setEditingStage(null);
      await load();
    }
  }

  function getPreviewMessage() {
    if (!celebrationMessage.trim()) return "";
    const exampleData = getExamplePlaceholderData();
    return replacePlaceholders(celebrationMessage, exampleData);
  }

  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Settings">
        <Panel title="Pipeline settings">
          <form onSubmit={addStage} className="mb-5 flex items-center gap-3">
            <input
              placeholder="New stage name"
              className={inputClass}
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
            />
            <button className={buttonClass}>
              <Plus className="mr-2 h-4 w-4" /> Add
            </button>
          </form>
          {stages.length ? (
            <div className="divide-y divide-border/70">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-start justify-between gap-5 p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-display text-lg font-semibold">
                        {stage.name_pt ?? stage.name_en}
                      </h3>
                      {stage.celebration_message_en && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Celebration email
                        </Badge>
                      )}
                      {(stage.portal_message_pt ?? stage.portal_message_en) && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" />
                          Portal pop-up
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {items
                        .filter((item) => item.stage_id === stage.id)
                        .map((item) => item.label_pt ?? item.label_en)
                        .join(" · ") || "No items"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-sm font-medium text-primary hover:underline"
                      onClick={() => openEditStage(stage)}
                    >
                      <Edit2 className="inline h-4 w-4 mr-1" />
                      Edit
                    </button>
                    <button
                      className="text-sm font-medium text-primary hover:underline"
                      onClick={() => addChecklist(stage.id)}
                    >
                      + Checklist
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No stages configured.</EmptyState>
          )}
        </Panel>

        {/* Celebration Message Editor Dialog */}
        <Dialog open={!!editingStage} onOpenChange={(open) => !open && setEditingStage(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Edit Celebration Email for "{editingStage?.name_en}"
              </DialogTitle>
              <DialogDescription>
                Customize the celebration message sent to athletes when they advance to this stage.
                Leave empty to skip sending celebration emails for this stage.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Available Placeholders */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Available Placeholders</Label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_PLACEHOLDERS.map((placeholder) => (
                    <Badge
                      key={placeholder.key}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10"
                      onClick={() => {
                        setCelebrationMessage((prev) => prev + " " + placeholder.key);
                      }}
                      title={`${placeholder.description} (Example: ${placeholder.example})`}
                    >
                      {placeholder.key}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Click a placeholder to insert it into your message
                </p>
              </div>

              {/* Message Editor */}
              <div>
                <Label htmlFor="celebration-message" className="text-sm font-medium mb-2 block">
                  Celebration Message (English)
                </Label>
                <Textarea
                  id="celebration-message"
                  value={celebrationMessage}
                  onChange={(e) => setCelebrationMessage(e.target.value)}
                  placeholder="Example: Congratulations {{athlete_first_name}}! You've successfully advanced to {{new_stage}}. This is a huge milestone in your athletic journey!"
                  className="min-h-30 font-mono text-sm"
                />
              </div>

              {/* Live Preview */}
              {celebrationMessage.trim() && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Preview</Label>
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <div className="prose prose-sm max-w-none">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {getPreviewMessage()}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This is how your message will look with example data
                  </p>
                </div>
              )}

              {/* Pop-up no portal */}
              <div className="border-t border-border pt-4">
                <Label htmlFor="portal-message" className="text-sm font-medium mb-2 block">
                  Athlete portal pop-up
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Shown in a dialog as soon as the athlete opens the timeline. Leave empty to show
                  nothing. Accepts the same placeholders above.
                </p>
                <Textarea
                  id="portal-message"
                  value={portalMessage}
                  onChange={(e) => setPortalMessage(e.target.value)}
                  placeholder="Congratulations {{athlete_first_name}}! You have advanced to {{new_stage}}. The next steps are..."
                  className="min-h-30 font-mono text-sm"
                />

                <Label className="text-sm font-medium mt-4 mb-2 block">
                  Slider images (optional)
                </Label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  disabled={uploading}
                  onChange={(e) => {
                    void uploadStageImages(e.target.files);
                    e.target.value = "";
                  }}
                  className="text-sm"
                />
                {portalImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {portalImages.map((image, index) => (
                      <div key={image.id} className="overflow-hidden rounded-lg border">
                        <img
                          src={stageImageUrl(image.storage_path)}
                          alt=""
                          className="aspect-video w-full object-cover"
                        />
                        <div className="flex items-center justify-between px-2 py-1">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-primary disabled:opacity-40"
                              disabled={index === 0}
                              onClick={() => void moveStageImage(image, -1)}
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-primary disabled:opacity-40"
                              disabled={index === portalImages.length - 1}
                              onClick={() => void moveStageImage(image, 1)}
                            >
                              →
                            </button>
                          </div>
                          <button
                            type="button"
                            aria-label="Remove image"
                            className="text-destructive"
                            onClick={() => void removeStageImage(image)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingStage(null)}>
                Cancel
              </Button>
              <Button onClick={saveCelebrationMessage}>Save settings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedPage>
  );
}
