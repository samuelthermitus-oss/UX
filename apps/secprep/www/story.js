/* SecPrep story engine: animated scenario videos built from a reusable kit
   (places, characters, devices, connections) seen through a moving camera,
   with HTML close-ups (emails, login pages, terminals, phones…) on top.
   Episodes live in data/stories.js. World size is 1600 × 900. */
(function(){
"use strict";
const X = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let LANG = "en";
const tx = v => (v && typeof v === "object" && !Array.isArray(v)) ? (v[LANG] ?? v.en ?? "") : (v ?? "");
const K = k => k ? ` class="k" data-k="${k}"` : "";
// For elements that already carry a class: add the layer class + key without a second class attribute
const KC = (k, cls) => ` class="${cls}${k?" k":""}"${k?` data-k="${k}"`:""}`;

/* ---------- places ---------- */
const sky = (x,y,w,h,mode) => {
  const g = mode==="night" ? ["#0b1430","#24345e"] : mode==="dusk" ? ["#1c2a55","#f08a5d"] : ["#5f9fe0","#cfe6ff"];
  const lights = mode!=="day";
  let city=""; const bw=w/7;
  for(let i=0;i<7;i++){ const bh=h*(.35+((i*37)%5)/10); city+=`<rect x="${x+i*bw+4}" y="${y+h-bh}" width="${bw-8}" height="${bh}" fill="${mode==="day"?"#7d93b5":"#141b33"}"/>`;
    if(lights) for(let j=0;j<3;j++) city+=`<rect x="${x+i*bw+12+j*12}" y="${y+h-bh+16+((i+j)%3)*22}" width="7" height="7" fill="#ffd36b" opacity=".8"/>`; }
  return `<defs><linearGradient id="sky${x}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/></linearGradient></defs>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="url(#sky${x})"/>${city}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="none" stroke="#141a24" stroke-width="14"/><line x1="${x+w/2}" y1="${y}" x2="${x+w/2}" y2="${y+h}" stroke="#141a24" stroke-width="10"/>`;
};
const lamp = (x,len,warm=true) => `<g><line x1="${x}" y1="0" x2="${x}" y2="${len}" stroke="#0d0907" stroke-width="4"/><path d="M${x-38} ${len}h76l-14-34h-48z" fill="${warm?"#c9893d":"#8fa1b8"}"/><circle class="lamp-glow" cx="${x}" cy="${len+40}" r="150" fill="url(#${warm?"glowW":"glowC"})"/></g>`;
const ENV = {
  cafe: () => `<rect width="1600" height="900" fill="url(#wallCafe)"/><rect y="700" width="1600" height="200" fill="url(#floorWood)"/>${sky(1060,110,440,300,"dusk")}${lamp(300,150)}${lamp(760,130)}<rect x="0" y="470" width="300" height="230" fill="#24160f"/><rect x="0" y="456" width="310" height="22" rx="4" fill="#8a5a36"/>`,
  office: () => `<rect width="1600" height="900" fill="url(#wallOffice)"/><rect y="710" width="1600" height="190" fill="#2f3743"/>${sky(1080,100,420,300,"day")}${lamp(420,110,false)}${lamp(900,110,false)}<g transform="translate(120 520)"><rect x="-20" y="80" width="80" height="110" rx="8" fill="#5b6b7c"/><path d="M20 80 C -30 20, -10 -30, 20 -40 C 50 -30, 70 20, 20 80" fill="#3f8f5a"/><path d="M20 80 C 0 30, 10 -10, 40 -20" stroke="#2f6e45" stroke-width="4" fill="none"/></g>`,
  hospital: () => `<rect width="1600" height="900" fill="url(#wallHosp)"/><rect y="700" width="1600" height="200" fill="#25343a"/>${sky(1120,110,380,260,"night")}<g transform="translate(760 170)"><circle r="46" fill="#e8f0f2" stroke="#9fb3b8" stroke-width="6"/><line x1="0" y1="0" x2="0" y2="-30" stroke="#223" stroke-width="5" stroke-linecap="round"/><line x1="0" y1="0" x2="12" y2="6" stroke="#223" stroke-width="5" stroke-linecap="round"/></g><rect x="0" y="560" width="1600" height="16" fill="#3e7f86" opacity=".6"/>${lamp(380,110,false)}<path d="M40 470 h40 v40 h40 v40 h-40 v40 h-40 v-40 h-40 v-40 h40 z" fill="#d9534f" opacity=".85" transform="translate(40 -260) scale(.8)"/>`,
  serverroom: () => `<rect width="1600" height="900" fill="#0d1522"/><g stroke="#1c2940" stroke-width="2">${Array.from({length:12},(_,i)=>`<line x1="${i*140}" y1="720" x2="${i*140-60}" y2="900"/>`).join("")}<line x1="0" y1="780" x2="1600" y2="780"/><line x1="0" y1="850" x2="1600" y2="850"/></g><rect y="710" width="1600" height="6" fill="#1c2940"/>${Array.from({length:5},(_,i)=>`<rect x="${80+i*320}" y="20" width="200" height="10" rx="5" fill="#9fd6ff" opacity=".6"/>`).join("")}`,
  soc: () => `<rect width="1600" height="900" fill="#0f1726"/><rect y="720" width="1600" height="180" fill="#162034"/>${lamp(400,90,false)}${lamp(1200,90,false)}`,
  bank: () => `<rect width="1600" height="900" fill="url(#wallBank)"/><rect y="710" width="1600" height="190" fill="#3a2c22"/>${sky(1080,100,420,280,"day")}${lamp(500,110)}<rect x="60" y="120" width="300" height="70" rx="8" fill="#1d3f9f"/><text x="210" y="166" text-anchor="middle" font-size="34" font-weight="800" fill="#fff" font-family="system-ui">FINANCE</text>`,
  home: () => `<rect width="1600" height="900" fill="#241d33"/><rect y="710" width="1600" height="190" fill="#2e2438"/>${sky(140,120,360,260,"night")}${lamp(900,120)}`,
  split: () => `<rect width="800" height="900" fill="url(#wallOffice)"/><rect x="800" width="800" height="900" fill="#2b3a52"/><rect y="710" width="1600" height="190" fill="#2f3743"/><rect x="792" y="0" width="16" height="900" fill="#0d1320"/>${lamp(400,110,false)}${lamp(1200,110,false)}`
};
const DEFS = `<defs>
 <linearGradient id="wallCafe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a24"/><stop offset="1" stop-color="#2a1d19"/></linearGradient>
 <linearGradient id="floorWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4630"/><stop offset="1" stop-color="#4a2f20"/></linearGradient>
 <linearGradient id="wallOffice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4a63"/><stop offset="1" stop-color="#2a374c"/></linearGradient>
 <linearGradient id="wallHosp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21363b"/><stop offset="1" stop-color="#18282c"/></linearGradient>
 <linearGradient id="wallBank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3224"/><stop offset="1" stop-color="#2c251b"/></linearGradient>
 <radialGradient id="glowW"><stop offset="0" stop-color="#ffd59a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd59a" stop-opacity="0"/></radialGradient>
 <radialGradient id="glowC"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".5"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></radialGradient>
 <linearGradient id="tun" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3dd68c" stop-opacity=".25"/><stop offset=".5" stop-color="#3dd68c" stop-opacity=".55"/><stop offset="1" stop-color="#3dd68c" stop-opacity=".25"/></linearGradient>
</defs>`;

/* ---------- characters (original, simple flat style) ---------- */
function person(p){
  const {x,y,skin="#c98b62",hair="short",hairColor="#2a1a14",shirt="#2f7a8a",hood=false,glasses=false,typing=true,stand=false,k}=p;
  const hx=x, hy=y-150;
  const body = stand
    ? `<g class="breath"><path d="M${x-70} ${y+120} L${x-62} ${y-70} C${x-60} ${y-96},${x+60} ${y-96},${x+62} ${y-70} L${x+70} ${y+120} Z" fill="${shirt}"/></g><rect x="${x-50}" y="${y+120}" width="36" height="150" rx="14" fill="#263040"/><rect x="${x+14}" y="${y+120}" width="36" height="150" rx="14" fill="#263040"/>`
    : `<g class="breath"><path d="M${x-80} ${y+5} C${x-80} ${y-70},${x-40} ${y-100},${x} ${y-100} C${x+40} ${y-100},${x+80} ${y-70},${x+80} ${y+5} Z" fill="${shirt}"/></g>`;
  const hoodShape = hood ? `<path d="M${hx-48} ${hy+2} C${hx-48} ${hy-50},${hx+48} ${hy-50},${hx+48} ${hy+2} L${hx+48} ${hy+34} C${hx+30} ${hy+54},${hx-30} ${hy+54},${hx-48} ${hy+34} Z" fill="${shirt}"/>` : "";
  const hairs = {
    short:`<path d="M${hx-44} ${hy} C${hx-50} ${hy-58},${hx+50} ${hy-64},${hx+44} ${hy-4} C${hx+36} ${hy-30},${hx} ${hy-38},${hx-30} ${hy-22} Z" fill="${hairColor}"/>`,
    long:`<path d="M${hx-44} ${hy} C${hx-50} ${hy-60},${hx+50} ${hy-64},${hx+44} ${hy-4} C${hx+36} ${hy-30},${hx} ${hy-38},${hx-30} ${hy-22} Z" fill="${hairColor}"/><path d="M${hx-44} ${hy} C${hx-54} ${hy+40},${hx-46} ${hy+70},${hx-34} ${hy+76} L${hx-28} ${hy+6} Z" fill="${hairColor}"/><path d="M${hx+44} ${hy} C${hx+54} ${hy+40},${hx+46} ${hy+70},${hx+34} ${hy+76} L${hx+28} ${hy+6} Z" fill="${hairColor}"/>`,
    bun:`<circle cx="${hx}" cy="${hy-50}" r="20" fill="${hairColor}"/><path d="M${hx-44} ${hy} C${hx-50} ${hy-56},${hx+50} ${hy-56},${hx+44} ${hy} C${hx+30} ${hy-30},${hx-30} ${hy-30},${hx-44} ${hy} Z" fill="${hairColor}"/>`,
    curly:`<g fill="${hairColor}">${[-36,-18,0,18,36].map((dx,i)=>`<circle cx="${hx+dx}" cy="${hy-36+Math.abs(dx)/3}" r="18"/>`).join("")}<circle cx="${hx-42}" cy="${hy-8}" r="13"/><circle cx="${hx+42}" cy="${hy-8}" r="13"/></g>`,
    none:"" };
  const head = `${hood?"":""}<circle cx="${hx}" cy="${hy}" r="${hood?30:44}" fill="${skin}"/>`;
  const face = `<circle cx="${hx-12}" cy="${hy+4}" r="4" fill="#1b1b1b"/><circle cx="${hx+12}" cy="${hy+4}" r="4" fill="#1b1b1b"/>${hood?"":`<path d="M${hx-10} ${hy+24} q10 7 20 0" stroke="#6b3424" stroke-width="3" fill="none" stroke-linecap="round"/>`}${glasses?`<g fill="none" stroke="#1b1b1b" stroke-width="3"><circle cx="${hx-12}" cy="${hy+4}" r="11"/><circle cx="${hx+12}" cy="${hy+4}" r="11"/><line x1="${hx-1}" y1="${hy+4}" x2="${hx+1}" y2="${hy+4}"/></g>`:""}`;
  const arms = stand ? "" : `<g class="${typing?"typing":""}"><path d="M${x-60} ${y-50} C${x-45} ${y-25},${x-30} ${y-10},${x-15} ${y-2}" stroke="${skin}" stroke-width="16" stroke-linecap="round" fill="none"/></g><g class="${typing?"typing":""}" style="animation-delay:-.17s"><path d="M${x+60} ${y-50} C${x+45} ${y-25},${x+30} ${y-10},${x+15} ${y-2}" stroke="${skin}" stroke-width="16" stroke-linecap="round" fill="none"/></g>`;
  return `<g${K(k)}>${body}${hoodShape}${head}${hood?`<path d="M${hx-30} ${hy} C${hx-30} ${hy-40},${hx+30} ${hy-40},${hx+30} ${hy} C${hx+20} ${hy-22},${hx-20} ${hy-22},${hx-30} ${hy} Z" fill="#1d2029"/>`:(hairs[hair]||"")}${face}${arms}</g>`;
}

/* ---------- props ---------- */
const P = {
  desk:p=>`<g${K(p.k)}><rect x="${p.x}" y="${p.y}" width="${p.w||400}" height="22" rx="8" fill="${p.c||"#9a6a42"}"/><rect x="${p.x+20}" y="${p.y+22}" width="16" height="${p.h||140}" fill="#4a3020"/><rect x="${p.x+(p.w||400)-36}" y="${p.y+22}" width="16" height="${p.h||140}" fill="#4a3020"/></g>`,
  laptop:p=>`<g${K(p.k)}><path d="M${p.x-74} ${p.y} L${p.x+74} ${p.y} L${p.x+90} ${p.y+8} L${p.x-90} ${p.y+8} Z" fill="#9aa3b2"/><rect x="${p.x-66}" y="${p.y-84}" width="132" height="86" rx="8" fill="${p.dark?"#3a4152":"#c7ced9"}"/>${p.dark?"":`<circle cx="${p.x}" cy="${p.y-42}" r="9" fill="#e9edf3"/>`}${p.screen?`<text x="${p.x}" y="${p.y-36}" text-anchor="middle" font-size="13" font-family="monospace" fill="${p.screenColor||"#9fe3b0"}">${X(tx(p.screen))}</text>`:""}</g>`,
  monitor:p=>`<g${K(p.k)}><rect x="${p.x-90}" y="${p.y-130}" width="180" height="118" rx="10" fill="#1b2433" stroke="#0c111a" stroke-width="6"/><rect x="${p.x-78}" y="${p.y-118}" width="156" height="94" rx="4" fill="${p.screen||"#2c6fbf"}"/>${[0,1,2,3].map(i=>`<rect x="${p.x-66}" y="${p.y-104+i*20}" width="${90+((i*41)%50)}" height="8" rx="4" fill="#fff" opacity=".6"/>`).join("")}<rect x="${p.x-10}" y="${p.y-12}" width="20" height="14" fill="#1b2433"/><rect x="${p.x-46}" y="${p.y}" width="92" height="8" rx="4" fill="#1b2433"/></g>`,
  phone:p=>`<g${K(p.k)}><rect x="${p.x-22}" y="${p.y-40}" width="44" height="80" rx="9" fill="#111827" stroke="#9aa3b2" stroke-width="3"/><rect x="${p.x-16}" y="${p.y-32}" width="32" height="58" rx="4" fill="${p.screen||"#3fb6c4"}"/></g>`,
  router:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y})"><rect x="-40" y="0" width="80" height="34" rx="8" fill="#e8ecf3"/><line x1="-26" y1="0" x2="-34" y2="-30" stroke="#e8ecf3" stroke-width="5" stroke-linecap="round"/><line x1="26" y1="0" x2="34" y2="-30" stroke="#e8ecf3" stroke-width="5" stroke-linecap="round"/><circle cx="-14" cy="17" r="4" fill="#3dd68c"/><circle cx="2" cy="17" r="4" fill="#3dd68c"/></g>`,
  rogue:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y})"><rect x="-30" y="-14" width="60" height="28" rx="6" fill="#1b1f27" stroke="#444b5a" stroke-width="2"/><line x1="-20" y1="-14" x2="-28" y2="-44" stroke="#1b1f27" stroke-width="5" stroke-linecap="round"/><line x1="20" y1="-14" x2="28" y2="-44" stroke="#1b1f27" stroke-width="5" stroke-linecap="round"/><circle class="blink" cx="14" cy="0" r="4" fill="#ff3b3b"/></g>`,
  rack:p=>`<g${K(p.k)}><rect x="${p.x}" y="${p.y}" width="150" height="${p.h||420}" rx="8" fill="#16202f" stroke="#2b3a52" stroke-width="4"/>${Array.from({length:Math.floor((p.h||420)/46)},(_,i)=>`<rect x="${p.x+14}" y="${p.y+14+i*46}" width="122" height="34" rx="4" fill="#202d42"/><circle class="blink" style="animation-delay:-${(i*0.37)%1}s" cx="${p.x+30}" cy="${p.y+31+i*46}" r="4" fill="${p.bad&&i%2?"#ff5a5a":"#3dd68c"}"/><circle class="blink" style="animation-delay:-${(i*0.61)%1}s" cx="${p.x+44}" cy="${p.y+31+i*46}" r="4" fill="#4f9bff"/>`).join("")}${p.label?`<text x="${p.x+75}" y="${p.y-14}" text-anchor="middle" class="lbl">${X(tx(p.label))}</text>`:""}</g>`,
  firewall:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y})"><rect x="-70" y="-50" width="140" height="100" rx="10" fill="#b3402e"/>${[0,1,2,3].map(r=>`<line x1="-70" y1="${-50+r*25}" x2="70" y2="${-50+r*25}" stroke="#7a2a1e" stroke-width="4"/>`).join("")}${[0,1,2,3].map(r=>`<line x1="${r%2?-25:15}" y1="${-50+r*25}" x2="${r%2?-25:15}" y2="${-25+r*25}" stroke="#7a2a1e" stroke-width="4"/>`).join("")}<rect x="-70" y="-50" width="140" height="100" rx="10" fill="none" stroke="#5a1d14" stroke-width="5"/>${p.label?`<text y="-66" text-anchor="middle" class="lbl">${X(tx(p.label))}</text>`:""}</g>`,
  cloud:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y})"><path d="M-56 26a30 30 0 0 1 5-60 40 40 0 0 1 76-7 30 30 0 0 1 30 54z" fill="#e9f1ff" opacity=".95"/><text x="0" y="14" text-anchor="middle" font-size="20" font-weight="700" fill="#24324d" font-family="system-ui">${X(tx(p.label||"Internet"))}</text></g>`,
  db:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y})"><path d="M-50 -40v80c0 14 22 24 50 24s50-10 50-24v-80" fill="#2c6fbf"/><ellipse cx="0" cy="-40" rx="50" ry="22" fill="#4f8fe0"/><path d="M-50 0c0 14 22 24 50 24s50-10 50-24" fill="none" stroke="#1e4f8f" stroke-width="4"/>${p.label?`<text y="-74" text-anchor="middle" class="lbl">${X(tx(p.label))}</text>`:""}</g>`,
  server:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y})"><rect x="-55" y="-70" width="110" height="140" rx="10" fill="#dfe6ef"/>${[0,1,2].map(i=>`<rect x="-42" y="${-56+i*42}" width="84" height="30" rx="4" fill="#b9c4d2"/><circle class="blink" style="animation-delay:-${i*.3}s" cx="-28" cy="${-41+i*42}" r="4" fill="${p.bad?"#ff5a5a":"#3dd68c"}"/>`).join("")}${p.label?`<text y="-86" text-anchor="middle" class="lbl">${X(tx(p.label))}</text>`:""}</g>`,
  shield:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y}) scale(${p.s||1})"><path d="M0 -40 L34 -26 V2 C34 24 18 38 0 46 C-18 38 -34 24 -34 2 V-26 Z" fill="${p.c||"#1f9d55"}" stroke="#fff" stroke-width="5"/><path d="M-13 2 l9 9 l18 -19" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/></g>`,
  lock:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y}) scale(${p.s||1})"><rect x="-30" y="-10" width="60" height="50" rx="9" fill="${p.c||"#f4b740"}"/><path d="M-18 -10v-14a18 18 0 0 1 36 0v14" fill="none" stroke="${p.c||"#f4b740"}" stroke-width="9"/><circle cx="0" cy="14" r="6" fill="#5a3d00"/></g>`,
  key:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y}) rotate(${p.r||0}) scale(${p.s||1})"><circle cx="-22" cy="0" r="18" fill="none" stroke="${p.c||"#7fe3f5"}" stroke-width="9"/><path d="M-4 0h48M30 0v14M42 0v10" stroke="${p.c||"#7fe3f5"}" stroke-width="9" stroke-linecap="round"/>${p.label?`<text x="10" y="44" text-anchor="middle" class="lbl" style="font-size:20px">${X(tx(p.label))}</text>`:""}</g>`,
  doc:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y}) scale(${p.s||1})"><path d="M-30 -40h40l20 20v60h-60z" fill="#f5f7fb"/><path d="M10 -40v20h20" fill="#cfd6e0"/>${[0,1,2].map(i=>`<rect x="-20" y="${-10+i*14}" width="40" height="6" rx="3" fill="#9aa6b8"/>`).join("")}${p.label?`<text y="68" text-anchor="middle" class="lbl" style="font-size:20px">${X(tx(p.label))}</text>`:""}</g>`,
  coffee:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y})"><rect x="-18" y="0" width="36" height="30" rx="6" fill="#f1ece6"/><path d="M18 8 q14 4 0 16" stroke="#f1ece6" stroke-width="5" fill="none"/><g class="steam"><path d="M-6 -6 q-8 -12 0 -24"/><path d="M4 -6 q8 -12 0 -24"/><path d="M-1 -10 q-6 -10 2 -22"/></g></g>`,
  bigscreen:p=>`<g${K(p.k)}><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="12" fill="#0a1220" stroke="#22324d" stroke-width="8"/>${Array.from({length:6},(_,i)=>`<rect x="${p.x+30}" y="${p.y+30+i*((p.h-60)/6)}" width="${(p.w-60)*(0.35+((i*37)%50)/100)}" height="${(p.h-60)/6-14}" rx="6" fill="${i===2&&p.alarm?"#e3202c":"#1d3f9f"}" opacity="${i===2&&p.alarm?1:.7}" ${i===2&&p.alarm?'class="blink"':""}/>`).join("")}<polyline points="${Array.from({length:12},(_,i)=>`${p.x+p.w*0.55+i*(p.w*0.4/11)},${p.y+p.h*0.7-((i*53)%60)}`).join(" ")}" fill="none" stroke="#3dd68c" stroke-width="5"/></g>`,
  whiteboard:p=>`<g${K(p.k)}><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="#f4f6f9" stroke="#9aa6b8" stroke-width="6"/>${(p.lines||[]).map((l,i)=>`<text x="${p.x+30}" y="${p.y+60+i*54}" font-size="38" font-family="'Segoe Print','Comic Sans MS',cursive" fill="${i===(p.lines.length-1)?"#c9353b":"#1d3f9f"}">${X(tx(l))}</text>`).join("")}</g>`,
  waves:p=>`<g${KC(p.k,"waves "+(p.tone||"good"))}>${[0,1,2].map(i=>`<circle cx="${p.x}" cy="${p.y}" r="10" style="animation-delay:${i*.8}s"/>`).join("")}</g>`,
  xmark:p=>`<g${K(p.k)}><circle cx="${p.x}" cy="${p.y}" r="${p.r||46}" fill="none" stroke="#ff6a73" stroke-width="7"/><line x1="${p.x-(p.r||46)*.7}" y1="${p.y-(p.r||46)*.7}" x2="${p.x+(p.r||46)*.7}" y2="${p.y+(p.r||46)*.7}" stroke="#ff6a73" stroke-width="7"/></g>`,
  label:p=>`<text${KC(p.k,"lbl "+(p.tone||""))} x="${p.x}" y="${p.y}" text-anchor="middle">${X(tx(p.t))}</text>`,
  link:p=>`<path${KC(p.k,"lnk "+(p.tone||"good"))} d="${p.d}"/>`,
  packets:p=>`<g${K(p.k)}>${[0,1].map(i=>p.locked?`<g><rect x="-11" y="-9" width="22" height="18" rx="4" fill="#3dd68c"/><path d="M-6 -9v-5a6 6 0 0 1 12 0v5" fill="none" stroke="#3dd68c" stroke-width="4"/><animateMotion dur="${p.dur||2}s" begin="${i*(p.dur||2)/2}s" repeatCount="indefinite" path="${p.d}"/></g>`:`<circle r="9" fill="${p.tone==="bad"?"#ffb3b8":"#bff3ff"}"><animateMotion dur="${p.dur||2}s" begin="${i*(p.dur||2)/2}s" repeatCount="indefinite" path="${p.d}"/></circle>`).join("")}</g>`,
  tunnel:p=>`<path${K(p.k)} d="${p.d}" fill="none" stroke="url(#tun)" stroke-width="34" stroke-linecap="round"/>`,
  alarm:p=>`<rect${KC(p.k,"alarm")} width="1600" height="900" fill="#ff2a2a"/>`,
  fire:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y})">${[0,1,2].map(i=>`<path class="flame-a" style="animation-delay:-${i*.3}s" d="M${-40+i*40} 0 C${-70+i*40} -60,${-20+i*40} -80,${-10+i*40} -140 C${10+i*40} -90,${30+i*40} -70,${10+i*40} 0 Z" fill="${["#ff7a1a","#ffb400","#ff4d2e"][i]}"/>`).join("")}</g>`,
  stamp:p=>`<g${K(p.k)} transform="translate(${p.x} ${p.y}) rotate(-12)"><rect x="-90" y="-34" width="180" height="68" rx="10" fill="none" stroke="${p.c||"#3dd68c"}" stroke-width="7"/><text y="14" text-anchor="middle" font-size="36" font-weight="900" fill="${p.c||"#3dd68c"}" font-family="system-ui">${X(tx(p.t))}</text></g>`
};

/* ---------- close-ups (HTML overlays) ---------- */
const bars = n => `<span class="bars">${[30,55,80,100].map((h,i)=>`<i class="${i<n?"":"off"}" style="height:${h}%"></i>`).join("")}</span>`;
const OV = {
  email:o=>`<div class="ov device mail ${o.pos||"l"}"><div class="mh"><small>${X(tx(o.fromLbl||{en:"From",fr:"De"}))}</small><b class="${o.badFrom?"hot":""}">${X(tx(o.from))}</b></div><div class="mh"><small>${X(tx(o.subjLbl||{en:"Subject",fr:"Objet"}))}</small><b>${X(tx(o.subj))}</b></div><div class="mb">${X(tx(o.body))}${o.link?`<span class="lnkbtn">${X(tx(o.link))}</span>`:""}</div></div>`,
  flags:o=>`<div class="ov flags ${o.pos||"r"}">${o.items.map((f,i)=>`<div class="flag" style="animation-delay:${1+i*1.8}s"><i>!</i><span>${X(tx(f))}</span></div>`).join("")}</div>`,
  browser:o=>`<div class="ov device portal ${o.pos||"l"}"><div class="urlbar">${o.secure?`<span class="ok">🔒 https://</span>`:`<span class="warn">⚠ http://</span>`}<span>${X(o.url)}</span></div><div class="bd"><h4>${X(tx(o.title))}</h4>${(o.fields||[]).map((f,i)=>`<div class="field"><span style="animation-delay:${.8+i*1.8}s">${X(tx(f))}</span></div>`).join("")}${o.btn?`<div class="btn">${X(tx(o.btn))}</div>`:""}${o.note?`<p class="note">${X(tx(o.note))}</p>`:""}</div></div>`,
  term:o=>`<div class="ov term ${o.pos||"r"}">${o.lines.map((l,i)=>`<div class="${(o.hot||[]).includes(i)?"hot":(o.ok||[]).includes(i)?"okl":""}" style="animation-delay:${.3+i*.8}s">${X(tx(l))}</div>`).join("")}</div>`,
  wifi:o=>`<div class="ov device wifi ${o.pos||"l"}"><div class="hd"><span>Wi-Fi</span><span>⚙</span></div>${o.nets.map((n,i)=>`<div class="net ${i===0?"pick":""}">${bars(n[1])}<b>${X(n[0])}</b><small>${X(tx(n[2]))}</small></div>`).join("")}<span class="tapdot"></span></div>`,
  phone:o=>`<div class="ov phonecard ${o.pos||"r"}"><div class="ph-top"></div><div class="ph-app">${X(tx(o.app||"SecPrep"))}</div><h4>${X(tx(o.title))}</h4><p>${X(tx(o.body))}</p>${o.btns?`<div class="ph-btns">${o.btns.map((b,i)=>`<span class="${i===o.pick?"picked "+(o.tone||"good"):""}">${X(tx(b))}</span>`).join("")}</div>`:""}</div>`,
  alert:o=>`<div class="ov alertbox ${o.tone||"bad"} ${o.pos||"c"}"><b>${X(tx(o.title))}</b><p>${X(tx(o.body))}</p></div>`,
  files:o=>`<div class="ov device files ${o.pos||"l"}"><div class="hd">${X(tx(o.title||{en:"Shared files",fr:"Fichiers partagés"}))}</div>${o.items.map((f,i)=>`<div class="file" style="--dl:${.6+i*.55}s"><span class="nm">${X(f)}</span><span class="lk">${X(f.replace(/\.[a-z]+$/,""))}.locked</span></div>`).join("")}</div>`,
  toggle:o=>`<div class="ov pill ${o.pos||"tl"}"><span>${X(tx(o.label))}</span><span class="toggle"></span><span>${X(tx(o.state))}</span></div>`,
  steps:o=>`<div class="ov glasscard ${o.pos||"r"}"><h4>${X(tx(o.h))}</h4><ol>${o.items.map((s,i)=>`<li style="animation-delay:${.4+i*(o.gap||.9)}s"><span class="n">${i+1}</span>${X(tx(s))}</li>`).join("")}</ol></div>`,
  checks:o=>`<div class="ov glasscard ${o.pos||"r"}"><h4>${X(tx(o.h))}</h4><ul class="checks">${o.items.map((s,i)=>`<li class="${s[1]?"ok":"no"}" style="animation-delay:${.5+i*1}s"><span class="n">${s[1]?"✓":"✗"}</span>${X(tx(s[0]))}</li>`).join("")}</ul></div>`,
  compare:o=>`<div class="ov cmp ${o.pos||"c"}"><div class="cl"><h4>${X(tx(o.l.h))}</h4><ul>${o.l.items.map(i=>`<li>${X(tx(i))}</li>`).join("")}</ul></div><div class="cr"><h4>${X(tx(o.r.h))}</h4><ul>${o.r.items.map(i=>`<li>${X(tx(i))}</li>`).join("")}</ul></div></div>`,
  calc:o=>`<div class="ov glasscard calc ${o.pos||"r"}"><h4>${X(tx(o.h))}</h4>${o.rows.map((r,i)=>`<div class="crow ${i===o.rows.length-1?"res":""}" style="animation-delay:${.5+i*1.2}s"><span>${X(tx(r[0]))}</span><b>${X(tx(r[1]))}</b></div>`).join("")}</div>`,
  code:o=>`<div class="ov codebox ${o.pos||"c"} ${o.tone||""}"><div class="cb-h">${X(tx(o.h))}</div><pre>${X(o.code)}</pre></div>`,
  tip:o=>`<div class="ov tipcard c"><span class="tag">${X(tx(o.tag||{en:"EXAM TIP",fr:"ASTUCE D'EXAMEN"}))}</span><h3>${X(tx(o.h))}</h3><ul>${o.items.map(i=>`<li>${X(tx(i))}</li>`).join("")}</ul></div>`
};

/* ---------- mount + camera ---------- */
function mount(stage, ep, lang){
  LANG = lang;
  const key = ep.id + ":" + lang;
  if(stage.dataset.story === key) return;
  stage.dataset.story = key;
  const world = (ENV[ep.env]||ENV.office)() + (ep.cast||[]).map(c => c.kind==="person" ? person(c) : (P[c.kind] ? P[c.kind](c) : "")).join("");
  stage.innerHTML = `<div class="story"><svg class="world" viewBox="0 0 1600 900" aria-hidden="true">${DEFS}<g class="cam" style="transform-origin:0 0">${world}</g></svg><div class="ovs"></div></div>`;
}
function shot(stage, s, lang){
  LANG = lang;
  const root = stage.querySelector(".story"); if(!root) return;
  const [x,y,z] = s.f || [800,450,1];
  root.className = "story" + (s.blur ? " blur" : "") + (s.shake ? " shake" : "");
  root.querySelector(".cam").style.transform = `translate(${800-x*z}px, ${450-y*z}px) scale(${z})`;
  const show = new Set(s.show||[]);
  root.querySelectorAll("[data-k]").forEach(el => el.classList.toggle("vis", show.has(el.dataset.k)));
  const box = root.querySelector(".ovs");
  box.innerHTML = (s.ov||[]).map(o => OV[o.type] ? OV[o.type](o) : "").join("");
  requestAnimationFrame(() => requestAnimationFrame(() => box.querySelectorAll(".ov").forEach(o => o.classList.add("on"))));
}
// Text of a shot's narration for the current language
const say = (s, lang) => (s.say && (s.say[lang] || s.say.en)) || "";
window.SecPrepStory = { mount, shot, say, tx: (v,l)=>{ const o=LANG; LANG=l; const r=tx(v); LANG=o; return r; } };
})();
