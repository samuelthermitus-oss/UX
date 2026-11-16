/* SecPrep Daily — app logic. Plain JS, no build step. Data lives in data/{en,fr,ht}.js */
(function(){
"use strict";
const LANGS = window.SECPREP_LANGS;
const EN = LANGS.en;
const WEIGHTS = {1:"12%",2:"22%",3:"18%",4:"28%",5:"20%"};
const CAP = window.Capacitor;
const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
const PLUG = (CAP && CAP.Plugins) || {};

/* ---------- storage ---------- */
const KEY = "secprep-v2";
const S = Object.assign({days:[],history:[],missed:{},seen:{},dstat:{},scen:{},lang:null,voice:{},rate:1,autoRead:false,remind:{on:false,time:"19:00"}}, read());
function read(){try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
if(!S.lang){const n=(navigator.language||"en").toLowerCase();S.lang=n.startsWith("ht")?"ht":n.startsWith("fr")?"fr":"en"}

/* ---------- i18n ---------- */
const L = () => LANGS[S.lang] || EN;
const t = (k, vars) => { let s = (L().ui[k] ?? EN.ui[k] ?? k); if (vars) for (const v in vars) s = s.split("{"+v+"}").join(vars[v]); return s; };
const V = () => L().voice;
const pick = a => a[Math.floor(Math.random()*a.length)];
const Q = i => { const e = EN.q[i], l = L().q[i] || e; return {d:e[0], q:l[1], opts:[l[2]].concat(l[3]), exp:l[4]}; };
const DN = d => L().domains[d] || EN.domains[d];
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a; };
const ALL = EN.q.map((_,i)=>i);
const today = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const dayKey = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
function markDay(){ if(!S.days.includes(today())){S.days.push(today());save()} }
function streak(){ let n=0; const d=new Date(); if(!S.days.includes(dayKey(d))) d.setDate(d.getDate()-1); while(S.days.includes(dayKey(d))){n++;d.setDate(d.getDate()-1)} return n; }

/* =====================================================================
   VOICE ENGINE — makes device text-to-speech sound more like a person:
   - picks the most natural voice installed (Premium/Enhanced/Neural…)
   - speaks sentence by sentence with real pauses between them
   - small natural variation in pitch and pace on every sentence
   - warmer, upbeat tone for praise; softer, slower tone for corrections
   - spoken transitions ("Okay, here's the next one…") like a coach
   Uses the native TTS plugin inside the iOS/Android app (Android's
   WebView has no speechSynthesis) and the Web Speech API in browsers.
   ===================================================================== */
const Voice = (function(){
  const web = "speechSynthesis" in window;
  const nativeTTS = NATIVE && PLUG.TextToSpeech;
  let token = 0, voices = [], nativeVoices = [];
  const QUALITY = /(premium|enhanced|natural|neural|wavenet|siri|studio|journey|online)/i;
  const GOOD_NAMES = /(samantha|ava|allison|evan|zoe|nathan|serena|daniel|karen|moira|tessa|aaron|amélie|amelie|audrey|aurélie|thomas|marie|chantal|google)/i;
  function load(){ if(web){ try{ voices = speechSynthesis.getVoices(); }catch(e){} } }
  if(web){ load(); try{ speechSynthesis.onvoiceschanged = () => { load(); if(typeof onVoices==="function") onVoices(); }; }catch(e){} }
  if(nativeTTS){ nativeTTS.getSupportedVoices().then(r => { nativeVoices = (r && r.voices) || []; if(typeof onVoices==="function") onVoices(); }).catch(()=>{}); }
  let onVoices = null;
  function langMatch(vlang, prefs){ vlang=(vlang||"").toLowerCase().replace("_","-"); for(let i=0;i<prefs.length;i++){ const p=prefs[i].toLowerCase(); if(vlang===p) return 100-i*10; if(vlang.split("-")[0]===p.split("-")[0]) return 90-i*10; } return -1; }
  function score(v, prefs){ const lm=langMatch(v.lang, prefs); if(lm<0) return -1; let s=lm; if(QUALITY.test(v.name)) s+=40; if(GOOD_NAMES.test(v.name)) s+=15; if(v.localService===false) s+=5; if(/compact|eloquence|espeak/i.test(v.name)) s-=30; return s; }
  function list(){ const prefs=L().speech; const src = nativeTTS ? nativeVoices : voices; return src.map((v,i)=>({v,i,s:score(v,prefs)})).filter(x=>x.s>=0).sort((a,b)=>b.s-a.s); }
  function chosen(){ const l=list(); const want=S.voice[S.lang]; if(want){ const f=l.find(x=>x.v.name===want); if(f) return f; } return l[0]||null; }
  // Split text into speakable chunks, keeping each sentence's own pause.
  function chunk(text, opt){ opt=opt||{}; const parts=[]; String(text).replace(/\s+/g," ").split(/(?<=[.!?…:;])\s+/).forEach(s=>{ s=s.trim(); if(!s) return; const isQ=/\?$/.test(s); const ell=/(\.\.\.|…)$/.test(s); parts.push({t:s, pause: ell?650 : isQ?520 : /[:;]$/.test(s)?380 : 420, pitch:(opt.pitch||1)+(Math.random()*0.08-0.04)+(isQ?0.04:0), rate:(opt.rate||1)*(1+(Math.random()*0.06-0.03))}); }); if(parts.length&&opt.after!=null) parts[parts.length-1].pause=opt.after; return parts; }
  function sayOne(p, my){ return new Promise(res=>{
    if(my!==token) return res();
    const c = chosen(); const rate = Math.max(0.5, Math.min(2, p.rate*S.rate)); const pitch = Math.max(0.5,Math.min(2,p.pitch));
    if(nativeTTS){
      const lang = c ? (c.v.lang||L().speech[0]) : (L().code==="ht"?"fr-FR":L().speech[0]);
      const o = {text:p.t, lang, rate, pitch, volume:1, category:"playback"}; if(c) o.voice=c.i;
      nativeTTS.speak(o).then(res,res); return;
    }
    if(!web) return res();
    try{ const u=new SpeechSynthesisUtterance(p.t); if(c){u.voice=c.v;u.lang=c.v.lang}else{u.lang=L().code==="ht"?"fr-FR":L().speech[0]} u.rate=rate; u.pitch=pitch; u.onend=res; u.onerror=res; speechSynthesis.speak(u);
      // iOS Safari occasionally drops onend; a time-based fallback keeps the queue moving.
      setTimeout(res, 1500 + p.t.length*95/rate);
    }catch(e){res()}
  }); }
  async function play(parts, onDone){ stop(); const my=++token; for(const p of parts){ if(my!==token) return; await sayOne(p,my); if(my!==token) return; await new Promise(r=>setTimeout(r,p.pause||0)); } if(my===token&&onDone) onDone(); }
  function stop(){ token++; try{ if(nativeTTS) nativeTTS.stop(); else if(web) speechSynthesis.cancel(); }catch(e){} }
  return { available: web||!!nativeTTS, play, stop, chunk, list, chosen, set onVoices(f){onVoices=f} };
})();

/* Scripted "coach" lines built on top of the engine */
const Coach = {
  question(q, order){ const v=V(); let parts=[];
    parts=parts.concat(Voice.chunk(pick(v.intro),{after:500,pitch:1.03}));
    parts=parts.concat(Voice.chunk(q.q,{after:750}));
    parts=parts.concat(Voice.chunk(v.options,{after:350}));
    order.forEach((oi,j)=>parts.push({t:v.option+" "+"ABCD"[j]+"... "+q.opts[oi]+".",pause:450,pitch:1+(Math.random()*0.06-0.03),rate:0.97}));
    return parts; },
  feedback(q, ok){ const v=V(); let parts=[];
    if(ok) parts=parts.concat(Voice.chunk(pick(v.correct),{pitch:1.12,rate:1.04,after:420}));
    else { parts=parts.concat(Voice.chunk(pick(v.wrong),{pitch:0.96,rate:0.92,after:500})); parts=parts.concat(Voice.chunk(v.answerIs+"... "+q.opts[0]+".",{rate:0.95,after:550})); }
    return parts.concat(Voice.chunk(q.exp,{rate:0.98})); },
  lesson(l, first){ const v=V(); let parts=[];
    parts=parts.concat(Voice.chunk((first?v.lessonStart:pick(v.nextTopic))+" "+l[0]+".",{pitch:1.05,after:700}));
    l[1].split("|").forEach(b=>{ parts=parts.concat(Voice.chunk(b,{after:600})); });
    parts=parts.concat(Voice.chunk(v.tip,{pitch:1.08,after:400})); parts=parts.concat(Voice.chunk(l[2],{rate:0.95,after:900}));
    return parts; }
};
function speak(parts, done){ if(Voice.available) Voice.play(parts, done); }

/* ---------- reminders (native app only) ---------- */
const Remind = {
  available: NATIVE && !!PLUG.LocalNotifications,
  async apply(){ const LN=PLUG.LocalNotifications; if(!LN) return "";
    try{ await LN.cancel({notifications:[{id:701}]}); }catch(e){}
    if(!S.remind.on) return t("reminderOff");
    try{ const p=await LN.requestPermissions(); if(p.display!=="granted"){S.remind.on=false;save();return t("reminderDenied")} }catch(e){ return t("reminderDenied") }
    const [h,m]=S.remind.time.split(":").map(Number);
    await LN.schedule({notifications:[{id:701,title:t("reminderTitle"),body:t("reminderBody"),schedule:{on:{hour:h,minute:m},repeats:true,allowWhileIdle:true}}]});
    return t("reminderSaved",{t:S.remind.time}); }
};

/* ---------- shell ---------- */
const app = document.getElementById("app");
let tab = "practice", quiz = null, timerId = null, scenTimers = [];
function chrome(){
  document.documentElement.lang = L().code === "ht" ? "ht" : L().code;
  document.getElementById("sub").textContent = t("appSub");
  const n=streak(); document.getElementById("streak").innerHTML = n===1 ? t("streak1") : t("streak",{n});
  document.querySelectorAll("[data-langbtn]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.langbtn===S.lang));
  const lab={practice:"tPractice",learn:"tLearn",scenarios:"tScen",progress:"tProgress"};
  document.querySelectorAll("nav.tabs button").forEach(b=>{b.querySelector("span").textContent=t(lab[b.dataset.tab]);b.setAttribute("aria-current",b.dataset.tab===tab)});
}
document.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>go(b.dataset.tab));
document.querySelectorAll("[data-langbtn]").forEach(b=>b.onclick=()=>{ S.lang=b.dataset.langbtn; save(); Voice.stop(); chrome(); if(quiz&&tab==="practice"&&document.querySelector(".qtext")) renderQ(); else go(tab); });
function go(x){ Voice.stop(); clearInterval(timerId); clearScen(); quiz=null; tab=x; chrome(); window.scrollTo(0,0); ({practice:viewPractice,learn:viewLearn,scenarios:viewScenarios,progress:viewProgress})[x](); }
const listenBtn = id => Voice.available ? `<button class="btn ghost small" id="${id}" type="button">▶ ${esc(t("listen"))}</button>` : "";

/* ---------- practice ---------- */
function viewPractice(){
  const missedN=Object.keys(S.missed).length, seenN=Object.keys(S.seen).length;
  app.innerHTML=`<div class="section">
   <div class="stack"><span class="eyebrow">${esc(new Date().toLocaleDateString(S.lang==="ht"?"fr":S.lang,{weekday:"long",month:"short",day:"numeric"}))}</span>
   <h1>${esc(t("heroTitle"))}</h1><p class="muted">${esc(t("heroBody",{n:EN.q.length,s:seenN}))}</p></div>
   <div class="progress" aria-hidden="true"><i style="width:${Math.round(seenN/EN.q.length*100)}%"></i></div>
   <div class="grid2">
    <button class="mode primary" id="m-daily"><b>${esc(t("daily"))}</b><span>${esc(t("dailyDesc"))}</span></button>
    <button class="mode" id="m-exam"><b>${esc(t("exam"))}</b><span>${esc(t("examDesc"))}</span></button>
    <button class="mode" id="m-missed" ${missedN?"":"disabled"}><b>${esc(t("missed"))}</b><span>${esc(t("missedDesc",{n:missedN}))}</span></button>
    <button class="mode" id="m-all"><b>${esc(t("all",{n:EN.q.length}))}</b><span>${esc(t("allDesc"))}</span></button>
   </div>
   <h2>${esc(t("byDomain"))}</h2>
   <div class="domain-list">${[1,2,3,4,5].map(k=>{const n=EN.q.filter(q=>q[0]==k).length;const st=S.dstat[k]||{c:0,t:0};const p=st.t?Math.round(st.c/st.t*100):0;return `<button class="domain-item" data-d="${k}"><span class="dnum">D${k}</span><span class="dmeta"><b>${esc(DN(k))}</b><span>${esc(t("qCount",{n}))} · ${esc(t("weight",{w:WEIGHTS[k]}))} · ${esc(st.t?t("pctCorrect",{p}):t("notStarted"))}</span><div class="bar"><i style="width:${p}%"></i></div></span></button>`}).join("")}</div>
   <p class="fine">${esc(t("disclaimer"))}</p>
  </div>`;
  document.getElementById("m-daily").onclick=()=>{const missed=shuffle(Object.keys(S.missed).map(Number)).slice(0,8);const rest=shuffle(ALL.filter(i=>!missed.includes(i)));startQuiz(shuffle(missed.concat(rest).slice(0,25)),"quizDaily",false)};
  document.getElementById("m-exam").onclick=()=>startQuiz(shuffle(ALL).slice(0,90),"quizExam",true);
  document.getElementById("m-missed").onclick=()=>startQuiz(shuffle(Object.keys(S.missed).map(Number)),"quizMissed",false);
  document.getElementById("m-all").onclick=()=>startQuiz(shuffle(ALL),"quizAll",false);
  app.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>startQuiz(shuffle(ALL.filter(i=>EN.q[i][0]==b.dataset.d)),"quizDomain",false,{d:b.dataset.d}));
}
function startQuiz(list,label,exam,lv){
  Voice.stop(); clearInterval(timerId);
  quiz={list,label,lv:lv||{},exam,i:0,answers:[],order:list.map(()=>shuffle([0,1,2,3])),end:exam?Date.now()+90*60000:0};
  if(exam) timerId=setInterval(()=>{const el=document.getElementById("timer");if(!el)return;const left=quiz.end-Date.now();if(left<=0){clearInterval(timerId);finishQuiz();return}el.textContent=fmt(left);el.classList.toggle("low",left<600000)},1000);
  renderQ(true);
}
const fmt=ms=>{const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
function renderQ(fresh){
  const qi=quiz.list[quiz.i], q=Q(qi), order=quiz.order[quiz.i], ans=quiz.answers[quiz.i];
  const shown=!quiz.exam&&ans!==undefined;
  app.innerHTML=`<div class="section">
   <div class="row between"><button class="btn ghost small" id="quit">✕ ${esc(t("end"))}</button><span class="eyebrow">${esc(t(quiz.label,quiz.lv))}</span>${quiz.exam?`<span class="timer" id="timer">${fmt(quiz.end-Date.now())}</span>`:`<span class="pill">${quiz.i+1}/${quiz.list.length}</span>`}</div>
   <div class="progress"><i style="width:${quiz.i/quiz.list.length*100}%"></i></div>
   <div class="card">
    <div class="qmeta"><span>Q${quiz.i+1} · D${q.d} ${esc(DN(q.d))}</span>${listenBtn("ql")}</div>
    <p class="qtext">${esc(q.q)}</p>
    <div class="opts">${order.map((oi,j)=>{let c="";if(shown){if(oi===0)c="right";else if(ans===oi)c="wrong"}else if(ans===oi)c="sel";return `<button class="opt ${c}" data-o="${oi}" ${shown?"disabled":""}><span class="k">${"ABCD"[j]}</span><span>${esc(q.opts[oi])}</span></button>`}).join("")}</div>
    ${shown?`<div class="explain ${ans===0?"ok":"no"}"><b>${ans===0?esc(t("correct")):esc(t("notQuite"))+esc(q.opts[0])}</b><p>${esc(q.exp)}</p></div>`:""}
   </div>
   <div class="row between"><button class="btn ghost" id="prev" ${quiz.i===0?"disabled":""}>${esc(t("back"))}</button><button class="btn" id="next" ${(ans===undefined&&!quiz.exam)?"disabled":""}>${esc(quiz.i===quiz.list.length-1?t("finish"):t("next"))}</button></div>
  </div>`;
  app.querySelectorAll(".opt").forEach(b=>b.onclick=()=>{const oi=+b.dataset.o;quiz.answers[quiz.i]=oi;if(!quiz.exam){record(qi,oi===0);renderQ();if(S.autoRead)speak(Coach.feedback(q,oi===0))}else renderQ()});
  const ql=document.getElementById("ql"); if(ql) ql.onclick=()=>speak(shown?Coach.feedback(q,ans===0):Coach.question(q,order));
  document.getElementById("prev").onclick=()=>{quiz.i--;Voice.stop();renderQ(true)};
  document.getElementById("next").onclick=()=>{Voice.stop();if(quiz.i===quiz.list.length-1)finishQuiz();else{quiz.i++;renderQ(true);window.scrollTo(0,0)}};
  document.getElementById("quit").onclick=()=>{if(quiz.answers.some(a=>a!==undefined))finishQuiz();else go("practice")};
  if(fresh&&S.autoRead&&!shown) speak(Coach.question(q,order));
}
function record(qi,ok){ S.seen[qi]=1; const d=EN.q[qi][0]; S.dstat[d]=S.dstat[d]||{c:0,t:0}; S.dstat[d].t++; if(ok){S.dstat[d].c++;delete S.missed[qi]}else S.missed[qi]=1; markDay(); save(); chrome(); }
function finishQuiz(){
  clearInterval(timerId); Voice.stop();
  const res={}; let c=0, answered=0;
  quiz.list.forEach((qi,k)=>{const a=quiz.answers[k],d=EN.q[qi][0];res[d]=res[d]||{c:0,t:0};res[d].t++;if(a!==undefined)answered++;if(a===0){c++;res[d].c++}if(quiz.exam){if(a!==undefined)record(qi,a===0);else S.missed[qi]=1}});
  const pct=Math.round(c/quiz.list.length*100);
  S.history.unshift({d:today(),label:quiz.label,lv:quiz.lv,c,t:quiz.list.length}); S.history=S.history.slice(0,60); markDay(); save(); chrome();
  const wrong=quiz.list.map((qi,k)=>({qi,a:quiz.answers[k]})).filter(x=>x.a!==0);
  const label=t(quiz.label,quiz.lv);
  app.innerHTML=`<div class="section">
   <span class="eyebrow">${esc(label)} · ${esc(t("results"))}</span>
   <div class="row" style="align-items:flex-end;gap:16px"><span class="score-big ${pct>=85?"pass":pct<70?"fail":""}">${pct}%</span><p class="muted">${esc(t("ofCorrect",{c,t:quiz.list.length}))}${answered<quiz.list.length?" · "+esc(t("unanswered",{n:quiz.list.length-answered})):""}.<br>${esc(pct>=85?t("msgHigh"):pct>=70?t("msgMid"):t("msgLow"))}</p></div>
   <h2>${esc(t("byDomainRes"))}</h2>
   <div class="domain-list">${Object.keys(res).sort().map(d=>{const r=res[d];return `<div class="domain-item"><span class="dnum">D${d}</span><span class="dmeta"><b>${esc(DN(d))}</b><span>${r.c}/${r.t}</span><div class="bar"><i style="width:${r.c/r.t*100}%"></i></div></span></div>`}).join("")}</div>
   ${wrong.length?`<h2>${esc(t("reviewMisses"))}</h2><div class="stack">${wrong.map(x=>{const q=Q(x.qi);return `<div class="card"><p class="qtext small">${esc(q.q)}</p><div class="explain no"><b>${x.a===undefined?esc(t("unansweredLbl")):esc(t("youChose"))+esc(q.opts[x.a])}</b><p><strong>${esc(t("answer"))}: ${esc(q.opts[0])}.</strong> ${esc(q.exp)}</p></div></div>`}).join("")}</div>`:""}
   <div class="row"><button class="btn" id="again">${esc(t("backPractice"))}</button>${wrong.length?`<button class="btn ghost" id="redo">${esc(t("retryMissed",{n:wrong.length}))}</button>`:""}</div>
  </div>`;
  document.getElementById("again").onclick=()=>go("practice");
  const r=document.getElementById("redo"); if(r) r.onclick=()=>startQuiz(shuffle(wrong.map(x=>x.qi)),"quizRetry",false);
  if(S.autoRead) speak(Voice.chunk(t("ofCorrect",{c,t:quiz.list.length})+". "+(pct>=85?V().great:V().keep),{pitch:pct>=85?1.1:1}));
  window.scrollTo(0,0);
}

/* ---------- lessons ---------- */
let lessonDomain=1;
function viewLearn(){
  const ls=L().lessons[lessonDomain];
  app.innerHTML=`<div class="section">
   <span class="eyebrow">${esc(t("lessonsEyebrow"))}</span><h1>${esc(t("lessonsTitle"))}</h1>
   <p class="muted">${esc(t("lessonsBody"))}</p>
   <div class="row"><label for="dsel" class="eyebrow">${esc(t("domain"))}</label><select id="dsel">${[1,2,3,4,5].map(k=>`<option value="${k}" ${k==lessonDomain?"selected":""}>D${k} · ${esc(DN(k))} (${WEIGHTS[k]})</option>`).join("")}</select></div>
   ${Voice.available?`<div class="row"><button class="btn small" id="playall" type="button">▶ ${esc(t("listenDomain"))}</button><button class="btn ghost small" id="stopall" type="button">■ ${esc(t("stop"))}</button></div>`:`<p class="tip">${esc(t("audioNA"))}</p>`}
   <div class="stack lesson">${ls.map((l,i)=>`<div class="card" id="lc${i}"><div class="qmeta"><span>${lessonDomain}.${i+1}</span>${listenBtn("l"+i)}</div><h3>${esc(l[0])}</h3><ul>${l[1].split("|").map(x=>`<li>${esc(x)}</li>`).join("")}</ul><div class="tip"><b>${esc(t("examTip"))}</b>${esc(l[2])}</div></div>`).join("")}</div>
   <button class="btn" id="drill">${esc(t("drill",{d:lessonDomain}))}</button>
  </div>`;
  const sel=document.getElementById("dsel"); sel.onchange=()=>{Voice.stop();lessonDomain=+sel.value;viewLearn()};
  const mark=i=>{app.querySelectorAll(".lesson .card").forEach(c=>c.classList.remove("playing"));const c=document.getElementById("lc"+i);if(c){c.classList.add("playing");c.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"})}};
  ls.forEach((l,i)=>{const b=document.getElementById("l"+i);if(b)b.onclick=()=>{mark(i);speak(Coach.lesson(l,true),()=>mark(-1))}});
  const pa=document.getElementById("playall"); if(pa) pa.onclick=()=>{let i=0;const next=()=>{if(i<ls.length){mark(i);const l=ls[i];speak(Coach.lesson(l,i===0),next);i++}else mark(-1)};next()};
  const sa=document.getElementById("stopall"); if(sa) sa.onclick=()=>{Voice.stop();mark(-1)};
  document.getElementById("drill").onclick=()=>startQuiz(shuffle(ALL.filter(i=>EN.q[i][0]==lessonDomain)),"quizDomain",false,{d:lessonDomain});
}

/* ---------- scenarios ---------- */
function clearScen(){ scenTimers.forEach(clearTimeout); scenTimers=[]; }
function viewScenarios(){
  app.innerHTML=`<div class="section">
   <span class="eyebrow">${esc(t("scenEyebrow"))}</span><h1>${esc(t("scenTitle"))}</h1><p class="muted">${esc(t("scenBody"))}</p>
   <div class="domain-list">${EN.scen.map((s,i)=>{const ls=L().scen[i]||s;const r=S.scen[s.id];return `<button class="domain-item" data-s="${i}"><span class="dnum">D${s.dom}</span><span class="dmeta"><b>${esc(ls.title)}</b><span>${esc(t("decisions",{n:s.steps.length}))} · ${esc(r?t("best",{s:r,t:s.steps.length}):t("notPlayed"))}</span></span><span class="pill">▶ ${esc(t("play"))}</span></button>`}).join("")}</div>
  </div>`;
  app.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>playScen(+b.dataset.s));
}
function playScen(si){
  const E=EN.scen[si]; let step=0, score=0, narrate=Voice.available;
  const loc=()=>L().scen[si]||E;
  const render=()=>{
    clearScen(); Voice.stop();
    const s=loc(), st=s.steps[step], es=E.steps[step];
    const order=shuffle(es.choices.map((_,i)=>i));
    app.innerHTML=`<div class="section">
     <div class="row between"><button class="btn ghost small" id="sx">✕ ${esc(t("exit"))}</button><span class="eyebrow">${esc(s.title)}</span><span class="pill">${esc(t("step",{i:step+1,n:E.steps.length}))}</span></div>
     ${step===0?`<p class="muted">${esc(s.intro)}</p>`:""}
     <div class="card">
      <div class="qmeta"><span class="rec">${esc(t("live"))}</span>${Voice.available?`<button class="btn ghost small" id="narr" type="button">${esc(narrate?"🔊 "+t("narrOn"):"🔈 "+t("narrOff"))}</button>`:""}</div>
      <div class="term" id="term" aria-live="polite"></div>
      <p class="qtext" id="say" hidden>${esc(st.say)}</p>
      <div class="opts" id="ch" hidden>${order.map(i=>`<button class="opt" data-c="${i}"><span>${esc((st.choices[i]||es.choices[i])[0])}</span></button>`).join("")}</div>
      <div id="fb"></div>
     </div>
     <div class="row" style="justify-content:flex-end"><button class="btn" id="snext" hidden>${esc(step===E.steps.length-1?t("seeDebrief"):t("nextStep"))}</button></div>
    </div>`;
    const term=document.getElementById("term"), reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveal=()=>{document.getElementById("say").hidden=false;document.getElementById("ch").hidden=false;
      if(narrate){let p=[];if(step===0){p=p.concat(Voice.chunk(pick(V().scenStart),{pitch:0.94,rate:0.92,after:600}));p=p.concat(Voice.chunk(s.intro,{pitch:0.95,rate:0.95,after:700}))}p=p.concat(Voice.chunk(st.say,{pitch:0.97,rate:0.96}));speak(p)}};
    es.log.forEach((line,i)=>scenTimers.push(setTimeout(()=>{const d=document.createElement("div");d.textContent=line;if(/alert/i.test(line))d.className="alert";else if(/warn/i.test(line))d.className="warn";else if(/\[ok\]|NOT sent|denied/i.test(line))d.className="ok";term.appendChild(d);term.scrollTop=term.scrollHeight;if(i===es.log.length-1)reveal()},reduce?0:600+i*900)));
    document.getElementById("sx").onclick=()=>go("scenarios");
    const nb=document.getElementById("narr"); if(nb) nb.onclick=()=>{narrate=!narrate;if(!narrate)Voice.stop();nb.textContent=narrate?"🔊 "+t("narrOn"):"🔈 "+t("narrOff")};
    app.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{
      const ci=+b.dataset.c, ok=!!es.choices[ci][1], fb=(st.choices[ci]&&st.choices[ci][st.choices[ci].length-1])||es.choices[ci][2];
      if(ok) score++;
      app.querySelectorAll("[data-c]").forEach(x=>{x.disabled=true;const k=+x.dataset.c;if(es.choices[k][1])x.classList.add("right");else if(x===b)x.classList.add("wrong")});
      document.getElementById("fb").innerHTML=`<p class="choice-fb ${ok?"ok":"no"}">${esc(fb)}</p>`;
      if(narrate) speak(Voice.chunk(fb,{pitch:ok?1.08:0.96,rate:ok?1.02:0.94}));
      document.getElementById("snext").hidden=false;
    });
    document.getElementById("snext").onclick=()=>{if(step<E.steps.length-1){step++;render()}else debrief()};
  };
  const debrief=()=>{clearScen();Voice.stop();S.scen[E.id]=Math.max(S.scen[E.id]||0,score);markDay();save();chrome();
    const full=score===E.steps.length;
    app.innerHTML=`<div class="section"><span class="eyebrow">${esc(t("debrief"))} · ${esc(loc().title)}</span><span class="score-big ${full?"pass":""}">${score}/${E.steps.length}</span><p class="muted">${esc(full?t("debriefGood"):t("debriefBad"))}</p><div class="row"><button class="btn" id="rp">${esc(t("replay"))}</button><button class="btn ghost" id="bk">${esc(t("allScen"))}</button></div></div>`;
    document.getElementById("rp").onclick=()=>playScen(si); document.getElementById("bk").onclick=()=>go("scenarios");
    if(narrate) speak(Voice.chunk(V().score.replace("{s}",score).replace("{t}",E.steps.length)+" "+(full?V().great:V().keep),{pitch:full?1.1:1}));
  };
  render();
}

/* ---------- progress + settings ---------- */
function viewProgress(){
  const tot=Object.values(S.dstat).reduce((a,b)=>({c:a.c+b.c,t:a.t+b.t}),{c:0,t:0}), acc=tot.t?Math.round(tot.c/tot.t*100):0;
  const weakest=Object.entries(S.dstat).filter(([,v])=>v.t>=5).sort((a,b)=>a[1].c/a[1].t-b[1].c/b[1].t)[0];
  const vl=Voice.list(), cur=Voice.chosen();
  app.innerHTML=`<div class="section">
   <span class="eyebrow">${esc(t("progEyebrow"))}</span><h1>${esc(t("progTitle"))}</h1>
   <div class="stat-row"><div class="stat"><b>${streak()}</b><span>${esc(t("dayStreak"))}</span></div><div class="stat"><b>${tot.t}</b><span>${esc(t("answers"))}</span></div><div class="stat"><b>${acc}%</b><span>${esc(t("accuracy"))}</span></div></div>
   ${weakest?`<div class="tip"><b>${esc(t("focusLbl"))}</b>${esc(t("focusNext",{d:weakest[0],n:DN(weakest[0])}))}</div>`:`<div class="tip"><b>${esc(t("startLbl"))}</b>${esc(t("startBody"))}</div>`}
   <h2>${esc(t("accByDomain"))}</h2>
   <div class="domain-list">${[1,2,3,4,5].map(k=>{const st=S.dstat[k]||{c:0,t:0},p=st.t?Math.round(st.c/st.t*100):0;return `<div class="domain-item"><span class="dnum">D${k}</span><span class="dmeta"><b>${esc(DN(k))}</b><span>${esc(st.t?p+"% · "+st.c+"/"+st.t:t("noAnswers"))}</span><div class="bar"><i style="width:${p}%"></i></div></span></div>`}).join("")}</div>
   <h2>${esc(t("settings"))}</h2>
   <div class="settings">
    <div class="set-row"><span>${esc(t("language"))}</span><div class="seg">${["en","fr","ht"].map(c=>`<button type="button" data-setlang="${c}" aria-pressed="${S.lang===c}">${esc(LANGS[c].label)}</button>`).join("")}</div></div>
    ${Voice.available?`
    <div class="set-row"><label for="vsel">${esc(t("voice"))}</label><select id="vsel"><option value="">${esc(t("voiceAuto"))}${cur&&!S.voice[S.lang]?" · "+esc(cur.v.name):""}</option>${vl.map(x=>`<option value="${esc(x.v.name)}" ${S.voice[S.lang]===x.v.name?"selected":""}>${esc(x.v.name)} (${esc(x.v.lang)})</option>`).join("")}</select></div>
    <div class="set-row"><label for="rate">${esc(t("speed"))}</label><select id="rate">${[0.85,0.95,1,1.1,1.25].map(r=>`<option value="${r}" ${S.rate==r?"selected":""}>${r}×</option>`).join("")}</select></div>
    <div class="set-row"><label for="auto">${esc(t("autoRead"))}</label><input type="checkbox" id="auto" ${S.autoRead?"checked":""}></div>
    <div class="set-row"><span></span><button class="btn ghost small" id="testv" type="button">▶ ${esc(t("testVoice"))}</button></div>
    <p class="fine">${esc(t("voiceHelp"))}</p>`:`<p class="tip">${esc(t("audioNA"))}</p>`}
    ${Remind.available?`<div class="set-row"><label for="rem">${esc(t("reminderOn"))}</label><input type="checkbox" id="rem" ${S.remind.on?"checked":""}></div>
    <div class="set-row"><label for="remt">${esc(t("reminderTime"))}</label><input type="time" id="remt" value="${esc(S.remind.time)}"></div><p class="fine" id="remmsg" aria-live="polite"></p>`:""}
   </div>
   <h2>${esc(t("recent"))}</h2>
   ${S.history.length?`<div class="hist">${S.history.slice(0,15).map(h=>`<div><span>${esc(h.d)} · ${esc(t(h.label,h.lv))}</span><b>${h.c}/${h.t} (${Math.round(h.c/h.t*100)}%)</b></div>`).join("")}</div>`:`<p class="muted">${esc(t("noSessions"))}</p>`}
   <p class="fine">${esc(t("examFacts"))}</p><p class="fine">${esc(t("disclaimer"))}</p><p class="fine">${esc(t("privacy"))}</p>
   <button class="btn ghost small" id="reset">${esc(t("reset"))}</button>
  </div>`;
  app.querySelectorAll("[data-setlang]").forEach(b=>b.onclick=()=>{S.lang=b.dataset.setlang;save();Voice.stop();chrome();viewProgress()});
  const vs=document.getElementById("vsel"); if(vs) vs.onchange=()=>{S.voice[S.lang]=vs.value;save();speak(Voice.chunk(t("voiceSample")))};
  const rt=document.getElementById("rate"); if(rt) rt.onchange=()=>{S.rate=+rt.value;save()};
  const au=document.getElementById("auto"); if(au) au.onchange=()=>{S.autoRead=au.checked;save()};
  const tv=document.getElementById("testv"); if(tv) tv.onclick=()=>speak(Voice.chunk(t("voiceSample"),{pitch:1.04}));
  const msg=m=>{const el=document.getElementById("remmsg");if(el)el.textContent=m};
  const rem=document.getElementById("rem"); if(rem) rem.onchange=async()=>{S.remind.on=rem.checked;save();msg(await Remind.apply());rem.checked=S.remind.on};
  const remt=document.getElementById("remt"); if(remt) remt.onchange=async()=>{S.remind.time=remt.value||"19:00";save();if(S.remind.on)msg(await Remind.apply())};
  const r=document.getElementById("reset"); let armed=false;
  r.onclick=()=>{if(!armed){armed=true;r.textContent=t("resetConfirm");return}Object.assign(S,{days:[],history:[],missed:{},seen:{},dstat:{},scen:{}});save();chrome();viewProgress()};
}
Voice.onVoices = () => { if(tab==="progress" && !quiz) viewProgress(); };

chrome(); viewPractice();
})();
