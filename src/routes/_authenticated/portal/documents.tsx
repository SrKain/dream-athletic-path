import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel, StatusBadge, secondaryButtonClass } from "@/components/admin-ui";
import { usePortalData } from "@/hooks/use-portal-data";
import { supabase } from "@/lib/supabase/client";
import { validateUpload } from "@/lib/uploads";

export const Route = createFileRoute("/_authenticated/portal/documents")({
  component: PortalDocuments,
});
function PortalDocuments() {
  const { data, reload } = usePortalData();
  const [uploading, setUploading] = useState("");
  async function upload(checklistId: string, file?: File) {
    if (!file || !data.athlete) return;
    const validation = validateUpload("document", file);
    if (!validation.valid)
      return toast.error(
        validation.reason === "invalid_type" ? "File type not allowed." : "File over 25 MB.",
      );
    setUploading(checklistId);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${data.athlete.id}/${crypto.randomUUID()}-${safeName}`;
    const stored = await supabase.storage.from("documents").upload(path, file, { upsert: false });
    if (stored.error) {
      toast.error(stored.error.message);
      setUploading("");
      return;
    }
    const definition = data.checklistDefinitions.find((item) => item.id === checklistId);
    const documentResult = await supabase
      .from("documents")
      .insert({
        athlete_id: data.athlete.id,
        checklist_item_id: checklistId,
        stage_id: definition?.stage_id ?? null,
        title: definition?.label_pt ?? definition?.label_en ?? file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: data.athlete.user_id,
      })
      .select("id")
      .single();
    if (documentResult.error) toast.error(documentResult.error.message);
    else {
      toast.success("Document uploaded.");
      await reload();
    }
    setUploading("");
  }
  return (
    <ProtectedPage role="athlete">
      <AppShell role="athlete" title="Documents">
        <Panel
          title="Document checklist"
          description="Only upload files requested by the agency."
        >
          {data.checklist.length ? (
            <div className="divide-y">
              {data.checklist.map((item) => {
                const definition = data.checklistDefinitions.find(
                  (entry) => entry.id === item.checklist_item_id,
                );
                const doc = data.documents.find((entry) => entry.id === item.document_id);
                return (
                  <article
                    className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                    key={item.id}
                  >
                    <div>
                      <p className="font-medium">{definition?.label_pt ?? definition?.label_en}</p>
                      <div className="mt-2">
                        <StatusBadge value={item.status} />
                      </div>
                      {doc?.review_notes && (
                        <p className="mt-2 text-sm text-destructive">{doc.review_notes}</p>
                      )}
                    </div>
                    <label className={secondaryButtonClass + " cursor-pointer"}>
                      <Upload className="mr-2 h-4 w-4" />
                      {uploading === item.checklist_item_id
                        ? "Uploading..."
                        : item.document_id
                          ? "Re-upload"
                          : "Upload file"}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        disabled={!!uploading}
                        onChange={(e) => upload(item.checklist_item_id, e.target.files?.[0])}
                      />
                    </label>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState>No documents requested.</EmptyState>
          )}
        </Panel>
      </AppShell>
    </ProtectedPage>
  );
}
