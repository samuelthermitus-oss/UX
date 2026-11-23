// Bundles www/ into one self-contained HTML file (fonts from Google Fonts, data + app inlined).
// Used to publish the browser version. Output: dist/secprep-web.html
const fs = require("fs"), path = require("path");
const www = path.join(__dirname, "../www");
const read = f => fs.readFileSync(path.join(www, f), "utf8");
let css = read("lib/ionic/ionic.bundle.css") + "\n" + read("lib/ionic/dark.class.css") + "\n" + read("styles.css").replace(/@font-face\{[^}]*\}\n?/g, "");
const js = ["config.js", "data/en.js", "data/fr.js", "data/guide-en-d1.js", "data/guide-en-d2.js", "data/guide-en-d3.js", "data/guide-en-d4.js", "data/guide-en-d5.js", "data/guide-fr-d1.js", "data/guide-fr-d2.js", "data/guide-fr-d3.js", "data/guide-fr-d4.js", "data/guide-fr-d5.js", "story.js", "data/stories-1.js", "data/stories-2.js", "data/pbq-en.js", "data/pbq-fr.js", "app.js"].map(read).join("\n;\n").replace(/<\/script/gi, "<\\/script");
const body = read("index.html").match(/<body>([\s\S]*?)<script/)[1];
const logo = "data:image/png;base64," + fs.readFileSync(path.join(www, "img/logo.png")).toString("base64");
const out = `<title>SecPrep Daily</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap">
<style>${css}</style>
<script type="module" src="https://cdn.jsdelivr.net/npm/@ionic/core@9.0.10/dist/ionic/ionic.esm.js"></script>
${body}<script>${js.replace(/img\/logo\.png/g, logo)}</script>
`;
fs.mkdirSync(path.join(__dirname, "../dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "../dist/secprep-web.html"), out);
console.log("dist/secprep-web.html", Math.round(out.length / 1024) + " KB");
