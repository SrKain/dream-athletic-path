import { describe, expect, it } from "vitest";
import {
  AGENCY_CONTACT_EMAIL,
  RECRUIT_WHATSAPP_NUMBER,
  buildContactEmailUrl,
  buildMailtoUrl,
  buildRecruitWhatsappUrl,
} from "./contact";

describe("contact helpers", () => {
  it("maintains the recruit whatsapp helper intact", () => {
    expect(RECRUIT_WHATSAPP_NUMBER).toBe("5511999239490");
    const url = buildRecruitWhatsappUrl("Ana Silva");
    expect(url).toContain("https://wa.me/5511999239490");
    expect(url).toContain(encodeURIComponent("Ana Silva"));
  });

  it("builds a sanitized mailto URL with default recipient", () => {
    const url = buildMailtoUrl({
      subject: "Test Subject",
      body: "Test Body with spaces and special characters: & ? = #",
    });

    expect(url.startsWith(`mailto:${AGENCY_CONTACT_EMAIL}?`)).toBe(true);
    expect(url).toContain(`subject=${encodeURIComponent("Test Subject")}`);
    expect(url).toContain(
      `body=${encodeURIComponent("Test Body with spaces and special characters: & ? = #")}`,
    );
  });

  it("supports custom recipient in buildMailtoUrl", () => {
    const url = buildMailtoUrl({
      to: "custom@example.com ",
      subject: "Hello",
      body: "World",
    });

    expect(url).toBe("mailto:custom@example.com?subject=Hello&body=World");
  });

  it("builds hero contextual email with expected subject and body", () => {
    const url = buildContactEmailUrl({ type: "hero" });
    const parsed = new URL(url);

    expect(parsed.protocol).toBe("mailto:");
    expect(parsed.pathname).toBe(AGENCY_CONTACT_EMAIL);
    expect(parsed.searchParams.get("subject")).toBe("I'm interested in working with Go Team Go");
    expect(parsed.searchParams.get("body")).toContain("work together");
  });

  it("builds catalog contextual email with expected subject and body", () => {
    const url = buildContactEmailUrl({ type: "catalog" });
    const parsed = new URL(url);

    expect(parsed.protocol).toBe("mailto:");
    expect(parsed.pathname).toBe(AGENCY_CONTACT_EMAIL);
    expect(parsed.searchParams.get("subject")).toBe("Athlete recruitment inquiry");
    expect(parsed.searchParams.get("body")).toContain("athlete catalog");
  });

  it("builds athlete contextual email with dynamic name, special characters, and slug", () => {
    const url = buildContactEmailUrl({
      type: "athlete",
      athleteName: "João da Silva & Souza",
      athleteSlug: "joao-silva",
    });
    const parsed = new URL(url);

    expect(parsed.protocol).toBe("mailto:");
    expect(parsed.pathname).toBe(AGENCY_CONTACT_EMAIL);
    expect(parsed.searchParams.get("subject")).toBe("Interest in João da Silva & Souza");
    expect(parsed.searchParams.get("body")).toContain("João da Silva & Souza");
    expect(parsed.searchParams.get("body")).toContain(
      "https://portfolio.goteamgoagency.com/athlete/joao-silva",
    );
  });

  it("builds athlete contextual email without slug gracefully", () => {
    const url = buildContactEmailUrl({
      type: "athlete",
      athleteName: "Maria Santos",
    });
    const parsed = new URL(url);

    expect(parsed.searchParams.get("subject")).toBe("Interest in Maria Santos");
    expect(parsed.searchParams.get("body")).toContain("Maria Santos");
  });

  it("builds footer contextual email with expected subject", () => {
    const url = buildContactEmailUrl({ type: "footer" });
    const parsed = new URL(url);

    expect(parsed.protocol).toBe("mailto:");
    expect(parsed.pathname).toBe(AGENCY_CONTACT_EMAIL);
    expect(parsed.searchParams.get("subject")).toBe("Contact through website");
  });

  it("builds general contextual email with custom note", () => {
    const url = buildContactEmailUrl({
      type: "general",
      note: "international agency partnership",
    });
    const parsed = new URL(url);

    expect(parsed.searchParams.get("subject")).toBe("General inquiry");
    expect(parsed.searchParams.get("body")).toContain("international agency partnership");
  });
});
