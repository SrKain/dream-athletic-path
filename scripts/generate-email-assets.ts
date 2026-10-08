import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { Resvg } from "@resvg/resvg-js";

const rootDir = process.cwd();
const emailDir = path.join(rootDir, "public", "email");
const iconsDir = path.join(emailDir, "icons");
const flagsDir = path.join(emailDir, "flags");

fs.mkdirSync(iconsDir, { recursive: true });
fs.mkdirSync(flagsDir, { recursive: true });

function renderSvgToPng(svgStr: string, outPath: string, width?: number) {
  const resvg = new Resvg(svgStr, {
    fitTo: width ? { mode: "width", value: width } : undefined,
    font: {
      loadSystemFonts: true,
    },
  });
  const pngData = resvg.render().asPng();
  fs.writeFileSync(outPath, pngData);
}

function renderSvgToJpg(svgStr: string, outPath: string, width?: number) {
  const tempPng = outPath.replace(/\.jpg$/, ".tmp.png");
  renderSvgToPng(svgStr, tempPng, width);
  try {
    execSync(`convert "${tempPng}" -quality 88 "${outPath}"`, { stdio: "pipe" });
  } finally {
    if (fs.existsSync(tempPng)) fs.unlinkSync(tempPng);
  }
}

console.log("Generating Logo PNG...");
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 130" width="600" height="130">
  <defs>
    <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f69e00" />
      <stop offset="100%" stop-color="#ffb326" />
    </linearGradient>
    <linearGradient id="shield-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#043217" />
      <stop offset="100%" stop-color="#021c0c" />
    </linearGradient>
  </defs>

  <!-- Left Shield Icon -->
  <g transform="translate(10, 10)">
    <rect x="0" y="0" width="110" height="110" rx="26" fill="url(#shield-grad)" stroke="#f69e00" stroke-width="4" stroke-opacity="0.6"/>
    <circle cx="55" cy="55" r="38" fill="none" stroke="url(#gold-grad)" stroke-width="3" stroke-dasharray="60 10 40 10" />
    <text x="55" y="66" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="url(#gold-grad)" letter-spacing="-1">GTG</text>
  </g>

  <!-- Main Text -->
  <g transform="translate(138, 20)">
    <text x="0" y="38" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="38" font-weight="900" fill="#084323" letter-spacing="0.5">GO TEAM GO</text>
    <text x="310" y="38" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="26" font-weight="800" fill="#f69e00" letter-spacing="1">AGENCY</text>
    
    <!-- Tagline -->
    <text x="2" y="74" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="12.5" font-weight="700" fill="#4b6353" letter-spacing="2.8">PEOPLE · OPPORTUNITIES · A BRIGHTER TOMORROW</text>
  </g>
</svg>`;
renderSvgToPng(logoSvg, path.join(emailDir, "logo-gtg.png"), 600);

console.log("Generating Handwritten PNGs...");
const moreThanAGameSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 90" width="340" height="90">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <text x="170" y="46" text-anchor="middle" font-family="DejaVu Serif, Georgia, cursive, sans-serif" font-style="italic" font-size="34" font-weight="bold" fill="#ffffff" filter="url(#shadow)">
    more than a game
  </text>
  <path d="M 60 62 Q 170 76 280 60" fill="none" stroke="#f69e00" stroke-width="4" stroke-linecap="round"/>
</svg>`;
renderSvgToPng(moreThanAGameSvg, path.join(emailDir, "handwritten-more-than-a-game.png"), 340);

const differentAthletesSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 90" width="420" height="90">
  <text x="210" y="48" text-anchor="middle" font-family="DejaVu Serif, Georgia, cursive, sans-serif" font-style="italic" font-size="30" font-weight="bold" fill="#084323">
    Different Athletes Brighter Futures
  </text>
  <path d="M 40 68 Q 210 82 380 66" fill="none" stroke="#f69e00" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;
renderSvgToPng(
  differentAthletesSvg,
  path.join(emailDir, "handwritten-different-athletes.png"),
  420,
);

console.log("Generating Hero Background JPG...");
const heroSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1360 560" width="1360" height="560">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#032011" />
      <stop offset="40%" stop-color="#05301a" />
      <stop offset="70%" stop-color="#084323" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#0b522b" stop-opacity="0.65" />
    </linearGradient>
    <linearGradient id="netGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.4" />
    </linearGradient>
  </defs>

  <!-- Deep Base Background -->
  <rect width="1360" height="560" fill="#032011" />

  <!-- Right side court atmosphere / energetic monochrome court background -->
  <g transform="translate(680, 0)">
    <!-- Court floor perspective -->
    <path d="M 0 380 L 680 320 L 680 560 L 0 560 Z" fill="#14261d" opacity="0.6"/>
    <!-- Court lines -->
    <line x1="60" y1="560" x2="420" y2="340" stroke="#f69e00" stroke-width="4" opacity="0.3"/>
    <line x1="280" y1="560" x2="520" y2="330" stroke="#ffffff" stroke-width="3" opacity="0.25"/>

    <!-- Volleyball Net Silhouette -->
    <rect x="180" y="80" width="500" height="260" fill="url(#netGrad)" stroke="#ffffff" stroke-width="2" stroke-opacity="0.2" />
    <!-- Net grid -->
    <line x1="180" y1="120" x2="680" y2="120" stroke="#ffffff" stroke-width="1" stroke-opacity="0.12"/>
    <line x1="180" y1="160" x2="680" y2="160" stroke="#ffffff" stroke-width="1" stroke-opacity="0.12"/>
    <line x1="180" y1="200" x2="680" y2="200" stroke="#ffffff" stroke-width="1" stroke-opacity="0.12"/>
    <line x1="180" y1="240" x2="680" y2="240" stroke="#ffffff" stroke-width="1" stroke-opacity="0.12"/>
    <line x1="180" y1="280" x2="680" y2="280" stroke="#ffffff" stroke-width="1" stroke-opacity="0.12"/>

    <!-- Dynamic Athletic Volleyball Player Silhouette Spiking -->
    <g transform="translate(240, 20) scale(1.15)">
      <!-- Ball high above net -->
      <circle cx="210" cy="80" r="26" fill="#f8faf5" stroke="#f69e00" stroke-width="4"/>
      <path d="M 195 65 Q 210 80 225 95" stroke="#05301a" stroke-width="2.5" fill="none"/>
      <path d="M 225 65 Q 210 80 195 95" stroke="#05301a" stroke-width="2.5" fill="none"/>

      <!-- Player body leaping -->
      <circle cx="130" cy="150" r="18" fill="#d2ded6"/>
      <path d="M 125 168 Q 115 220 100 270 L 135 260 Q 145 210 140 168 Z" fill="#e3eee7"/>
      <path d="M 125 180 L 105 255" stroke="#084323" stroke-width="5"/>
      <path d="M 136 172 Q 170 120 200 95" stroke="#e3eee7" stroke-width="16" stroke-linecap="round"/>
      <circle cx="200" cy="95" r="9" fill="#e3eee7"/>
      <path d="M 120 180 Q 95 190 70 195" stroke="#c0d4c8" stroke-width="14" stroke-linecap="round"/>
      <path d="M 105 270 Q 80 320 65 375 L 85 385 Q 102 335 125 285 Z" fill="#b0c8ba"/>
      <path d="M 125 275 Q 120 335 130 395 L 150 390 Q 140 335 135 275 Z" fill="#9cb6a7"/>
      <path d="M 55 375 L 85 390 L 70 405 Z" fill="#f69e00"/>
      <path d="M 125 390 L 155 395 L 145 410 Z" fill="#f69e00"/>
    </g>
  </g>

  <!-- Dominant Left-to-Center Dark Emerald Gradient Overlay -->
  <rect width="1360" height="560" fill="url(#bgGrad)" />

  <!-- Subtle Editorial Graphic Line Accents -->
  <line x1="0" y1="556" x2="1360" y2="556" stroke="#f69e00" stroke-width="8"/>
</svg>`;
renderSvgToJpg(heroSvg, path.join(emailDir, "hero-email.jpg"), 1360);

console.log("Generating Icons PNGs...");
const icons: Record<string, string> = {
  "academic.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
    <path d="M 24 8 L 4 18 L 24 28 L 44 18 Z" fill="#084323" stroke="#084323" stroke-width="2" stroke-linejoin="round"/>
    <path d="M 10 21.5 L 10 33 Q 24 41 38 33 L 38 21.5" fill="none" stroke="#084323" stroke-width="3" stroke-linecap="round"/>
    <path d="M 40 20 L 40 34" stroke="#f69e00" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="40" cy="35" r="2.5" fill="#f69e00"/>
  </svg>`,
  "film.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
    <rect x="6" y="8" width="36" height="32" rx="6" fill="#084323"/>
    <path d="M 20 18 L 32 24 L 20 30 Z" fill="#f69e00"/>
  </svg>`,
  "users.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
    <circle cx="18" cy="16" r="7" fill="#084323"/>
    <path d="M 6 38 C 6 29 12 26 18 26 C 24 26 30 29 30 38 Z" fill="#084323"/>
    <circle cx="34" cy="18" r="5.5" fill="#084323" opacity="0.8"/>
    <path d="M 28 38 C 28 32 32 29 37 29 C 42 29 46 32 46 38 Z" fill="#084323" opacity="0.8"/>
  </svg>`,
  "globe.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
    <circle cx="24" cy="24" r="18" fill="none" stroke="#084323" stroke-width="3"/>
    <ellipse cx="24" cy="24" rx="8" ry="18" fill="none" stroke="#084323" stroke-width="2.5"/>
    <line x1="6" y1="24" x2="42" y2="24" stroke="#084323" stroke-width="2.5"/>
    <line x1="9" y1="15" x2="39" y2="15" stroke="#084323" stroke-width="2"/>
    <line x1="9" y1="33" x2="39" y2="33" stroke="#084323" stroke-width="2"/>
  </svg>`,
  "height.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="12" cy="7" r="3.5" fill="#084323"/>
    <path d="M 7 15 C 7 12 9 12 12 12 C 15 12 17 12 17 15 L 17 21 L 14 21 L 14 28 L 10 28 L 10 21 L 7 21 Z" fill="#084323"/>
    <line x1="24" y1="4" x2="24" y2="28" stroke="#f69e00" stroke-width="2" stroke-linecap="round"/>
    <path d="M 21 7 L 24 4 L 27 7" fill="none" stroke="#f69e00" stroke-width="2" stroke-linecap="round"/>
    <path d="M 21 25 L 24 28 L 27 25" fill="none" stroke="#f69e00" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  "grad-cap.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <path d="M 16 6 L 3 13 L 16 20 L 29 13 Z" fill="#084323"/>
    <path d="M 7 15.5 L 7 23 Q 16 28 25 23 L 25 15.5" fill="none" stroke="#084323" stroke-width="2.5"/>
    <path d="M 26 14.5 L 26 23" stroke="#f69e00" stroke-width="1.8"/>
  </svg>`,
  "stats.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <rect x="5" y="16" width="5" height="12" rx="1.5" fill="#084323"/>
    <rect x="13" y="10" width="5" height="18" rx="1.5" fill="#084323"/>
    <rect x="21" y="4" width="5" height="24" rx="1.5" fill="#f69e00"/>
  </svg>`,
  "star.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <path d="M 16 2 L 20.3 10.8 L 30 12.2 L 23 19 L 24.7 28.6 L 16 24 L 7.3 28.6 L 9 19 L 2 12.2 L 11.7 10.8 Z" fill="#f69e00"/>
  </svg>`,
  "dollar.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="13" fill="none" stroke="#084323" stroke-width="2.5"/>
    <text x="16" y="21" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="900" fill="#084323">$</text>
  </svg>`,
  "play-circle.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <circle cx="18" cy="18" r="16" fill="#ffffff"/>
    <path d="M 14 11 L 25 18 L 14 25 Z" fill="#084323"/>
  </svg>`,
  "arrow-gold.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <path d="M 8 16 L 24 16 M 17 9 L 24 16 L 17 23" fill="none" stroke="#f69e00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  "email.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <rect x="4" y="6" width="24" height="20" rx="4" fill="none" stroke="#084323" stroke-width="2.5"/>
    <path d="M 4 8 L 16 17 L 28 8" fill="none" stroke="#084323" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  "instagram.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <rect x="4" y="4" width="24" height="24" rx="7" fill="none" stroke="#084323" stroke-width="2.5"/>
    <circle cx="16" cy="16" r="6" fill="none" stroke="#084323" stroke-width="2.5"/>
    <circle cx="23" cy="9" r="1.5" fill="#f69e00"/>
  </svg>`,
  "website.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="12" fill="none" stroke="#084323" stroke-width="2.5"/>
    <ellipse cx="16" cy="16" rx="5" ry="12" fill="none" stroke="#084323" stroke-width="2"/>
    <line x1="4" y1="16" x2="28" y2="16" stroke="#084323" stroke-width="2"/>
  </svg>`,
};

for (const [name, svg] of Object.entries(icons)) {
  renderSvgToPng(svg, path.join(iconsDir, name), 64);
}

console.log("Generating Flags PNGs...");
const flags: Record<string, string> = {
  "bra.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c1"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c1)">
      <rect width="64" height="64" fill="#009c3b"/>
      <polygon points="32,8 58,32 32,56 6,32" fill="#ffdf00"/>
      <circle cx="32" cy="32" r="15" fill="#002776"/>
      <path d="M 18 34 Q 32 28 46 34" stroke="#ffffff" stroke-width="2.5" fill="none"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "usa.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c2"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c2)">
      <rect width="64" height="64" fill="#bf0a30"/>
      <line x1="0" y1="10" x2="64" y2="10" stroke="#ffffff" stroke-width="5"/>
      <line x1="0" y1="20" x2="64" y2="20" stroke="#ffffff" stroke-width="5"/>
      <line x1="0" y1="30" x2="64" y2="30" stroke="#ffffff" stroke-width="5"/>
      <line x1="0" y1="40" x2="64" y2="40" stroke="#ffffff" stroke-width="5"/>
      <line x1="0" y1="50" x2="64" y2="50" stroke="#ffffff" stroke-width="5"/>
      <line x1="0" y1="60" x2="64" y2="60" stroke="#ffffff" stroke-width="5"/>
      <rect x="0" y="0" width="32" height="35" fill="#002868"/>
      <circle cx="16" cy="17" r="8" fill="#ffffff" opacity="0.9"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "can.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c3"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c3)">
      <rect width="64" height="64" fill="#ff0000"/>
      <rect x="16" y="0" width="32" height="64" fill="#ffffff"/>
      <polygon points="32,16 35,26 44,24 38,32 42,39 34,36 32,46 30,36 22,39 26,32 20,24 29,26" fill="#ff0000"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "col.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c4"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c4)">
      <rect x="0" y="0" width="64" height="32" fill="#fcd116"/>
      <rect x="0" y="32" width="64" height="16" fill="#003893"/>
      <rect x="0" y="48" width="64" height="16" fill="#ce1126"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "arg.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c5"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c5)">
      <rect x="0" y="0" width="64" height="21" fill="#74acdf"/>
      <rect x="0" y="21" width="64" height="22" fill="#ffffff"/>
      <rect x="0" y="43" width="64" height="21" fill="#74acdf"/>
      <circle cx="32" cy="32" r="5" fill="#f6b40e"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "dom.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c6"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c6)">
      <rect x="0" y="0" width="32" height="32" fill="#002f6c"/>
      <rect x="32" y="0" width="32" height="32" fill="#ce1126"/>
      <rect x="0" y="32" width="32" height="32" fill="#ce1126"/>
      <rect x="32" y="32" width="32" height="32" fill="#002f6c"/>
      <line x1="32" y1="0" x2="32" y2="64" stroke="#ffffff" stroke-width="8"/>
      <line x1="0" y1="32" x2="64" y2="32" stroke="#ffffff" stroke-width="8"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "pri.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c7"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c7)">
      <rect width="64" height="64" fill="#ed1b24"/>
      <line x1="0" y1="18" x2="64" y2="18" stroke="#ffffff" stroke-width="9"/>
      <line x1="0" y1="46" x2="64" y2="46" stroke="#ffffff" stroke-width="9"/>
      <polygon points="0,0 35,32 0,64" fill="#0035ad"/>
      <polygon points="12,24 14,29 19,29 15,33 17,38 12,35 7,38 9,33 5,29 10,29" fill="#ffffff"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "ita.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c8"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c8)">
      <rect x="0" y="0" width="21" height="64" fill="#009246"/>
      <rect x="21" y="0" width="22" height="64" fill="#ffffff"/>
      <rect x="43" y="0" width="21" height="64" fill="#ce2b37"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "esp.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c9"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c9)">
      <rect x="0" y="0" width="64" height="16" fill="#aa151b"/>
      <rect x="0" y="16" width="64" height="32" fill="#f1bf00"/>
      <rect x="0" y="48" width="64" height="16" fill="#aa151b"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "deu.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <clipPath id="c10"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#c10)">
      <rect x="0" y="0" width="64" height="21" fill="#000000"/>
      <rect x="0" y="21" width="64" height="22" fill="#dd0000"/>
      <rect x="0" y="43" width="64" height="21" fill="#ffce00"/>
    </g>
    <circle cx="32" cy="32" r="30" fill="none" stroke="#e3e9dc" stroke-width="2"/>
  </svg>`,
  "default.png": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <circle cx="32" cy="32" r="30" fill="#084323"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#f69e00" stroke-width="3"/>
    <ellipse cx="32" cy="32" rx="7" ry="18" fill="none" stroke="#f69e00" stroke-width="2"/>
    <line x1="14" y1="32" x2="50" y2="32" stroke="#f69e00" stroke-width="2"/>
  </svg>`,
};

for (const [name, svg] of Object.entries(flags)) {
  renderSvgToPng(svg, path.join(flagsDir, name), 64);
}

console.log("All email assets generated successfully!");
