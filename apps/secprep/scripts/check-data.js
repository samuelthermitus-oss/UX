// Validates that every language has the same questions, lessons and scenarios as English.
const fs=require("fs"),vm=require("vm"),path=require("path");
const ctx={window:{}};vm.createContext(ctx);
for(const l of ["en","fr","ht"])vm.runInContext(fs.readFileSync(path.join(__dirname,"../www/data/"+l+".js"),"utf8"),ctx);
for(const f of fs.readdirSync(path.join(__dirname,"../www/data")).filter(f=>/^(guide|videos|pbq)-/.test(f))) vm.runInContext(fs.readFileSync(path.join(__dirname,"../www/data",f),"utf8"),ctx);
const L=ctx.window.SECPREP_LANGS,en=L.en;let bad=0;
const err=m=>{bad++;console.error("✗ "+m)};
for(const code of ["fr","ht"]){const d=L[code];
  if(d.q.length!==en.q.length)err(`${code}: ${d.q.length} questions vs ${en.q.length}`);
  d.q.forEach((q,i)=>{if(!en.q[i])return;if(q[0]!==en.q[i][0])err(`${code} q${i}: domain ${q[0]} vs ${en.q[i][0]} (${en.q[i][1].slice(0,50)})`);if(q[3].length!==3)err(`${code} q${i}: needs 3 wrong answers`)});
  const missingUi=Object.keys(en.ui).filter(k=>!(k in d.ui));
  if(missingUi.length){ if(code==="ht") console.warn(`! ht (turned off): ${missingUi.length} UI strings not translated yet`); else missingUi.forEach(k=>err(`${code}: missing ui.${k}`)); }
  for(const k of Object.keys(en.voice))if(!(k in d.voice))err(`${code}: missing voice.${k}`);
  for(const dm of [1,2,3,4,5])if(d.lessons[dm].length!==en.lessons[dm].length)err(`${code}: lessons D${dm} count`);
  if(d.scen.length!==en.scen.length)err(`${code}: scenario count`);
  d.scen.forEach((s,i)=>{const e=en.scen[i];if(s.steps.length!==e.steps.length)err(`${code} scen ${i}: steps`);s.steps.forEach((st,j)=>{if(st.choices.length!==e.steps[j].choices.length)err(`${code} scen ${i} step ${j}: choices`)})});
}
// French study content must mirror English one-to-one.
{ const W=ctx.window, enG=W.SECPREP_GUIDE.chapters, frG=(W.SECPREP_GUIDES&&W.SECPREP_GUIDES.fr||{chapters:[]}).chapters;
  if(frG.length!==enG.length) err(`fr guide: ${frG.length} chapters vs ${enG.length}`);
  enG.forEach(c=>{const f=frG.find(x=>x.id===c.id); if(!f){err(`fr guide: missing chapter ${c.id}`);return}
    if(f.s.length!==c.s.length) err(`fr chapter ${c.id}: ${f.s.length} sections vs ${c.s.length}`);
    if(f.vid!==c.vid) err(`fr chapter ${c.id}: video link differs`); if((f.terms||[]).length!==(c.terms||[]).length) err(`fr chapter ${c.id}: key terms count`);});
  const ev=W.SECPREP_VIDEOS.en, fv=W.SECPREP_VIDEOS.fr||[];
  ev.forEach(v=>{const f=fv.find(x=>x.id===v.id); if(!f){err(`fr videos: missing ${v.id}`);return} if(f.scenes.length!==v.scenes.length) err(`fr video ${v.id}: scenes`); f.scenes.forEach((sc,i)=>{ if(sc.k!==v.scenes[i].k) err(`fr video ${v.id} scene ${i}: kind`); });});
  const ep=W.SECPREP_PBQ.en, fp=W.SECPREP_PBQ.fr||[];
  ep.forEach(q=>{const f=fp.find(x=>x.id===q.id); if(!f){err(`fr PBQ: missing ${q.id}`);return} if(f.type!==q.type) err(`fr PBQ ${q.id}: type`);
    const n=x=>(x.items||x.rules).length; if(n(f)!==n(q)) err(`fr PBQ ${q.id}: item count`);
    if(f.type==="match") f.items.forEach(([,c])=>{ if(!f.cats.includes(c)) err(`fr PBQ ${q.id}: answer "${c}" not in categories`); });});
}
console.log(bad?`${bad} problem(s)`:`OK · ${en.q.length} questions × 3 languages, ${en.scen.length} scenarios`);
process.exit(bad?1:0);
