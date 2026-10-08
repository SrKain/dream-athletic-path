import { describe, expect, it } from "vitest";

import { uploadRules, validateUpload } from "./uploads";

describe("validateUpload", () => {
  it("accepts a supported image inside the configured limit", () => {
    expect(validateUpload("photo", { type: "image/webp", size: 1024 })).toEqual({
      valid: true,
    });
  });

  it("rejects unsupported file types", () => {
    expect(validateUpload("photo", { type: "image/svg+xml", size: 1024 })).toEqual({
      valid: false,
      reason: "invalid_type",
    });
  });

  it("rejects files above the size limit", () => {
    expect(
      validateUpload("document", {
        type: "application/pdf",
        size: uploadRules.document.maxBytes + 1,
      }),
    ).toEqual({ valid: false, reason: "file_too_large" });
  });
});
