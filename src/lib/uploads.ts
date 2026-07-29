export type UploadKind = "photo" | "document" | "video";

const megabytes = (value: number) => value * 1024 * 1024;

function envLimit(name: string, fallback: number) {
  const raw = import.meta.env[name];
  const parsed = typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const uploadRules = {
  photo: {
    maxBytes: megabytes(envLimit("VITE_MAX_PHOTO_SIZE_MB", 10)),
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  document: {
    maxBytes: megabytes(envLimit("VITE_MAX_DOCUMENT_SIZE_MB", 25)),
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  video: {
    maxBytes: megabytes(envLimit("VITE_MAX_VIDEO_SIZE_MB", 500)),
    mimeTypes: ["video/mp4", "video/quicktime"],
  },
} as const;

export function validateUpload(kind: UploadKind, file: Pick<File, "size" | "type">) {
  const rule = uploadRules[kind];
  if (!(rule.mimeTypes as readonly string[]).includes(file.type)) {
    return { valid: false as const, reason: "invalid_type" as const };
  }
  if (file.size > rule.maxBytes) {
    return { valid: false as const, reason: "file_too_large" as const };
  }
  return { valid: true as const };
}
