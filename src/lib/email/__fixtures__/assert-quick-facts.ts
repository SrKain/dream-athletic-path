import { expect } from "vitest";
import { ANA_QUICK_FACTS } from "./ana-carolina";
import { escapeHtml } from "../email-layout";

/** Checks emitted HTML/text against the requested layout, independently of the renderer. */
export function assertAnaQuickFacts(html: string, text: string, count = 1) {
  const expected = Array.from({ length: count }, () => ANA_QUICK_FACTS).flat();
  const labels = ANA_QUICK_FACTS.map(([label]) => label).join("|");
  expect([...html.matchAll(new RegExp(`>(${labels})</td>`, "g"))].map((m) => m[1])).toEqual(
    expected.map(([label]) => label),
  );
  expect(
    [...text.matchAll(new RegExp(`^(${labels}): (.+)$`, "gm"))].map((m) => [m[1], m[2]]),
  ).toEqual(expected);
  for (const [label, value] of ANA_QUICK_FACTS) {
    expect(html).toContain(`>${escapeHtml(label === "FROM" ? "Brazil" : value)}</td>`);
  }
  expect(html.match(/>🇧🇷<\/td>/g)).toHaveLength(count);
  expect(html.match(/>TRANSFER<\/span>/g)).toHaveLength(count);
  expect(html).not.toMatch(/AVAILABLE:|GPA <strong|High School Graduation|College Start Date/);
  expect(text).not.toMatch(/High School Graduation|College Start Date/);
}
