import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel, StatusBadge, secondaryButtonClass } from "@/components/admin-ui";
import { supabase } from "@/lib/supabase/client";
import type { AthleteDocument, DocumentStatus } from "@/types/db";

type DocumentRow = AthleteDocument & { athletes?: { full_name: string } | null };
export const Route = createFileRoute("/admin/documents")({ component: DocumentsAdmin });

function DocumentsAdmin() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  async function load() {
    const { data, error } = await supabase
      .from("documents")
      .select("*,athletes(full_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setDocuments((data ?? []) as unknown as DocumentRow[]);
  }
  useEffect(() => void load(), []);
  async function review(document: DocumentRow, status: DocumentStatus) {
    const notes =
      status === "rejected" || status === "resubmit"
        ? window.prompt("Observação para o atleta")
        : null;
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("documents")
      .update({
        status,
        review_notes: notes,
        reviewed_by: user.user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", document.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Documento atualizado.");
      await load();
    }
  }
  async function download(path: string) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (error) toast.error(error.message);
    else window.open(data.signedUrl, "_blank");
  }
  return (
    <ProtectedPage role="agency_admin">
      <AppShell role="agency_admin" title="Documentos">
        <Panel title="Revisão documental" description="Arquivos enviados pelos atletas.">
          {documents.length ? (
            <div className="divide-y">
              {documents.map((doc) => (
                <article
                  key={doc.id}
                  className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {doc.athletes?.full_name} ·{" "}
                      {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    <div className="mt-2">
                      <StatusBadge value={doc.status} />
                    </div>
                    {doc.review_notes && (
                      <p className="mt-2 text-sm text-destructive">{doc.review_notes}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={secondaryButtonClass}
                      onClick={() => download(doc.storage_path)}
                    >
                      Visualizar
                    </button>
                    <button
                      className={secondaryButtonClass}
                      onClick={() => review(doc, "approved")}
                    >
                      Aprovar
                    </button>
                    <button
                      className={secondaryButtonClass}
                      onClick={() => review(doc, "resubmit")}
                    >
                      Solicitar reenvio
                    </button>
                    <button
                      className={secondaryButtonClass}
                      onClick={() => review(doc, "rejected")}
                    >
                      Reprovar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>Nenhum documento enviado.</EmptyState>
          )}
        </Panel>
      </AppShell>
    </ProtectedPage>
  );
}
