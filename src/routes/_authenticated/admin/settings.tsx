import { createFileRoute } from "@tanstack/react-router";
import { Edit2, Plus, Sparkles } from "lucide-react";
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
import { 
  AVAILABLE_PLACEHOLDERS, 
  replacePlaceholders,
  getExamplePlaceholderData 
} from "@/lib/email/placeholders";
import type { ChecklistItem, PipelineStage } from "@/types/db";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [stageName, setStageName] = useState("");
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [celebrationMessage, setCelebrationMessage] = useState("");

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
    if (!agency) return toast.error("Crie a agência antes de configurar o pipeline.");
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
      toast.success("Etapa adicionada.");
      setStageName("");
      await load();
    }
  }

  async function addChecklist(stageId: string) {
    const label = window.prompt("Nome do item solicitado");
    if (!label) return;
    const { error } = await supabase.from("checklist_items").insert({
      stage_id: stageId,
      label_en: label,
      label_pt: label,
      sort_order: items.filter((item) => item.stage_id === stageId).length * 10,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Item adicionado.");
      await load();
    }
  }

  function openEditStage(stage: PipelineStage) {
    setEditingStage(stage);
    setCelebrationMessage(stage.celebration_message_en ?? "");
  }

  async function saveCelebrationMessage() {
    if (!editingStage) return;
    
    const { error } = await supabase
      .from("pipeline_stages")
      .update({ celebration_message_en: celebrationMessage || null })
      .eq("id", editingStage.id);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Celebration message saved!");
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
      <AppShell role="agency_admin" title="Configurações">
        <Panel title="Configurações do Pipeline">
          <form onSubmit={addStage} className="mb-5 flex items-center gap-3">
            <input
              placeholder="Nome da nova etapa"
              className={inputClass}
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
            />
            <button className={buttonClass}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
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
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {items
                        .filter((item) => item.stage_id === stage.id)
                        .map((item) => item.label_pt ?? item.label_en)
                        .join(" · ") || "Sem itens"}
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
            <EmptyState>Nenhuma etapa configurada.</EmptyState>
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingStage(null)}>
                Cancel
              </Button>
              <Button onClick={saveCelebrationMessage}>
                Save Celebration Message
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedPage>
  );
}
