// Renders the SecPrep logo and app icon variants into assets/ and www/img/ (needs Playwright + Chromium).
// Then run `npm run assets` and `node scripts/ios-icon-appearances.js` to produce every iOS/Android size.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const NAVY1 = "#0d1f57", NAVY2 = "#071233", RED = "#e3202c", BLUE = "#1d3f9f", WHITE = "#ffffff", SHIELD = "#0b1a49";

// Logo parts in a 1024 × 1024 box.
const shieldPath = "M512 96 L792 196 V430 C792 590 676 704 512 766 C348 704 232 590 232 430 V196 Z";
const stripes = (o = 1) => `<g opacity="${o}"><path d="M-40 724 L1064 170 L1064 300 L-40 854 Z" fill="${RED}"/><path d="M-40 854 L1064 300 L1064 380 L-40 934 Z" fill="${BLUE}"/></g>`;
const shield = ({ fill = SHIELD, outer = WHITE, inner = RED, check = WHITE } = {}) => `
  <path d="${shieldPath}" fill="${outer}" transform="translate(512 431) scale(1.12) translate(-512 -431)"/>
  <path d="${shieldPath}" fill="${inner}" transform="translate(512 431) scale(1.04) translate(-512 -431)"/>
  <path d="${shieldPath}" fill="${fill}"/>
  <path d="M388 430 L478 520 L650 340" fill="none" stroke="${check}" stroke-width="66" stroke-linecap="square" stroke-linejoin="miter"/>`;
const word = ({ sec = WHITE, prep = RED } = {}) => `
  <text x="512" y="938" text-anchor="middle" font-family="Inter, 'Inter Display', sans-serif" font-weight="900" font-style="italic" font-size="196" letter-spacing="-6">
    <tspan fill="${sec}">Sec</tspan><tspan fill="${prep}">Prep</tspan></text>`;
const svg = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${defs}${body}</svg>`;
const bgDefs = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${NAVY1}"/><stop offset="1" stop-color="${NAVY2}"/></linearGradient></defs>`;
const background = `<rect width="1024" height="1024" fill="url(#bg)"/>${stripes()}`;
// Mark (shield + word) scaled around the center, for Android's adaptive-icon safe zone and splash screens.
const mark = (scale, opts = {}) => `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${opts.stripes ? stripes(opts.stripes) : ""}${shield(opts.shield)}${word(opts.word)}</g>`;

const FILES = {
  // Full icon: iOS light, Android legacy, web
  "assets/icon-only.png": svg(background + mark(0.88), bgDefs),
  // Android adaptive icon layers
  "assets/icon-background.png": svg(background, bgDefs),
  "assets/icon-foreground.png": svg(mark(0.62)),
  // iOS 18 dark icon: no navy square, the system draws a dark background
  "assets/icon-dark.png": svg(stripes(0.9) + mark(0.88, { shield: { fill: "#13265f" } })),
  // iOS 18 tinted icon: grayscale; the system applies the user's tint
  "assets/icon-tinted.png": svg(mark(0.88, { shield: { fill: "#2a2a2a", outer: "#ffffff", inner: "#9a9a9a", check: "#ffffff" }, word: { sec: "#ffffff", prep: "#bdbdbd" } })),
  // Splash screens
  "assets/splash.png": null, "assets/splash-dark.png": null,
};

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (file, size, html, transparent) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(root, file), omitBackground: !!transparent, clip: { x: 0, y: 0, width: size, height: size } });
  };
  for (const [file, s] of Object.entries(FILES)) if (s) await shot(file, 1024, s, !file.endsWith("icon-only.png") && !file.endsWith("icon-background.png"));
  const splash = (bg) => `<div style="width:2732px;height:2732px;background:${bg};display:flex;align-items:center;justify-content:center"><div style="width:900px;height:900px">${svg(mark(1, { stripes: 0 }))}</div></div>`;
  await shot("assets/splash.png", 2732, splash(`linear-gradient(160deg,${NAVY1},${NAVY2})`));
  await shot("assets/splash-dark.png", 2732, splash("#050a1c"));
  // In-app logo (rounded square, vector) used on the welcome and login screens
  fs.mkdirSync(path.join(root, "www/img"), { recursive: true });
  fs.writeFileSync(path.join(root, "www/img/logo.svg"), svg(`<clipPath id="r"><rect width="1024" height="1024" rx="230"/></clipPath><g clip-path="url(#r)">${background}${mark(0.88)}</g>`, bgDefs));
  await b.close(); console.log("assets/ and www/img/logo.svg written");
})();
