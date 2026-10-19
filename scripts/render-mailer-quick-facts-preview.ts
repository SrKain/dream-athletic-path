import { mkdirSync, writeFileSync } from "node:fs";
import { ANA_EMAIL_DATA } from "../src/lib/email/__fixtures__/ana-carolina";
import { renderRecruitEmail } from "../src/lib/email/recruit-email-template";

// Pure rendering only: no database, provider client or real email dispatch.
const result = renderRecruitEmail({
  ...ANA_EMAIL_DATA,
  customSubject: "Ana Carolina Martins — Quick Facts preview",
  customIntroduction:
    "Layout demonstration using the supplied Quick Facts. Biography and fit text are illustrative; no athlete photo was supplied.",
});
const directory = "docs/email-previews";
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/ana-carolina-quick-facts.html`, result.html);
writeFileSync(`${directory}/ana-carolina-quick-facts.txt`, result.text);
console.log(`Generated ${directory}/ana-carolina-quick-facts.{html,txt}; no email sent.`);
