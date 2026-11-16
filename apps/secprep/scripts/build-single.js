// Bundles www/ into one self-contained HTML file (fonts from Google Fonts, data + app inlined).
// Used to publish the browser version. Output: dist/secprep-web.html
const fs = require("fs"), path = require("path");
const www = path.join(__dirname, "../www");
const read = f => fs.readFileSync(path.join(www, f), "utf8");
let css = read("lib/ionic/ionic.bundle.css") + "\n" + read("lib/ionic/dark.class.css") + "\n" + read("styles.css").replace(/@font-face\{[^}]*\}\n?/g, "");
const js = ["data/en.js", "data/fr.js", "app.js"].map(read).join("\n;\n").replace(/<\/script/gi, "<\\/script");
const body = read("index.html").match(/<body>([\s\S]*?)<script/)[1];
const out = `<title>SecPrep Daily</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap">
<style>${css}</style>
<script type="module" src="https://cdn.jsdelivr.net/npm/@ionic/core@9.0.10/dist/ionic/ionic.esm.js"></script>
${body}<script>${js}</script>
`;
fs.mkdirSync(path.join(__dirname, "../dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "../dist/secprep-web.html"), out);
console.log("dist/secprep-web.html", Math.round(out.length / 1024) + " KB");
