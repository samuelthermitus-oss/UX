// Generates natural narration with Azure Speech and saves it in www/audio/<lang>/.
// The app plays these files and falls back to the phone's voice for anything missing.
//
//   node scripts/generate-audio.js --lang fr --region francecentral --dry-run   (count characters, no calls)
//   node scripts/generate-audio.js --lang fr --region francecentral             (generate missing files)
//
// The Azure key is read from AZURE_SPEECH_KEY. In this project's cloud environment the key is
// added to requests automatically, so a placeholder value is used when the variable is empty.
const fs = require("fs"), path = require("path"), vm = require("vm"), https = require("https");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const LANG = arg("lang", "fr"), REGION = arg("region", process.env.AZURE_SPEECH_REGION || ""), DRY = process.argv.includes("--dry-run");
const ONLY = (arg("only", "videos,coach,quiz,lessons,scenarios,chapters")).split(",");
const www = path.join(__dirname, "../www");

const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ["config.js", "data/en.js", "data/fr.js", "data/videos-en.js", "data/videos-fr.js", "data/guide-en-d1.js", "data/guide-en-d2.js", "data/guide-en-d3.js", "data/guide-en-d4.js", "data/guide-en-d5.js", "data/guide-fr-d1.js", "data/guide-fr-d2.js", "data/guide-fr-d3.js", "data/guide-fr-d4.js", "data/guide-fr-d5.js"]) {
  const p = path.join(www, f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), ctx);
}
const W = ctx.window, cfg = W.SECPREP_CONFIG || {}, L = W.SECPREP_LANGS[LANG];
const VOICE = (cfg.azureVoices || {})[LANG];
if (!L || !VOICE) { console.error(`No language data or voice for "${LANG}". Set azureVoices.${LANG} in www/config.js.`); process.exit(1); }

// Same hash and text normalization as the app (www/app.js: audioKey).
function cyrb53(str, seed = 0) { let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); }
const norm = s => String(s).replace(/\s+/g, " ").trim();
const keyOf = text => cyrb53(VOICE + "|" + norm(text));

// Collect every narration unit the app speaks in this language.
const units = new Set(), add = s => { if (s && norm(s)) units.add(norm(s)); };
if (ONLY.includes("videos")) (W.SECPREP_VIDEOS[LANG] || []).forEach(v => v.scenes.forEach(s => add(s.say)));
if (ONLY.includes("coach")) { const v = L.voice; [v.intro, v.correct, v.wrong, v.nextTopic, v.scenStart].forEach(a => (a || []).forEach(add));
  [v.options, v.answerIs, v.tip, v.lessonStart, v.great, v.keep].forEach(add); ["A", "B", "C", "D"].forEach(k => add(v.option + " " + k)); add(L.ui.voiceSample); }
if (ONLY.includes("quiz")) L.q.forEach(q => { add(q[1]); add(q[2]); q[3].forEach(add); add(q[4]); });
if (ONLY.includes("lessons")) Object.values(L.lessons).forEach(ls => ls.forEach(l => { add(l[0]); l[1].split("|").forEach(add); add(l[2]); }));
if (ONLY.includes("scenarios")) (L.scen || []).forEach(s => { add(s.intro); s.steps.forEach(st => { add(st.say); st.choices.forEach(c => add(c[c.length - 1])); }); });

// Study guide chapters, split exactly like the app's "listen" button (www/app.js: openChapter).
// Each language uses its own chapters (SECPREP_GUIDES[lang]); English also lives in SECPREP_GUIDE.
const guideFor = l => ((W.SECPREP_GUIDES || {})[l] && W.SECPREP_GUIDES[l].chapters.length) ? W.SECPREP_GUIDES[l] : (l === "en" ? W.SECPREP_GUIDE : null);
if (ONLY.includes("chapters") && guideFor(LANG)) guideFor(LANG).chapters.forEach(c => {
  const plain = s => String(s).replace(/\*\*/g, "");
  add(c.t + "."); add(plain(c.intro));
  c.s.forEach(([h, txt, bul]) => { add(h + "."); add(plain(txt)); (bul || []).forEach(b => add(plain(b) + ".")); });
  if (c.ex) add(c.ex); if (c.tip) add(c.tip);
});
// Spoken results: scenario debriefs and end-of-quiz summaries (same wording as the app).
if (ONLY.includes("coach")) {
  const v = L.voice, fill = (s, o) => Object.keys(o).reduce((a, k) => a.split("{" + k + "}").join(o[k]), s);
  [...new Set((L.scen || []).map(s => s.steps.length))].forEach(n => { for (let s = 0; s <= n; s++) add(fill(v.score, { s, t: n }) + " " + (s === n ? v.great : v.keep)); });
  const sizes = new Set([10, 25, 50]); [1, 2, 3, 4, 5].forEach(d => sizes.add(L.q.filter(q => q[0] === d).length));
  sizes.forEach(n => { for (let c = 0; c <= n; c++) add(fill(L.ui.ofCorrect, { c, t: n }) + ". " + (Math.round(c / n * 100) >= 85 ? v.great : v.keep)); });
}
const outDir = path.join(www, "audio", LANG); fs.mkdirSync(outDir, { recursive: true });
const list = [...units], todo = list.filter(t => !fs.existsSync(path.join(outDir, keyOf(t) + ".mp3")));
const chars = todo.reduce((a, t) => a + t.length, 0);
console.log(`${LANG} · ${VOICE}: ${list.length} narration pieces, ${todo.length} to generate, about ${chars.toLocaleString()} characters.`);
if (DRY) process.exit(0);
if (!REGION) { console.error("Give the Azure region, for example --region francecentral"); process.exit(1); }

const xml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
// Uses curl so requests go through the system's HTTPS proxy settings (Node's https module ignores them).
const { spawn } = require("child_process");
function tts(text, outFile) { return new Promise((resolve, reject) => {
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${VOICE.slice(0, 5)}"><voice name="${VOICE}">${xml(text)}</voice></speak>`;
  const tmp = outFile + ".part";
  const c = spawn("curl", ["-s", "-o", tmp, "-w", "%{http_code}", "--max-time", "60", "-X", "POST",
    `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
    "-H", "Ocp-Apim-Subscription-Key: " + (process.env.AZURE_SPEECH_KEY || "placeholder-key"),
    "-H", "Content-Type: application/ssml+xml", "-H", "X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3",
    "-H", "User-Agent: secprep-audio-builder", "--data-binary", "@-"]);
  let code = ""; c.stdout.on("data", d => code += d); c.on("error", reject);
  c.on("close", () => { if (code === "200" && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) { fs.renameSync(tmp, outFile); resolve(); }
    else { try { fs.unlinkSync(tmp); } catch (e) {} reject(new Error(code || "network error")); } });
  c.stdin.end(ssml); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function writeManifest() {
  const manifest = {}; for (const l of fs.readdirSync(path.join(www, "audio")).filter(d => fs.statSync(path.join(www, "audio", d)).isDirectory()))
    manifest[l] = Object.fromEntries(fs.readdirSync(path.join(www, "audio", l)).filter(f => f.endsWith(".mp3")).map(f => [f.slice(0, -4), 1]));
  fs.writeFileSync(path.join(www, "audio", "manifest.js"), "window.SECPREP_AUDIO=" + JSON.stringify(manifest) + ";\n");
}

(async () => {
  let done = 0, failed = 0;
  for (const text of todo) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try { await tts(text, path.join(outDir, keyOf(text) + ".mp3")); done++; break; }
      catch (e) { if (attempt === 4 || !/^(429|5\d\d)/.test(e.message)) { failed++; console.error("✗", e.message, "·", text.slice(0, 60)); break; } await sleep(1500 * attempt); }
    }
    if (done % 25 === 0 && done) { console.log(`  ${done}/${todo.length}`); writeManifest(); }
    await sleep(120);
  }
  writeManifest();
  console.log(`Done: ${done} generated, ${failed} failed. Run "npx cap sync" to copy them into the iPhone and Android apps.`);
})();
