// Renders the source icon/splash images in assets/ (needs Playwright + Chromium).
// Then run `npm run assets` to produce every iOS/Android size.
const { chromium } = require("playwright");
const path = require("path");
const out = f => path.join(__dirname, "../assets", f);
const shield = (fill, check) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 8 L84 20 V48 C84 70 69 85 50 92 C31 85 16 70 16 48 V20 Z" fill="${fill}"/><path d="M34 50 L46 62 L68 38" fill="none" stroke="${check}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const page = (size, bg, inner, fill, check) => `<html><body style="margin:0;width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center"><div style="width:${inner}px;height:${inner}px">${inner ? shield(fill, check) : ""}</div></body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (f, size, html, transparent) => { await p.setViewportSize({ width: size, height: size }); await p.setContent(html); await p.screenshot({ path: out(f), omitBackground: !!transparent }); };
  await shot("icon-only.png", 1024, page(1024, "#0f6e7a", 640, "#ffffff", "#0f6e7a"));
  await shot("icon-foreground.png", 1024, page(1024, "transparent", 520, "#ffffff", "#0f6e7a"), true);
  await shot("icon-background.png", 1024, page(1024, "#0f6e7a", 0));
  await shot("splash.png", 2732, page(2732, "#0f6e7a", 700, "#ffffff", "#0f6e7a"));
  await shot("splash-dark.png", 2732, page(2732, "#0c131b", 700, "#3fb6c4", "#0c131b"));
  await shot("notification.png", 96, page(96, "transparent", 84, "#ffffff", "rgba(0,0,0,0)"), true);
  await b.close(); console.log("assets/ written");
})();
