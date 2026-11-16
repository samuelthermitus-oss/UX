// Packages the questions, lessons and scenarios into content.json for live updates.
// Usage: node scripts/build-content.js 2026.12.01.1
// Upload dist/content/content.json to the address set in www/config.js (contentUrl).
const fs=require("fs"),vm=require("vm"),path=require("path");
const version=process.argv[2];
if(!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version||"")){console.error("Give a version like 2026.12.01.1 (it must be higher than the last one)");process.exit(1)}
const ctx={window:{}};vm.createContext(ctx);
const www=path.join(__dirname,"../www");
vm.runInContext(fs.readFileSync(path.join(www,"config.js"),"utf8"),ctx);
const enabled=["en","fr"];
for(const l of enabled) vm.runInContext(fs.readFileSync(path.join(www,"data",l+".js"),"utf8"),ctx);
if(version<=ctx.window.SECPREP_CONFIG.builtInVersion){console.error("Version must be higher than builtInVersion in www/config.js ("+ctx.window.SECPREP_CONFIG.builtInVersion+")");process.exit(1)}
const langs={};
for(const l of enabled){const d=ctx.window.SECPREP_LANGS[l];langs[l]={q:d.q,lessons:d.lessons,scen:d.scen,domains:d.domains};}
const out={version,created:new Date().toISOString(),langs};
fs.mkdirSync(path.join(__dirname,"../dist/content"),{recursive:true});
fs.writeFileSync(path.join(__dirname,"../dist/content/content.json"),JSON.stringify(out));
console.log("dist/content/content.json",version,langs.en.q.length+" questions");
