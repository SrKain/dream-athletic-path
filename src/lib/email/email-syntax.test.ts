import { describe, expect, it } from "vitest";
import { isDeliverableEmailSyntax, extractEmailDomain } from "./email-syntax";

describe("Email Syntax Validation (RFC 5322 strict & deliverability)", () => {
  it("accepts valid, standard email addresses", () => {
    expect(isDeliverableEmailSyntax("coach.smith@stanford.edu")).toBe(true);
    expect(isDeliverableEmailSyntax("john.doe+volleyball@athletics.ucla.edu")).toBe(true);
    expect(isDeliverableEmailSyntax("recruiting_coord@vcu.edu")).toBe(true);
    expect(isDeliverableEmailSyntax("a@b.co")).toBe(true);
  });

  it("rejects addresses without @ or without domain", () => {
    expect(isDeliverableEmailSyntax("coach.smith")).toBe(false);
    expect(isDeliverableEmailSyntax("coach.smith@")).toBe(false);
    expect(isDeliverableEmailSyntax("@stanford.edu")).toBe(false);
    expect(isDeliverableEmailSyntax("")).toBe(false);
    expect(isDeliverableEmailSyntax("   ")).toBe(false);
  });

  it("rejects addresses without a dot in domain or with invalid TLD", () => {
    expect(isDeliverableEmailSyntax("coach@localhost")).toBe(false);
    expect(isDeliverableEmailSyntax("coach@stanford")).toBe(false);
    expect(isDeliverableEmailSyntax("coach@stanford.")).toBe(false);
    expect(isDeliverableEmailSyntax("coach@.stanford.edu")).toBe(false);
    expect(isDeliverableEmailSyntax("coach@stanford..edu")).toBe(false);
  });

  it("rejects consecutive dots in local part", () => {
    expect(isDeliverableEmailSyntax("john..doe@stanford.edu")).toBe(false);
    expect(isDeliverableEmailSyntax(".john@stanford.edu")).toBe(false);
    expect(isDeliverableEmailSyntax("john.@stanford.edu")).toBe(false);
  });

  it("rejects spaces, tabs, newlines or control characters", () => {
    expect(isDeliverableEmailSyntax("john doe@stanford.edu")).toBe(false);
    expect(isDeliverableEmailSyntax("john@stan ford.edu")).toBe(false);
    expect(isDeliverableEmailSyntax("john\ndoe@stanford.edu")).toBe(false);
  });

  it("extracts domain correctly or returns null for invalid addresses", () => {
    expect(extractEmailDomain("Coach.Smith@Stanford.EDU")).toBe("stanford.edu");
    expect(extractEmailDomain("not-an-email")).toBeNull();
    expect(extractEmailDomain("user@")).toBeNull();
  });
});
