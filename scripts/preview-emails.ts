import fs from "fs";
import path from "path";
import {
  renderRecruitEmail,
  renderMultiAthleteRecruitEmail,
} from "../src/lib/email/recruit-email-template";
import { renderCatalogEmail } from "../src/lib/email/recruit-email-catalog-template";

const outputDir = path.join(process.cwd(), "docs", "email-previews");
fs.mkdirSync(outputDir, { recursive: true });

const dummy1 = {
  athleteId: "demo-1",
  athleteName: "Mariana Silva",
  athleteSlug: "mariana-silva",
  photoUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=500&q=80",
  positionName: "Outside Hitter",
  sportName: "Volleyball",
  heightCm: 184,
  nationality: "BR",
  highSchoolGraduation: "2027",
  graduationYear: 2027,
  gpa: 3.9,
  athleteStatus: "Sophomore",
  highlightNote: "Dominant six-rotation outside hitter with terminal attack.",
  budget: "$12,000/yr",
  recipientEmail: "coach@university.edu",
};

const dummy2 = {
  athleteId: "demo-2",
  athleteName: "Carolina Becker",
  athleteSlug: "carolina-becker",
  photoUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=500&q=80",
  positionName: "Setter",
  sportName: "Volleyball",
  heightCm: 178,
  nationality: "BR",
  highSchoolGraduation: "2027",
  graduationYear: 2027,
  gpa: 4.0,
  athleteStatus: "Freshman",
  highlightNote: "Elite hand speed, deceptive distribution and tactical leadership.",
  recipientEmail: "coach@university.edu",
};

const dummy3 = {
  athleteId: "demo-3",
  athleteName: "Beatriz Santos",
  athleteSlug: "beatriz-santos",
  photoUrl: "https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=500&q=80",
  positionName: "Middle Blocker",
  sportName: "Volleyball",
  heightCm: 191,
  nationality: "BR",
  highSchoolGraduation: "2027",
  graduationYear: 2027,
  gpa: 3.7,
  athleteStatus: "Junior",
  highlightNote: "Lateral speed and shutdown blocking on slide attacks.",
  recipientEmail: "coach@university.edu",
};

const dummy4 = {
  athleteId: "demo-4",
  athleteName: "Larissa Oliveira",
  athleteSlug: "larissa-oliveira",
  photoUrl: "https://images.unsplash.com/photo-1526676037777-05a232554f77?w=500&q=80",
  positionName: "Libero / DS",
  sportName: "Volleyball",
  heightCm: 168,
  nationality: "BR",
  highSchoolGraduation: "2027",
  graduationYear: 2027,
  gpa: 3.8,
  athleteStatus: "Freshman",
  highlightNote: "Quick floor defense with 2.4+ pass rating on jump serves.",
  recipientEmail: "coach@university.edu",
};

console.log("Generating email previews...");

// 1. Single
const single = renderRecruitEmail(dummy1);
fs.writeFileSync(path.join(outputDir, "preview-single.html"), single.html, "utf8");

// 2. Multi (4 athletes)
const multi = renderMultiAthleteRecruitEmail({
  athletes: [dummy1, dummy2, dummy3, dummy4],
  coachName: "Smith",
  institutionName: "Stanford Athletics",
  recipientEmail: "coach@stanford.edu",
});
fs.writeFileSync(path.join(outputDir, "preview-multi.html"), multi.html, "utf8");

// 3. Catalog
const catalog = renderCatalogEmail({
  coachName: "Smith",
  institutionName: "Collegiate Scouting Showcase",
  recipientEmail: "coach@stanford.edu",
});
fs.writeFileSync(path.join(outputDir, "preview-catalog.html"), catalog.html, "utf8");

console.log(`Previews saved to: ${outputDir}`);
