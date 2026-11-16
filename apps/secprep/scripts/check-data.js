// Validates that every language has the same questions, lessons and scenarios as English.
const fs=require("fs"),vm=require("vm"),path=require("path");
const ctx={window:{}};vm.createContext(ctx);
for(const l of ["en","fr","ht"])vm.runInContext(fs.readFileSync(path.join(__dirname,"../www/data/"+l+".js"),"utf8"),ctx);
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
console.log(bad?`${bad} problem(s)`:`OK · ${en.q.length} questions × 3 languages, ${en.scen.length} scenarios`);
process.exit(bad?1:0);
