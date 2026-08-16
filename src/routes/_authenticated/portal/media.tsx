import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, ProtectedPage } from "@/components/app-shell";
import { EmptyState, Panel, secondaryButtonClass } from "@/components/admin-ui";
import { usePortalData } from "@/hooks/use-portal-data";
import { supabase } from "@/lib/supabase/client";
import { validateUpload, type UploadKind } from "@/lib/uploads";

export const Route = createFileRoute("/_authenticated/portal/media")({ component: PortalMedia });
function PortalMedia() {
  const { data, reload } = usePortalData();
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void Promise.all(
      data.media.map(async (item) => {
        if (!item.url.startsWith("pending:")) return [item.id, item.url] as const;
        const path = item.url.slice("pending:".length);
        const { data: signed } = await supabase.storage
          .from("athlete-media-pending")
          .createSignedUrl(path, 300);
        return [item.id, signed?.signedUrl ?? ""] as const;
      }),
    ).then((entries) => {
      if (active) setPreviewUrls(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [data.media]);

  async function upload(file?: File) {
    if (!file || !data.athlete) return;
    const kind: UploadKind = file.type.startsWith("video/") ? "video" : "photo";
    const validation = validateUpload(kind, file);
    if (!validation.valid) return toast.error("Invalid file or over the size limit.");
    setUploading(true);
    const path = `${data.athlete.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const stored = await supabase.storage.from("athlete-media-pending").upload(path, file);
    if (stored.error) toast.error(stored.error.message);
    else {
      const result = await supabase.from("athlete_media").insert({
        athlete_id: data.athlete.id,
        kind,
        url: `pending:${path}`,
        is_public: false,
      });
      if (result.error) toast.error(result.error.message);
      else {
        toast.success("Media submitted for approval.");
        await reload();
      }
    }
    setUploading(false);
  }
  return (
    <ProtectedPage role="athlete">
      <AppShell role="athlete" title="Sports media">
        <Panel
          title="Photos and videos"
          description="All content remains private until approved by the agency."
          action={
            <label className={secondaryButtonClass + " cursor-pointer"}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Uploading..." : "Upload media"}
              <input
                className="hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                disabled={uploading}
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </label>
          }
        >
          {data.media.length ? (
            <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.media.map((item) => (
                <article key={item.id}>
                  <div className="aspect-video overflow-hidden rounded-md bg-muted">
                    {item.kind === "photo" ? (
                      <img
                        src={previewUrls[item.id] ?? ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video src={previewUrls[item.id] ?? ""} controls className="h-full w-full" />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.is_public ? "Published" : "Awaiting approval"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>No media uploaded.</EmptyState>
          )}
        </Panel>
      </AppShell>
    </ProtectedPage>
  );
}
