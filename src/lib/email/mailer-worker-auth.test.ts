import { describe, it, expect } from "vitest";
import { isMailerWorkerEnabled, verifyMailerWorkerRequest } from "./mailer-worker-auth";

const secret = "s".repeat(40);
const enabled = {
  MAILER_SERVER_ORCHESTRATION: "true",
  MAILER_SEND_ENABLED: "true",
  MAILER_WORKER_SECRET: secret,
} as NodeJS.ProcessEnv;

describe("TASK-107 worker request isolation", () => {
  it("fails closed when configuration is absent or weak", () => {
    expect(isMailerWorkerEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isMailerWorkerEnabled({ ...enabled, MAILER_WORKER_SECRET: "weak" })).toBe(false);
    expect(isMailerWorkerEnabled({ ...enabled, MAILER_SEND_ENABLED: "false" })).toBe(false);
    expect(verifyMailerWorkerRequest(new Request("https://example.test", { method: "POST" }), {} as NodeJS.ProcessEnv)).toBe("disabled");
  });
  it("requires a POST with the exact bearer secret", () => {
    const req = (method: string, token: string) => new Request("https://example.test", {
      method, headers: { authorization: `Bearer ${token}` },
    });
    expect(verifyMailerWorkerRequest(req("GET", secret), enabled)).toBe("unauthorized");
    expect(verifyMailerWorkerRequest(req("POST", "x".repeat(40)), enabled)).toBe("unauthorized");
    expect(verifyMailerWorkerRequest(req("POST", secret), enabled)).toBe("ok");
  });
});
