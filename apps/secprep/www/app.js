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
const S = Object.assign({days:[],history:[],missed:{},seen:{},dstat:{},scen:{},lang:null,voice:{},rate:1,autoRead:false,remind:{on:false,time:"19:00"},bg:"glacier",appearance:"auto"}, read());
function read(){try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const ENABLED_LANGS=["en","fr"];
if(!S.v||S.v<2){S.bg="glacier";S.v=2;}
if(!S.lang||!ENABLED_LANGS.includes(S.lang)){const n=(navigator.language||"en").toLowerCase();S.lang=n.startsWith("fr")||n.startsWith("ht")?"fr":"en"}
save();

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

/* ---------- haptics (native plugin in the app, vibration on Android web) ---------- */
const Haptic = {
  tap(){ try{ if(PLUG.Haptics) PLUG.Haptics.impact({style:"LIGHT"}); }catch(e){} },
  ok(){ try{ if(PLUG.Haptics) PLUG.Haptics.notification({type:"SUCCESS"}); else if(navigator.vibrate) navigator.vibrate(12); }catch(e){} },
  no(){ try{ if(PLUG.Haptics) PLUG.Haptics.notification({type:"ERROR"}); else if(navigator.vibrate) navigator.vibrate([18,60,18]); }catch(e){} }
};

/* ---------- icons ---------- */
const P = {
  home:"M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z",
  book:"M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6",
  radar:"M3.5 5h17v11h-17zM9 20h6M12 16v4M7.5 12.5l3-3.5 2.5 2.5 3.5-4",
  chart:"M5 20v-8M12 20V5M19 20v-5",
  x:"M6.5 6.5l11 11M17.5 6.5l-11 11",
  speaker:"M4 9.5v5h3.5L12 18V6L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11",
  check:"M5 12.5l4.5 4.5L19 7.5",
  flame:"M12 3c.8 3.6 5 5.2 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.6 2.4-5 .4 1.4 1.3 2 2.3 2C11.7 7.5 11.4 5.3 12 3z",
  clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  redo:"M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4",
  list:"M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.4 2.5 3.5 5.5 3.5 9s-1.1 6.5-3.5 9c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3z",
  chev:"M9.5 6l6 6-6 6",
  back:"M14.5 6l-6 6 6 6",
  play:"M8 5.2v13.6L19 12z",
  stop:"M7 7h10v10H7z",
  d1:"M12 3l7.5 3v6c0 4.4-3.2 7.8-7.5 9-4.3-1.2-7.5-4.6-7.5-9V6z",
  d2:"M12 4l9 16H3zM12 10v4M12 17h.01",
  d3:"M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5",
  d4:"M3 12h4l2.5-6 5 12 2.5-6h4",
  d5:"M9 3.5h6v3H9zM7 5H5.5v15.5h13V5H17M9 11h6M9 15h4",
  gear:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-1.7 1l-.3 2h-4l-.3-2a7 7 0 0 1-1.7-1l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3L3 9.3l2-3.4 1.9.7a7 7 0 0 1 1.7-1l.3-2h4l.3 2a7 7 0 0 1 1.7 1l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z",
  logout:"M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 16l-4-4 4-4M6 12h10"
};
const icon = (n, cls) => `<svg class="ico ${cls||""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"/></svg>`;
const fillIcon = n => icon(n, "fill");
const dc = d => `var(--d${d})`;
function ring(pct, size, stroke, color, inner){
  const r=(size-stroke)/2, c=2*Math.PI*r, off=c*(1-Math.max(0,Math.min(1,pct)));
  return `<span class="ring-wrap" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${off}" transform="rotate(-90 ${size/2} ${size/2})" style="transition:stroke-dashoffset .8s var(--ease)"/></svg>${inner?`<span class="center">${inner}</span>`:""}</span>`;
}

/* ---------- look: background theme + light/dark ---------- */
const Look = {
  mq: window.matchMedia("(prefers-color-scheme: dark)"),
  apply(){ const r=document.documentElement; r.dataset.bg=S.bg||"glacier"; const a=S.appearance||"auto";
    if(a==="auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme",a);
    const dark=a==="dark"||(a==="auto"&&this.mq.matches); r.classList.toggle("ion-palette-dark",dark);
    const m=document.querySelector('meta[name="theme-color"]'); if(m) m.content=dark?"#07090c":"#eef1f6";
    try{ if(PLUG.StatusBar) PLUG.StatusBar.setStyle({style:dark?"DARK":"LIGHT"}); }catch(e){} }
};
try{ Look.mq.addEventListener("change",()=>Look.apply()); }catch(e){}
Look.apply();
// light follows your finger across glass surfaces
document.addEventListener("pointermove",e=>{const g=e.target.closest&&e.target.closest(".card,.list,.stat,.opt,nav.tabs,.dock.fb");if(!g)return;const r=g.getBoundingClientRect();g.style.setProperty("--mx",(e.clientX-r.left)+"px");g.style.setProperty("--my",(e.clientY-r.top)+"px")},{passive:true});

/* ---------- shell ---------- */
S.daily = S.daily || {d:"", n:0};
let GOAL = 25;
const todayCount = () => S.daily.d===today() ? S.daily.n : 0;
const app = document.getElementById("app");
new MutationObserver(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>app.querySelectorAll("circle[data-target]").forEach(c=>{c.setAttribute("stroke-dashoffset",c.dataset.target);c.removeAttribute("data-target")})))).observe(app,{childList:true});
const tabsEl = document.getElementById("tabs");
let tab = "practice", quiz = null, timerId = null, scenTimers = [], shownTab = null;
const TABS = [["practice","home","tPractice"],["learn","book","tLearn"],["scenarios","radar","tScen"],["progress","chart","tProgress"]];
function chrome(){
  document.documentElement.lang = L().code;
  const idx=TABS.findIndex(x=>x[0]===tab), from=shownTab==null?idx:TABS.findIndex(x=>x[0]===shownTab);
  tabsEl.innerHTML = `<span class="bubble" aria-hidden="true"></span>`+TABS.map(([id,ic,k])=>`<button type="button" data-tab="${id}" aria-current="${tab===id}">${icon(ic)}<span>${esc(t(k))}</span></button>`).join("");
  tabsEl.style.setProperty("--t",from);
  if(from!==idx){const b=tabsEl.querySelector(".bubble");requestAnimationFrame(()=>requestAnimationFrame(()=>{tabsEl.style.setProperty("--t",idx);b.classList.add("squish")}))}
  shownTab=tab;
  tabsEl.querySelectorAll("button").forEach(b=>b.onclick=()=>{Haptic.tap();go(b.dataset.tab)});
}
function focusMode(on){ document.body.classList.toggle("focus", !!on); }
function go(x){ Voice.stop(); Player.hide(); clearInterval(timerId); clearScen(); closeSheet(); quiz=null; focusMode(false); tab=x; chrome(); window.scrollTo(0,0); ({practice:viewPractice,learn:viewLearn,scenarios:viewScenarios,progress:viewProgress})[x](); }
const langPill = (noGear) => `<div class="head-actions"><button class="pill-btn press" id="langbtn" type="button" aria-label="${esc(t("chooseLanguage"))}">${icon("globe")}${esc(L().short)}</button>${noGear?"":`<button class="pill-btn round press" id="setbtn" type="button" aria-label="${esc(t("openSettings"))}">${icon("gear")}</button>`}</div>`;
function bindLang(){ const b=document.getElementById("langbtn"); if(b) b.onclick=openLangSheet; const g=document.getElementById("setbtn"); if(g) g.onclick=openSettings; }

/* ---------- sheet ---------- */
function openSheet(html, bind){ closeSheet(); const s=document.createElement("div"); s.id="sheetwrap"; s.innerHTML=`<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`; document.body.appendChild(s); s.querySelector("[data-close]").onclick=closeSheet; if(bind) bind(s); }
function closeSheet(){ const s=document.getElementById("sheetwrap"); if(s) s.remove(); }
function openLangSheet(){
  openSheet(`<h2>${esc(t("chooseLanguage"))}</h2><div class="list">${ENABLED_LANGS.map(c=>`<button class="row" type="button" data-l="${c}"><span class="txt"><b>${esc(LANGS[c].label)}</b></span><span class="end check">${S.lang===c?icon("check"):""}</span></button>`).join("")}</div>`,
  s=>s.querySelectorAll("[data-l]").forEach(b=>b.onclick=()=>{S.lang=b.dataset.l;save();Voice.stop();Haptic.tap();closeSheet();refreshSettings();if(!S.profile)Onboard.render();else if(!S.session)Auth.loginScreen();else{if(quiz&&document.querySelector(".qtext"))renderQ();else go(tab);chrome()}}));
}

/* ---------- mini player ---------- */
const Player = {
  show(title, onStop){ this.hide(); const el=document.createElement("div"); el.className="player"; el.id="player"; el.innerHTML=`<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="txt"><small>${esc(t("nowPlaying"))}</small><b>${esc(title)}</b></span><button class="icon-btn" type="button" aria-label="${esc(t("stop"))}">${fillIcon("stop")}</button>`; document.body.appendChild(el); el.querySelector("button").onclick=()=>{Voice.stop();this.hide();if(onStop)onStop()}; },
  title(tt){ const b=document.querySelector("#player b"); if(b) b.textContent=tt; },
  hide(){ const el=document.getElementById("player"); if(el) el.remove(); }
};

/* ---------- home ---------- */
function weekStrip(){
  const days=[]; const d=new Date(); d.setDate(d.getDate()-6);
  for(let i=0;i<7;i++){ const k=dayKey(d); days.push({k,lab:d.toLocaleDateString(S.lang==="ht"?"fr":S.lang,{weekday:"narrow"}),on:S.days.includes(k),today:k===today()}); d.setDate(d.getDate()+1); }
  return `<div class="week">${days.map(x=>`<div>${esc(x.lab)}<i class="${x.on?"on":""} ${x.today?"today":""}">${x.on?icon("check"):""}</i></div>`).join("")}</div>`;
}
function readiness(){
  const w={1:12,2:22,3:18,4:28,5:20}; let tot=0, sum=0, ws=0;
  for(const d in w){ const s=S.dstat[d]; if(s&&s.t){ tot+=s.t; if(s.t>=3){ sum+=w[d]*(s.c/s.t); ws+=w[d]; } } }
  return tot>=20&&ws ? Math.round(sum/ws*100) : null;
}
function viewPractice(){
  const n=todayCount(), st=streak(), missedN=Object.keys(S.missed).length, rd=readiness();
  const dateStr=new Date().toLocaleDateString(S.lang==="ht"?"fr":S.lang,{weekday:"long",month:"long",day:"numeric"});
  app.innerHTML=`<div class="screen enter">
   <div class="head"><div><div class="over">${esc(dateStr)}</div><h1>${esc(S.profile?t("greet",{name:S.profile.name}):t("today"))}</h1></div>${langPill()}</div>
   ${examLabel()?`<div class="exam-chip">${icon("clock")}<span>${esc(examLabel())}</span></div>`:""}
   ${S.profile&&S.profile.level==="beginner"&&Object.keys(S.seen).length<20?`<section class="card tipcard"><p>${esc(t("beginnerTip"))}</p><button class="btn small press" id="m-learn" type="button">${esc(t("openLessons"))}</button></section>`:""}
   <section class="card">
    <div class="hero">${ring(n/GOAL,92,10,"var(--brand)",`<b class="num" style="font-size:26px">${n}</b><small>/ ${GOAL}</small>`)}
     <div class="meta"><span class="muted" style="font-size:14px;font-weight:600">${esc(t("goalTitle"))}</span><span class="big num">${esc(t("goalOf",{n,g:GOAL}))}</span>
      <span class="flame">${icon("flame")}${esc(st===0?t("streak0"):st===1?t("streakN1"):t("streakN",{n:st}))}</span></div></div>
    ${weekStrip()}
    <button class="btn block press" id="m-daily" style="margin-top:18px">${esc(n>=GOAL?t("keepGoing"):t("startDaily",{n:GOAL}))}</button>
    ${n>=GOAL?`<p class="fine" style="text-align:center;margin-top:8px">${esc(t("goalDone"))}</p>`:""}
   </section>
   <section class="card ready">
    <div class="ready-top"><h3>${esc(t("readiness"))}</h3>${rd==null?"":`<span class="num" style="color:${rd>=85?"var(--good)":rd>=70?"var(--d4)":"var(--bad)"}">${rd}%</span>`}</div>
    <div class="stack-bar">${[1,2,3,4,5].map(d=>{const s=S.dstat[d],w=+WEIGHTS[d].replace("%","");const a=s&&s.t?s.c/s.t:0;return `<i style="flex:${w};background:${dc(d)};opacity:${s&&s.t?0.25+0.75*a:0.15}"></i>`}).join("")}</div>
    <div class="legend">${[1,2,3,4,5].map(d=>`<span style="--c:${dc(d)}">D${d} · ${WEIGHTS[d]}</span>`).join("")}</div>
    <p class="fine">${esc(rd==null?t("readinessEmpty"):t("readinessBody"))}</p>
   </section>
   <div><div class="group-label">${esc(t("more"))}</div><div class="list">
    <button class="row" id="m-exam"><span class="tile" style="background-color:#3a4150">${icon("clock")}</span><span class="txt"><b>${esc(t("exam"))}</b><span>${esc(t("examDesc"))}</span></span><span class="end">${icon("chev")}</span></button>
    <button class="row" id="m-missed" ${missedN?"":"disabled"} style="${missedN?"":"opacity:.5"}"><span class="tile" style="background-color:var(--bad)">${icon("redo")}</span><span class="txt"><b>${esc(t("missed"))}</b><span>${esc(t("missedDesc",{n:missedN}))}</span></span><span class="end">${missedN?`<span class="badge">${missedN}</span>`:""}${icon("chev")}</span></button>
    <button class="row" id="m-all"><span class="tile" style="background-color:var(--brand)">${icon("list")}</span><span class="txt"><b>${esc(t("all",{n:EN.q.length}))}</b><span>${esc(t("allDesc"))}</span></span><span class="end">${icon("chev")}</span></button>
   </div></div>
   <div><div class="group-label">${esc(t("domainsTitle"))}</div><div class="list">${[1,2,3,4,5].map(k=>{const cnt=EN.q.filter(q=>q[0]==k).length,s=S.dstat[k]||{c:0,t:0},p=s.t?Math.round(s.c/s.t*100):0;return `<button class="row" data-d="${k}"><span class="tile" style="background-color:${dc(k)}">${icon("d"+k)}</span><span class="txt"><b>${esc(DN(k))}</b><span>${esc(t("qCount",{n:cnt}))} · ${WEIGHTS[k]}</span><span class="bar"><i style="width:${p}%;background:${dc(k)}"></i></span></span><span class="end"><span class="num">${s.t?p+"%":"–"}</span>${icon("chev")}</span></button>`}).join("")}</div></div>
   <p class="fine">${esc(t("disclaimer"))}</p>
  </div>`;
  bindLang();
  document.getElementById("m-daily").onclick=()=>{const missed=shuffle(Object.keys(S.missed).map(Number)).slice(0,Math.ceil(GOAL/3));const rest=shuffle(ALL.filter(i=>!missed.includes(i)));startQuiz(shuffle(missed.concat(rest).slice(0,GOAL)),"quizDaily",false)};
  const ml=document.getElementById("m-learn"); if(ml) ml.onclick=()=>{lessonDomain=1;go("learn")};
  document.getElementById("m-exam").onclick=()=>startQuiz(shuffle(ALL).slice(0,90),"quizExam",true);
  document.getElementById("m-missed").onclick=()=>startQuiz(shuffle(Object.keys(S.missed).map(Number)),"quizMissed",false);
  document.getElementById("m-all").onclick=()=>startQuiz(shuffle(ALL),"quizAll",false);
  app.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>startQuiz(shuffle(ALL.filter(i=>EN.q[i][0]==b.dataset.d)),"quizDomain",false,{d:b.dataset.d}));
}

/* ---------- quiz ---------- */
function startQuiz(list,label,exam,lv){
  Voice.stop(); Player.hide(); clearInterval(timerId); Haptic.tap();
  quiz={list,label,lv:lv||{},exam,i:0,answers:[],order:list.map(()=>shuffle([0,1,2,3])),end:exam?Date.now()+90*60000:0};
  focusMode(true);
  if(exam) timerId=setInterval(()=>{const el=document.getElementById("timer");if(!el)return;const left=quiz.end-Date.now();if(left<=0){clearInterval(timerId);finishQuiz();return}el.textContent=fmt(left);el.classList.toggle("low",left<600000)},1000);
  renderQ(true);
}
const fmt=ms=>{const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
function renderQ(fresh, justAnswered){
  const qi=quiz.list[quiz.i], q=Q(qi), order=quiz.order[quiz.i], ans=quiz.answers[quiz.i];
  const shown=!quiz.exam&&ans!==undefined, ok=ans===0;
  const optHtml=order.map((oi,j)=>{let c="",k="ABCD"[j];
    if(shown){ if(oi===0){c="right";k=icon("check")} else if(ans===oi){c="wrong";k=icon("x")} else c="dim"; }
    else if(ans===oi) c="sel";
    if(justAnswered&&shown&&ans===oi) c+=ok?" pop":" shake";
    return `<button class="opt ${c}" data-o="${oi}" ${shown?"disabled":""}><span class="k">${k}</span><span>${esc(q.opts[oi])}</span></button>`}).join("");
  app.innerHTML=`<div class="screen${fresh?" enter":""}" style="gap:18px">
   <div class="qbar"><button class="icon-btn press" id="quit" type="button" aria-label="${esc(t("close"))}">${icon("x")}</button><div class="segs"><i style="width:${(quiz.i+(ans!==undefined?1:0))/quiz.list.length*100}%"></i></div>${quiz.exam?`<span class="timer" id="timer">${fmt(quiz.end-Date.now())}</span>`:`<span class="timer">${quiz.i+1}/${quiz.list.length}</span>`}</div>
   <div class="row" style="padding:0;min-height:0;justify-content:space-between"><span class="chip" style="--c:${dc(q.d)}">${icon("d"+q.d)}D${q.d} · ${esc(DN(q.d))}</span>${Voice.available?`<button class="icon-btn press" id="ql" type="button" aria-label="${esc(t("listen"))}">${icon("speaker")}</button>`:""}</div>
   <p class="muted" style="font-size:14px;font-weight:600">${esc(t("questionOf",{i:quiz.i+1,n:quiz.list.length}))}</p>
   <p class="qtext">${esc(q.q)}</p>
   <div class="opts">${optHtml}</div>
  </div>
  ${shown?`<div class="dock fb ${ok?"ok":"no"}"><div class="dock-in"><div class="fb-title"><span class="dot">${icon(ok?"check":"x")}</span>${esc(ok?pick(V().correct).replace(/\.\.\./g,"…"):t("notQuite").split("·")[0].trim())}</div><div class="fb-body">${ok?"":`<p style="margin-bottom:6px"><b>${esc(t("answer"))}: ${esc(q.opts[0])}</b></p>`}<p>${esc(q.exp)}</p></div><button class="btn block press ${ok?"go-ok":"go-no"}" id="next">${esc(quiz.i===quiz.list.length-1?t("finish"):t("continueBtn"))}</button></div></div>`
  : `<div class="dock"><div class="dock-in"><div class="duo"><button class="btn soft press" id="prev" ${quiz.i===0?"disabled":""}>${esc(t("back"))}</button><button class="btn press" id="next" ${(ans===undefined&&!quiz.exam)||(quiz.exam&&ans===undefined)?"disabled":""}>${esc(quiz.i===quiz.list.length-1?t("finish"):t("next"))}</button></div></div></div>`}`;
  app.querySelectorAll(".opt").forEach(b=>b.onclick=()=>{const oi=+b.dataset.o;quiz.answers[quiz.i]=oi;
    if(!quiz.exam){record(qi,oi===0);(oi===0?Haptic.ok:Haptic.no)();renderQ(false,true);if(S.autoRead)speak(Coach.feedback(q,oi===0))}else{Haptic.tap();renderQ()}});
  const ql=document.getElementById("ql"); if(ql) ql.onclick=()=>speak(shown?Coach.feedback(q,ok):Coach.question(q,order));
  const pv=document.getElementById("prev"); if(pv) pv.onclick=()=>{quiz.i--;Voice.stop();renderQ(true)};
  document.getElementById("next").onclick=()=>{Voice.stop();Haptic.tap();if(quiz.i===quiz.list.length-1)finishQuiz();else{quiz.i++;renderQ(true);window.scrollTo(0,0)}};
  document.getElementById("quit").onclick=()=>{if(quiz.answers.some(a=>a!==undefined))finishQuiz();else go("practice")};
  if(fresh&&S.autoRead&&!shown) speak(Coach.question(q,order));
}
function record(qi,ok){ S.seen[qi]=1; const d=EN.q[qi][0]; S.dstat[d]=S.dstat[d]||{c:0,t:0}; S.dstat[d].t++; if(ok){S.dstat[d].c++;delete S.missed[qi]}else S.missed[qi]=1; if(S.daily.d!==today())S.daily={d:today(),n:0}; S.daily.n++; markDay(); save(); }
function finishQuiz(){
  clearInterval(timerId); Voice.stop(); focusMode(false);
  const res={}; let c=0, answered=0;
  quiz.list.forEach((qi,k)=>{const a=quiz.answers[k],d=EN.q[qi][0];res[d]=res[d]||{c:0,t:0};res[d].t++;if(a!==undefined)answered++;if(a===0){c++;res[d].c++}if(quiz.exam){if(a!==undefined)record(qi,a===0);else S.missed[qi]=1}});
  const pct=Math.round(c/quiz.list.length*100), col=pct>=85?"var(--good)":pct>=70?"var(--d4)":"var(--bad)";
  S.history.unshift({d:today(),label:quiz.label,lv:quiz.lv,c,t:quiz.list.length}); S.history=S.history.slice(0,60); markDay(); save();
  const wrong=quiz.list.map((qi,k)=>({qi,a:quiz.answers[k]})).filter(x=>x.a!==0);
  const label=t(quiz.label,quiz.lv); const q0=quiz; quiz=null; chrome();
  app.innerHTML=`<div class="screen enter">
   <div class="head"><div><div class="over">${esc(label)}</div><h1>${esc(t("results").replace(/^./,m=>m.toUpperCase()))}</h1></div></div>
   <section class="card score">${ring(pct/100,168,14,col,`<b style="font-size:44px">${pct}%</b><small>${esc(t("yourScore"))}</small>`)}
    <p style="font-weight:600">${esc(t("ofCorrect",{c,t:q0.list.length}))}${answered<q0.list.length?" · "+esc(t("unanswered",{n:q0.list.length-answered})):""}</p>
    <p class="muted" style="max-width:34ch">${esc(pct>=85?t("msgHigh"):pct>=70?t("msgMid"):t("msgLow"))}</p><span class="chip" style="--c:var(--muted)">${esc(t("target"))}</span></section>
   <div><div class="group-label">${esc(t("byDomainRes"))}</div><div class="list">${Object.keys(res).sort().map(d=>{const r=res[d];return `<div class="row"><span class="tile" style="background-color:${dc(d)}">${icon("d"+d)}</span><span class="txt"><b>${esc(DN(d))}</b><span class="bar"><i style="width:${r.c/r.t*100}%;background:${dc(d)}"></i></span></span><span class="end num">${r.c}/${r.t}</span></div>`}).join("")}</div></div>
   ${wrong.length?`<div><div class="group-label">${esc(t("reviewMisses"))} · ${wrong.length}</div><div class="stack" style="display:flex;flex-direction:column;gap:10px">${wrong.map(x=>{const q=Q(x.qi);return `<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="chip" style="--c:${dc(q.d)}">D${q.d}</span><p class="qtext small">${esc(q.q)}</p>${x.a===undefined?`<p class="fine">${esc(t("unansweredLbl"))}</p>`:`<p class="choice-fb no">${icon("x")} ${esc(q.opts[x.a])}</p>`}<p class="choice-fb ok"><b>${esc(q.opts[0])}</b><br><span style="color:var(--fg-2)">${esc(q.exp)}</span></p></div>`}).join("")}</div></div>`:""}
   <div style="display:flex;flex-direction:column;gap:10px">${wrong.length?`<button class="btn block press" id="redo">${esc(t("retryMissed",{n:wrong.length}))}</button>`:""}<button class="btn soft block press" id="again">${esc(t("backPractice"))}</button></div>
  </div>`;
  document.getElementById("again").onclick=()=>go("practice");
  const r=document.getElementById("redo"); if(r) r.onclick=()=>startQuiz(shuffle(wrong.map(x=>x.qi)),"quizRetry",false);
  (pct>=70?Haptic.ok:Haptic.tap)();
  if(S.autoRead) speak(Voice.chunk(t("ofCorrect",{c,t:q0.list.length})+". "+(pct>=85?V().great:V().keep),{pitch:pct>=85?1.1:1}));
  window.scrollTo(0,0);
}

/* ---------- lessons ---------- */
let lessonDomain=1;
function viewLearn(){
  const ls=L().lessons[lessonDomain], c=dc(lessonDomain);
  app.innerHTML=`<div class="screen enter">
   <div class="head"><div><div class="over">${esc(t("lessonsEyebrow"))}</div><h1>${esc(t("lessonsTitle"))}</h1></div>${langPill()}</div>
   <div class="scroller" role="group">${[1,2,3,4,5].map(k=>`<button class="dchip press" type="button" data-ld="${k}" style="--c:${dc(k)}" aria-pressed="${k===lessonDomain}"><i></i>D${k}</button>`).join("")}</div>
   <section class="lesson-hero" style="--c:${c}"><span class="over">${esc(t("domain"))} ${lessonDomain} · ${WEIGHTS[lessonDomain]} · ${esc(t("topics",{n:ls.length}))}</span><h2>${esc(DN(lessonDomain))}</h2>
    ${Voice.available?`<button class="btn small press" id="playall" type="button">${fillIcon("play")}${esc(t("listenDomain"))}</button>`:""}</section>
   <div style="display:flex;flex-direction:column;gap:12px">${ls.map((l,i)=>`<section class="card topic" id="lc${i}" style="--c:${c}"><div class="topic-head"><span class="n">${i+1}</span><h3>${esc(l[0])}</h3>${Voice.available?`<button class="icon-btn press" id="l${i}" type="button" aria-label="${esc(t("listen"))}">${icon("speaker")}</button>`:""}</div><ul>${l[1].split("|").map(x=>`<li>${esc(x)}</li>`).join("")}</ul><div class="tip"><b>${esc(t("examTip"))}</b>${esc(l[2])}</div></section>`).join("")}</div>
   <button class="btn block press" id="drill" style="background:${c};color:#fff">${esc(t("drill",{d:lessonDomain}))}</button>
   ${Voice.available?"":`<p class="fine">${esc(t("audioNA"))}</p>`}
  </div>`;
  bindLang();
  app.querySelectorAll("[data-ld]").forEach(b=>b.onclick=()=>{Voice.stop();Player.hide();Haptic.tap();lessonDomain=+b.dataset.ld;viewLearn()});
  const mark=i=>{app.querySelectorAll(".topic").forEach(x=>x.classList.remove("playing"));const el=document.getElementById("lc"+i);if(el){el.classList.add("playing");el.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"})}};
  const done=()=>{mark(-1);Player.hide()};
  ls.forEach((l,i)=>{const b=document.getElementById("l"+i);if(b)b.onclick=()=>{mark(i);Player.show(l[0],done);speak(Coach.lesson(l,true),done)}});
  const pa=document.getElementById("playall"); if(pa) pa.onclick=()=>{let i=0;Player.show(ls[0][0],done);const next=()=>{if(i<ls.length){mark(i);Player.title(ls[i][0]);speak(Coach.lesson(ls[i],i===0),next);i++}else done()};next()};
  document.getElementById("drill").onclick=()=>startQuiz(shuffle(ALL.filter(i=>EN.q[i][0]==lessonDomain)),"quizDomain",false,{d:lessonDomain});
}

/* ---------- scenarios ---------- */
function clearScen(){ scenTimers.forEach(clearTimeout); scenTimers=[]; }
function viewScenarios(){
  app.innerHTML=`<div class="screen enter">
   <div class="head"><div><div class="over">${esc(t("scenEyebrow"))}</div><h1>${esc(t("scenTitle"))}</h1></div>${langPill()}</div>
   <p class="muted">${esc(t("scenBody"))}</p>
   <div style="display:flex;flex-direction:column;gap:12px">${EN.scen.map((s,i)=>{const ls=L().scen[i]||s,r=S.scen[s.id],lg=s.steps[0].log,hot=lg.slice(1).find(x=>/alert|warn/i.test(x))||lg[1]||"";
    return `<button class="scen-card press" data-s="${i}" style="--c:${dc(s.dom)}"><span class="tag">D${s.dom}</span><span class="log">${esc(s.steps[0].log[0])}</span><span class="log"><em>${esc(hot)}</em></span><h3>${esc(ls.title)}</h3><span class="foot"><span>${esc(t("decisions",{n:s.steps.length}))} · ${esc(r?t("best",{s:r,t:s.steps.length}):t("notPlayed"))}</span><span class="play">${fillIcon("play")}</span></span></button>`}).join("")}</div>
  </div>`;
  bindLang();
  app.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{Haptic.tap();playScen(+b.dataset.s)});
}
function playScen(si){
  const E=EN.scen[si]; let step=0, score=0, narrate=Voice.available;
  const loc=()=>L().scen[si]||E;
  focusMode(true);
  const render=()=>{
    clearScen(); Voice.stop();
    const s=loc(), st=s.steps[step], es=E.steps[step], order=shuffle(es.choices.map((_,i)=>i));
    app.innerHTML=`<div class="screen enter" style="gap:16px">
     <div class="qbar"><button class="icon-btn press" id="sx" type="button" aria-label="${esc(t("exit"))}">${icon("x")}</button><div class="segs"><i style="width:${step/E.steps.length*100}%"></i></div><span class="timer">${step+1}/${E.steps.length}</span></div>
     <div class="row" style="padding:0;min-height:0;justify-content:space-between"><span class="live">${esc(t("live"))}</span>${Voice.available?`<button class="icon-btn press" id="narr" type="button" aria-pressed="${narrate}" aria-label="${esc(narrate?t("narrOn"):t("narrOff"))}" style="${narrate?"color:var(--brand)":"opacity:.5"}">${icon("speaker")}</button>`:""}</div>
     <h2>${esc(s.title)}</h2>
     ${step===0?`<p class="muted">${esc(s.intro)}</p>`:""}
     <div class="term" id="term" aria-live="polite"></div>
     <p class="say" id="say" hidden>${esc(st.say)}</p>
     <div class="opts" id="ch" hidden>${order.map((i,j)=>`<button class="opt" data-c="${i}"><span class="k">${"ABC"[j]}</span><span>${esc((st.choices[i]||es.choices[i])[0])}</span></button>`).join("")}</div>
     <div id="fb"></div>
    </div><div class="dock" id="sdock" hidden><div class="dock-in"><button class="btn block press" id="snext">${esc(step===E.steps.length-1?t("seeDebrief"):t("nextStep"))}</button></div></div>`;
    const term=document.getElementById("term"), reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveal=()=>{document.getElementById("say").hidden=false;document.getElementById("ch").hidden=false;
      if(narrate){let p=[];if(step===0){p=p.concat(Voice.chunk(pick(V().scenStart),{pitch:0.94,rate:0.92,after:600}));p=p.concat(Voice.chunk(s.intro,{pitch:0.95,rate:0.95,after:700}))}p=p.concat(Voice.chunk(st.say,{pitch:0.97,rate:0.96}));speak(p)}};
    es.log.forEach((line,i)=>scenTimers.push(setTimeout(()=>{const d=document.createElement("div");d.textContent=line;if(/alert/i.test(line))d.className="alert";else if(/warn/i.test(line))d.className="warn";else if(/\[ok\]|NOT sent|denied/i.test(line))d.className="ok";term.appendChild(d);term.scrollTop=term.scrollHeight;if(i===es.log.length-1)reveal()},reduce?0:600+i*900)));
    document.getElementById("sx").onclick=()=>go("scenarios");
    const nb=document.getElementById("narr"); if(nb) nb.onclick=()=>{narrate=!narrate;if(!narrate)Voice.stop();nb.style.cssText=narrate?"color:var(--brand)":"opacity:.5";nb.setAttribute("aria-pressed",narrate)};
    app.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{
      const ci=+b.dataset.c, ok=!!es.choices[ci][1], fb=(st.choices[ci]&&st.choices[ci][st.choices[ci].length-1])||es.choices[ci][2];
      if(ok) score++; (ok?Haptic.ok:Haptic.no)();
      app.querySelectorAll("[data-c]").forEach(x=>{x.disabled=true;const k=+x.dataset.c;if(es.choices[k][1]){x.classList.add("right");x.querySelector(".k").innerHTML=icon("check")}else if(x===b){x.classList.add("wrong","shake");x.querySelector(".k").innerHTML=icon("x")}else x.classList.add("dim")});
      document.getElementById("fb").innerHTML=`<p class="choice-fb ${ok?"ok":"no"}">${esc(fb)}</p>`;
      if(narrate) speak(Voice.chunk(fb,{pitch:ok?1.08:0.96,rate:ok?1.02:0.94}));
      document.getElementById("sdock").hidden=false;
    });
    document.getElementById("snext").onclick=()=>{Haptic.tap();if(step<E.steps.length-1){step++;render();window.scrollTo(0,0)}else debrief()};
  };
  const debrief=()=>{clearScen();Voice.stop();focusMode(false);S.scen[E.id]=Math.max(S.scen[E.id]||0,score);markDay();save();chrome();
    const full=score===E.steps.length;
    app.innerHTML=`<div class="screen enter"><div class="head"><div><div class="over">${esc(t("debrief"))}</div><h1>${esc(loc().title)}</h1></div></div>
     <section class="card score">${ring(score/E.steps.length,150,13,full?"var(--good)":"var(--d4)",`<b style="font-size:40px">${score}/${E.steps.length}</b>`)}<p class="muted" style="max-width:36ch">${esc(full?t("debriefGood"):t("debriefBad"))}</p></section>
     <div style="display:flex;flex-direction:column;gap:10px"><button class="btn block press" id="rp">${esc(t("replay"))}</button><button class="btn soft block press" id="bk">${esc(t("allScen"))}</button></div></div>`;
    document.getElementById("rp").onclick=()=>playScen(si); document.getElementById("bk").onclick=()=>go("scenarios");
    if(narrate) speak(Voice.chunk(V().score.replace("{s}",score).replace("{t}",E.steps.length)+" "+(full?V().great:V().keep),{pitch:full?1.1:1}));
    window.scrollTo(0,0);
  };
  render();
}

/* ---------- progress + settings ---------- */
function viewProgress(){
  const tot=Object.values(S.dstat).reduce((a,b)=>({c:a.c+b.c,t:a.t+b.t}),{c:0,t:0}), acc=tot.t?Math.round(tot.c/tot.t*100):0;
  const weakest=Object.entries(S.dstat).filter(([,v])=>v.t>=5).sort((a,b)=>a[1].c/a[1].t-b[1].c/b[1].t)[0];
  app.innerHTML=`<div class="screen enter">
   <div class="head"><div><div class="over">${esc(t("progEyebrow"))}</div><h1>${esc(t("progTitle"))}</h1></div>${langPill()}</div>
   <div class="stats"><div class="stat"><b style="color:var(--flame)">${streak()}</b><span>${esc(t("dayStreak"))}</span></div><div class="stat"><b>${tot.t}</b><span>${esc(t("answers"))}</span></div><div class="stat"><b>${acc}%</b><span>${esc(t("accuracy"))}</span></div></div>
   ${weakest?`<div class="tip" style="--c:${dc(weakest[0])}"><b>${esc(t("focusLbl"))}</b>${esc(t("focusNext",{d:weakest[0],n:DN(weakest[0])}))}</div>`:`<div class="tip"><b>${esc(t("startLbl"))}</b>${esc(t("startBody"))}</div>`}
   <div><div class="group-label">${esc(t("accByDomain"))}</div><div class="list">${[1,2,3,4,5].map(k=>{const s=S.dstat[k]||{c:0,t:0},p=s.t?Math.round(s.c/s.t*100):0;return `<div class="row"><span class="tile" style="background-color:${dc(k)}">${icon("d"+k)}</span><span class="txt"><b>${esc(DN(k))}</b><span>${esc(s.t?s.c+"/"+s.t:t("noAnswers"))}</span><span class="bar"><i style="width:${p}%;background:${dc(k)}"></i></span></span><span class="end num">${s.t?p+"%":"–"}</span></div>`}).join("")}</div></div>
   <div><div class="group-label">${esc(t("recent"))}</div>${S.history.length?`<div class="list hist">${S.history.slice(0,12).map(h=>{const p=Math.round(h.c/h.t*100);return `<div class="row"><span class="txt"><b>${esc(t(h.label,h.lv))}</b><span>${esc(h.d)}</span></span><span class="end num" style="color:${p>=85?"var(--good)":p>=70?"var(--d4)":"var(--bad)"}">${p}%</span></div>`}).join("")}</div>`:`<p class="muted">${esc(t("noSessions"))}</p>`}</div>
   <p class="fine">${esc(t("examFacts"))}</p>
  </div>`;
  bindLang();
}

/* ---------- settings panel (top-right gear) ---------- */
const THEMES=[["original","themeOriginal","#eef1f6","#5ec8d4","#a48cff","#ffb27a"],["ocean","themeOcean","#e9f2ff","#2f7dff","#22c3e6","#4f6bff"],["glacier","themeGlacier","#f3f4ff","#8cc8ff","#b9a8ff","#6fa9ff"]];
function settingsBody(){
  const vl=Voice.list(), cur=Voice.chosen();
  const sw=(base,a,b,c)=>`background:radial-gradient(circle at 25% 30%,${a},transparent 62%),radial-gradient(circle at 78% 65%,${b},transparent 60%),radial-gradient(circle at 40% 95%,${c},transparent 55%),${base}`;
  const P=S.profile||{}, lvl={beginner:"level1",some:"level2",pro:"level3"}[P.level]||"level2";
  return `<div class="settings-body">
   <section><div class="group-label">${esc(t("profile"))}</div><div class="list">
    <ion-item lines="inset"><span class="avatar small" slot="start">${esc((P.name||"?").charAt(0).toUpperCase())}</span><ion-label><b>${esc(P.name||"")}</b><p>${esc(t(lvl))}</p></ion-label></ion-item>
    <ion-item lines="inset"><span class="tile" slot="start" style="background-color:var(--d3)">${icon("clock")}</span><ion-label>${esc(t("examDate"))}<p>${esc(examLabel()||t("notScheduled"))}</p></ion-label><input slot="end" type="date" id="pexam" value="${esc(P.exam||"")}"></ion-item>
    <ion-item lines="none"><span class="tile" slot="start" style="background-color:var(--brand)">${icon("flame")}</span><ion-label>${esc(t("dailyGoal"))}</ion-label></ion-item>
    <div class="seg-wrap" style="padding-top:0"><ion-segment id="pgoal" value="${P.goal||25}">${[10,25,50].map(g=>`<ion-segment-button value="${g}"><ion-label>${g}</ion-label></ion-segment-button>`).join("")}</ion-segment></div>
   </div></section>
   <section><div class="group-label">${esc(t("background"))}</div>
    <div class="themes" role="group" aria-label="${esc(t("background"))}">${THEMES.map(([id,k,base,a,b,c])=>`<button type="button" data-theme-bg="${id}" aria-pressed="${(S.bg||"glacier")===id}"><span class="sw" style="${sw(base,a,b,c)}"></span>${esc(t(k))}</button>`).join("")}</div></section>
   <section><div class="group-label">${esc(t("appearance"))}</div>
    <div class="list seg-wrap"><ion-segment id="appear" value="${S.appearance||"auto"}">${["light","dark","auto"].map(a=>`<ion-segment-button value="${a}"><ion-label>${esc(t("appear"+a[0].toUpperCase()+a.slice(1)))}</ion-label></ion-segment-button>`).join("")}</ion-segment></div></section>
   <section><div class="group-label">${esc(t("language"))}</div>
    <div class="list seg-wrap"><ion-segment id="langseg" value="${S.lang}">${ENABLED_LANGS.map(c=>`<ion-segment-button value="${c}"><ion-label>${esc(LANGS[c].label)}</ion-label></ion-segment-button>`).join("")}</ion-segment></div></section>
   <section><div class="group-label">${esc(t("voiceCoach"))}</div>${Voice.available?`<div class="list">
    <ion-item lines="inset"><span class="tile" slot="start" style="background-color:var(--brand)">${icon("speaker")}</span><ion-select id="vsel" label="${esc(t("voice"))}" interface="popover" value="${esc(S.voice[S.lang]||"")}"><ion-select-option value="">${esc(t("voiceAuto"))}${cur&&!S.voice[S.lang]?" · "+esc(cur.v.name):""}</ion-select-option>${vl.map(x=>`<ion-select-option value="${esc(x.v.name)}">${esc(x.v.name)} (${esc(x.v.lang)})</ion-select-option>`).join("")}</ion-select></ion-item>
    <ion-item lines="none"><span class="tile" slot="start" style="background-color:var(--d1)">${icon("clock")}</span><ion-label>${esc(t("speed"))}</ion-label><ion-note slot="end" id="ratev">${(+S.rate).toFixed(2)}×</ion-note></ion-item>
    <ion-item lines="inset"><ion-range id="rate" min="0.8" max="1.3" step="0.05" value="${S.rate}" aria-label="${esc(t("speed"))}"></ion-range></ion-item>
    <ion-item lines="inset"><span class="tile" slot="start" style="background-color:var(--d5)">${icon("play")}</span><ion-toggle id="auto" ${S.autoRead?"checked":""}>${esc(t("autoRead"))}</ion-toggle></ion-item>
    <ion-item lines="none" button detail id="testv"><span class="tile" slot="start" style="background-color:#3a4150">${fillIcon("play")}</span><ion-label>${esc(t("testVoice"))}</ion-label></ion-item>
   </div><p class="fine" style="padding:8px 4px 0">${esc(t("voiceHelp"))}</p>`:`<p class="fine">${esc(t("audioNA"))}</p>`}</section>
   <section><div class="group-label">${esc(t("reminder"))}</div><div class="list">
    <ion-item lines="inset"><span class="tile" slot="start" style="background-color:var(--flame)">${icon("flame")}</span><ion-toggle id="rem" ${S.remind.on?"checked":""} ${Remind.available?"":"disabled"}>${esc(t("reminderOn"))}</ion-toggle></ion-item>
    <ion-item lines="none"><span class="tile" slot="start" style="background-color:var(--d4)">${icon("clock")}</span><ion-label>${esc(t("reminderTime"))}</ion-label><input slot="end" type="time" id="remt" value="${esc(S.remind.time)}" ${Remind.available?"":"disabled"}></ion-item>
   </div><p class="fine" id="remmsg" aria-live="polite" style="padding:6px 4px 0">${Remind.available?"":esc(t("reminderAppOnly"))}</p></section>
   <section><div class="list">
    <ion-item lines="inset" button id="logout"><span class="tile" slot="start" style="background-color:var(--bad)">${icon("logout")}</span><ion-label><span style="color:var(--bad);font-weight:600">${esc(t("logout"))}</span><p>${esc(t("logoutBody"))}</p></ion-label></ion-item>
    <ion-item lines="none" button id="delprof"><span class="tile" slot="start" style="background-color:#3a4150">${icon("x")}</span><ion-label><span style="color:var(--bad);font-weight:600">${esc(t("deleteProfile"))}</span><p>${esc(t("deleteBody"))}</p></ion-label></ion-item>
   </div></section>
   <section class="fine-block"><p class="fine">${esc(t("disclaimer"))}</p><p class="fine">${esc(t("privacy"))}</p></section>
  </div>`;
}
let settingsHost=null;
function bindSettings(root){
  const on=(id,ev,fn)=>{const el=root.querySelector("#"+id);if(el)el.addEventListener(ev,fn)};
  root.querySelectorAll("[data-theme-bg]").forEach(b=>b.onclick=()=>{S.bg=b.dataset.themeBg;save();Look.apply();Haptic.tap();root.querySelectorAll("[data-theme-bg]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
  on("appear","ionChange",e=>{S.appearance=e.detail.value;save();Look.apply();Haptic.tap()});
  on("langseg","ionChange",e=>{if(e.detail.value===S.lang)return;S.lang=e.detail.value;save();Voice.stop();refreshSettings();chrome();rerenderBehind()});
  on("vsel","ionChange",e=>{S.voice[S.lang]=e.detail.value||"";save();speak(Voice.chunk(t("voiceSample")))});
  on("rate","ionInput",e=>{const v=root.querySelector("#ratev");if(v)v.textContent=(+e.detail.value).toFixed(2)+"×"});
  on("rate","ionChange",e=>{S.rate=+e.detail.value;save()});
  on("auto","ionChange",e=>{S.autoRead=e.detail.checked;save();Haptic.tap()});
  on("testv","click",()=>speak(Voice.chunk(t("voiceSample"),{pitch:1.04})));
  const msg=m=>{const el=root.querySelector("#remmsg");if(el)el.textContent=m};
  on("rem","ionChange",async e=>{S.remind.on=e.detail.checked;save();msg(await Remind.apply());const r=root.querySelector("#rem");if(r)r.checked=S.remind.on});
  on("remt","change",async e=>{S.remind.time=e.target.value||"19:00";save();if(S.remind.on)msg(await Remind.apply())});
  on("logout","click",()=>Auth.logout());
  on("delprof","click",()=>Auth.deleteProfile());
  on("pexam","change",e=>{S.profile.exam=e.target.value;save();rerenderBehind()});
  on("pgoal","ionChange",e=>{S.profile.goal=+e.detail.value;GOAL=S.profile.goal;save();rerenderBehind()});
}
function rerenderBehind(){ if(quiz&&document.querySelector(".qtext")) renderQ(); else ({practice:viewPractice,learn:viewLearn,scenarios:viewScenarios,progress:viewProgress})[tab](); }
function refreshSettings(){ if(!settingsHost) return; const box=settingsHost.querySelector(".settings-slot"); box.innerHTML=settingsBody(); bindSettings(box);
  const tt=settingsHost.querySelector(".settings-title"); if(tt) tt.textContent=t("settings"); const dn=settingsHost.querySelector(".settings-done"); if(dn) dn.textContent=t("done"); }
async function openSettings(){
  Haptic.tap(); Voice.stop();
  if(customElements.get("ion-modal")){
    const m=document.createElement("ion-modal"); m.className="settings-modal";
    m.innerHTML=`<ion-header class="ion-no-border"><ion-toolbar><ion-title class="settings-title">${esc(t("settings"))}</ion-title><ion-buttons slot="end"><ion-button class="settings-done" strong="true">${esc(t("done"))}</ion-button></ion-buttons></ion-toolbar></ion-header><ion-content><div class="settings-slot"></div></ion-content>`;
    document.body.appendChild(m); settingsHost=m; refreshSettings();
    m.querySelector(".settings-done").addEventListener("click",()=>m.dismiss());
    m.addEventListener("didDismiss",()=>{m.remove();settingsHost=null});
    await m.present();
  } else {
    openSheet(`<div class="row" style="padding:0;min-height:0;justify-content:space-between"><h2 class="settings-title">${esc(t("settings"))}</h2><button class="btn small settings-done" type="button">${esc(t("done"))}</button></div><div class="settings-slot" style="max-height:72vh;overflow:auto"></div>`,
      s=>{settingsHost=s;refreshSettings();s.querySelector(".settings-done").onclick=()=>{closeSheet();settingsHost=null}});
  }
}
/* =====================================================================
   ACCOUNT: on-device profile with sign-up, PIN login and log out.
   Built so a server account can replace Auth.* later.
   ===================================================================== */
const PIN_LEN = 4;
async function hashPin(pin, salt){
  try{ const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(salt+":"+pin)); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join(""); }
  catch(e){ let h=5381; for(const ch of salt+":"+pin) h=((h<<5)+h+ch.charCodeAt(0))|0; return "x"+(h>>>0).toString(16); }
}
const newSalt=()=>{ try{ return [...crypto.getRandomValues(new Uint8Array(12))].map(b=>b.toString(16).padStart(2,"0")).join(""); }catch(e){ return String(Math.random()).slice(2); } };
function ageFrom(by, bm){ const n=new Date(); let a=n.getFullYear()-by; if(n.getMonth()+1<=bm) a--; return a; } // conservative: birthday counted only after the birth month
function examDays(){ const e=S.profile&&S.profile.exam; if(!e) return null; const d=new Date(e+"T00:00:00"), n=new Date(); n.setHours(0,0,0,0); return Math.round((d-n)/86400000); }
function examLabel(){ const d=examDays(); if(d==null) return ""; if(d<0) return t("examPast"); if(d===0) return t("examToday"); if(d===1) return t("examIn1"); return t("examIn",{n:d}); }
function toast(msg){ const el=document.createElement("div"); el.className="toast glass"; el.setAttribute("role","status"); el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.classList.add("out"),2600); setTimeout(()=>el.remove(),3100); }
function confirmBox(title, message, okText, onOk){
  if(customElements.get("ion-alert")){ const a=document.createElement("ion-alert"); a.header=title; a.message=message;
    a.buttons=[{text:t("cancel"),role:"cancel"},{text:okText,role:"destructive"}]; document.body.appendChild(a);
    a.addEventListener("didDismiss",e=>{a.remove(); if(e.detail&&e.detail.role==="destructive") onOk();}); a.present(); }
  else openSheet(`<h2>${esc(title)}</h2><p class="muted">${esc(message)}</p><button class="btn block" id="cbok" style="background:var(--bad)">${esc(okText)}</button><button class="btn soft block" id="cbno">${esc(t("cancel"))}</button>`,
    s=>{s.querySelector("#cbok").onclick=()=>{closeSheet();onOk()}; s.querySelector("#cbno").onclick=closeSheet;});
}
function closeSettingsPanel(){ const host=settingsHost; settingsHost=null; if(host){ if(host.dismiss) host.dismiss().then(()=>host.isConnected&&host.remove()); else closeSheet(); } }

/* PIN keypad shared by sign-up and login */
function keypad(onDigit){ return `<div class="keypad" role="group">${[1,2,3,4,5,6,7,8,9,"",0,"del"].map(k=>k===""?"<span></span>":`<button type="button" class="key press" data-k="${k}" aria-label="${k==="del"?"Delete":k}">${k==="del"?icon("back"):k}</button>`).join("")}</div>`; }
function bindKeypad(root, get, set, done){
  root.querySelectorAll(".key").forEach(b=>b.onclick=()=>{ let v=get(); if(b.dataset.k==="del") v=v.slice(0,-1); else if(v.length<PIN_LEN) v+=b.dataset.k; Haptic.tap(); set(v); paintDots(root,v); if(v.length===PIN_LEN) setTimeout(()=>done(v),120); });
}
const dots = () => `<div class="pin-dots" aria-hidden="true">${"<i></i>".repeat(PIN_LEN)}</div>`;
function paintDots(root,v){ root.querySelectorAll(".pin-dots i").forEach((d,i)=>d.classList.toggle("on",i<v.length)); }
function shakeDots(root){ const d=root.querySelector(".pin-dots"); if(!d) return; d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake"); }

const Auth = {
  boot(){ if(!S.profile) return Onboard.start(); if(!S.session) return this.loginScreen(); this.enter(); },
  enter(){ GOAL=S.profile.goal||25; S.session=true; save(); focusMode(false); closeSheet(); tab="practice"; chrome(); viewPractice(); },
  loginScreen(msg){
    Voice.stop(); Player.hide(); focusMode(true); quiz=null; let pin="";
    const p=S.profile, lockLeft=()=>Math.max(0,Math.ceil(((S.lockUntil||0)-Date.now())/1000));
    app.innerHTML=`<div class="screen enter auth">
      <div class="auth-top">${langPill(true)}</div>
      <div class="auth-hero"><span class="avatar">${esc((p.name||"?").trim().charAt(0).toUpperCase())}</span><h1>${esc(t("welcomeBack",{name:p.name}))}</h1><p class="muted" id="pinmsg" aria-live="polite">${esc(msg||t("enterPin"))}</p>${dots()}</div>
      ${keypad()}
      <button class="link-btn" type="button" id="forgot">${esc(t("forgotPin"))}</button>
    </div>`;
    bindLang();
    const msgEl=app.querySelector("#pinmsg");
    bindKeypad(app,()=>pin,v=>pin=v,async v=>{
      if(lockLeft()>0){ msgEl.textContent=t("lockedOut",{s:lockLeft()}); pin=""; paintDots(app,pin); return; }
      if(await hashPin(v,p.pin.salt)===p.pin.hash){ S.fails=0; S.lockUntil=0; Haptic.ok(); this.enter(); }
      else { S.fails=(S.fails||0)+1; if(S.fails>=5){ S.lockUntil=Date.now()+30000; S.fails=0; } save(); Haptic.no(); shakeDots(app); pin=""; setTimeout(()=>paintDots(app,pin),350);
        msgEl.textContent=lockLeft()>0?t("lockedOut",{s:lockLeft()}):t("wrongPin"); }
    });
    app.querySelector("#forgot").onclick=()=>confirmBox(t("forgotTitle"),t("forgotMsg"),t("deleteProfile"),()=>this.wipe());
  },
  logout(){ confirmBox(t("logoutTitle"),t("logoutMsg"),t("logout"),()=>{ S.session=false; save(); closeSettingsPanel(); Haptic.ok(); this.loginScreen(); }); },
  deleteProfile(){ confirmBox(t("deleteTitle"),t("deleteMsg"),t("deleteProfile"),()=>{ closeSettingsPanel(); this.wipe(); }); },
  wipe(){ Voice.stop(); const keepLang=S.lang; try{localStorage.removeItem(KEY)}catch(e){}
    for(const k of Object.keys(S)) delete S[k];
    Object.assign(S,{days:[],history:[],missed:{},seen:{},dstat:{},scen:{},lang:keepLang,voice:{},rate:1,autoRead:false,remind:{on:false,time:"19:00"},bg:"glacier",appearance:"auto",daily:{d:"",n:0},v:2});
    save(); try{ if(Remind.available) Remind.apply(); }catch(e){} Look.apply(); Haptic.ok(); Onboard.start(); }
};

/* Sign-up flow */
const Onboard = {
  d:null, i:0,
  STEPS:["welcome","name","birth","level","exam","goal","pin"],
  start(){ this.d={name:"",bm:"",by:"",parent:false,level:"",exam:"",goal:25,pin:"",pin1:""}; this.i=0; Voice.stop(); Player.hide(); focusMode(true); quiz=null; this.render(); },
  canNext(){ const d=this.d, s=this.STEPS[this.i];
    if(s==="name") return d.name.trim().length>0;
    if(s==="birth"){ if(!d.by||!d.bm) return false; const a=ageFrom(+d.by,+d.bm); return a>=13&&(a>=18||d.parent); }
    if(s==="level") return !!d.level;
    return true; },
  next(){ if(!this.canNext()) return; Haptic.tap(); this.i++; this.render(); },
  back(){ if(this.i===0) return; this.i--; this.d.pin=""; this.d.pin1=""; this.render(); },
  render(){
    const d=this.d, s=this.STEPS[this.i], total=this.STEPS.length-1, yr=new Date().getFullYear();
    const head = s==="welcome" ? `<div class="auth-top">${langPill(true)}</div>` :
      `<div class="ob-bar"><button class="icon-btn press" type="button" id="obback" aria-label="${esc(t("back"))}">${icon("back")}</button><div class="segs"><i style="width:${this.i/total*100}%"></i></div><span class="timer">${this.i}/${total}</span></div>`;
    const choice=(name,val,title,sub,cur)=>`<button type="button" class="choice press" data-${name}="${val}" aria-pressed="${String(cur)===String(val)}"><b>${esc(title)}</b><span>${esc(sub)}</span></button>`;
    let body="", next=true;
    if(s==="welcome"){ next=false; body=`<div class="auth-hero welcome"><span class="logo">${icon("d1")}</span><h1>SecPrep Daily</h1><p class="muted">${esc(t("welcomeBody"))}</p></div>
      <div class="ob-actions"><button class="btn block press" id="obstart">${esc(t("createProfile"))}</button><p class="fine" style="text-align:center">${esc(t("privacy"))}</p></div>`; }
    if(s==="name") body=`<h1>${esc(t("nameTitle"))}</h1><p class="muted">${esc(t("nameHint"))}</p><input class="field" id="obname" type="text" autocomplete="given-name" maxlength="30" placeholder="${esc(t("namePh"))}" value="${esc(d.name)}">`;
    if(s==="birth"){ const months=[...Array(12)].map((_,k)=>new Date(2000,k,1).toLocaleDateString(S.lang,{month:"long"}));
      const a=d.by&&d.bm?ageFrom(+d.by,+d.bm):null;
      body=`<h1>${esc(t("birthTitle"))}</h1><p class="muted">${esc(t("birthHint"))}</p>
       <div class="two"><label class="fld"><span>${esc(t("month"))}</span><select id="obbm" class="field"><option value=""></option>${months.map((m,k)=>`<option value="${k+1}" ${+d.bm===k+1?"selected":""}>${esc(m)}</option>`).join("")}</select></label>
       <label class="fld"><span>${esc(t("year"))}</span><select id="obby" class="field"><option value=""></option>${[...Array(90)].map((_,k)=>yr-k).map(y=>`<option value="${y}" ${+d.by===y?"selected":""}>${y}</option>`).join("")}</select></label></div>
       ${a!=null&&a<13?`<div class="notice bad">${esc(t("under13"))}</div>`:""}
       ${a!=null&&a>=13&&a<18?`<div class="notice">${esc(t("minorNote"))}</div><label class="check"><input type="checkbox" id="obparent" ${d.parent?"checked":""}><span>${esc(t("parentCheck"))}</span></label>`:""}`; }
    if(s==="level") body=`<h1>${esc(t("levelTitle"))}</h1><p class="muted">${esc(t("levelHint"))}</p><div class="choices">${choice("lv","beginner",t("level1"),t("level1d"),d.level)}${choice("lv","some",t("level2"),t("level2d"),d.level)}${choice("lv","pro",t("level3"),t("level3d"),d.level)}</div>`;
    if(s==="exam"){ const today=new Date().toISOString().slice(0,10);
      body=`<h1>${esc(t("examTitle"))}</h1><p class="muted">${esc(t("examHint"))}</p><input class="field" id="obexam" type="date" min="${today}" value="${esc(d.exam)}"><button type="button" class="choice press" id="obnoexam" aria-pressed="${!d.exam}"><b>${esc(t("notScheduled"))}</b></button>`; }
    if(s==="goal"){ const days=d.exam?Math.max(1,Math.round((new Date(d.exam+"T00:00:00")-new Date())/86400000)):null, pace=days?Math.min(50,Math.ceil(EN.q.length*2/days)):null;
      body=`<h1>${esc(t("goalPick"))}</h1><p class="muted">${esc(t("goalHint"))}</p><div class="choices">${choice("gl",10,"10 · "+t("goal10"),t("goal10d"),d.goal)}${choice("gl",25,"25 · "+t("goal25"),t("goal25d"),d.goal)}${choice("gl",50,"50 · "+t("goal50"),t("goal50d"),d.goal)}</div>${pace?`<div class="notice">${esc(t("paceHint",{n:pace}))}</div>`:""}`; }
    if(s==="pin"){ next=false; body=`<div class="auth-hero"><h1>${esc(d.pin1?t("pinConfirm"):t("pinTitle"))}</h1><p class="muted" id="pinmsg" aria-live="polite">${esc(t("pinHint"))}</p>${dots()}</div>${keypad()}`; }
    app.innerHTML=`<div class="screen enter auth ob">${head}<div class="ob-body">${body}</div></div>${next?`<div class="dock"><div class="dock-in"><button class="btn block press" id="obnext" ${this.canNext()?"":"disabled"}>${esc(t("next"))}</button></div></div>`:""}`;
    bindLang();
    const $=id=>app.querySelector("#"+id)||document.getElementById(id);
    const refresh=()=>{const n=$("obnext"); if(n) n.disabled=!this.canNext();};
    if($("obstart")) $("obstart").onclick=()=>this.next();
    if($("obback")) $("obback").onclick=()=>this.back();
    if($("obnext")) $("obnext").onclick=()=>this.next();
    if($("obname")){ const f=$("obname"); f.oninput=()=>{d.name=f.value;refresh()}; f.onkeydown=e=>{if(e.key==="Enter")this.next()}; setTimeout(()=>f.focus(),350); }
    if($("obbm")) $("obbm").onchange=e=>{d.bm=e.target.value;d.parent=false;this.render()};
    if($("obby")) $("obby").onchange=e=>{d.by=e.target.value;d.parent=false;this.render()};
    if($("obparent")) $("obparent").onchange=e=>{d.parent=e.target.checked;refresh()};
    app.querySelectorAll("[data-lv]").forEach(b=>b.onclick=()=>{d.level=b.dataset.lv;Haptic.tap();app.querySelectorAll("[data-lv]").forEach(x=>x.setAttribute("aria-pressed",x===b));refresh()});
    app.querySelectorAll("[data-gl]").forEach(b=>b.onclick=()=>{d.goal=+b.dataset.gl;Haptic.tap();app.querySelectorAll("[data-gl]").forEach(x=>x.setAttribute("aria-pressed",x===b))});
    if($("obexam")) $("obexam").onchange=e=>{d.exam=e.target.value;$("obnoexam").setAttribute("aria-pressed",!d.exam)};
    if($("obnoexam")) $("obnoexam").onclick=()=>{d.exam="";$("obexam").value="";$("obnoexam").setAttribute("aria-pressed","true")};
    if(s==="pin") bindKeypad(app,()=>d.pin,v=>d.pin=v,async v=>{
      if(!d.pin1){ d.pin1=v; d.pin=""; this.render(); return; }
      if(v!==d.pin1){ Haptic.no(); d.pin1=""; d.pin=""; this.render(); const m=app.querySelector("#pinmsg"); if(m) m.textContent=t("pinMismatch"); shakeDots(app); return; }
      const salt=newSalt();
      S.profile={name:d.name.trim(),bm:+d.bm,by:+d.by,parentAck:!!d.parent,level:d.level,exam:d.exam,goal:d.goal,pin:{salt,hash:await hashPin(v,salt)},created:today()};
      S.session=true; save(); Haptic.ok(); Auth.enter();
    });
  }
};

/* =====================================================================
   CONTENT UPDATES: download new questions, lessons and scenarios from
   SECPREP_CONFIG.contentUrl, keep them for offline use.
   Questions must only be added at the end, never reordered or removed.
   ===================================================================== */
const Content = {
  KEY:"secprep-content", base:{},
  cfg(){ return window.SECPREP_CONFIG||{}; },
  current(){ return (this.cached()&&this.cached().version)||this.cfg().builtInVersion||"0"; },
  cached(){ try{ return JSON.parse(localStorage.getItem(this.KEY)); }catch(e){ return null; } },
  valid(c){ try{
      if(!c||!c.version||!c.langs||!c.langs.en) return false;
      const n=c.langs.en.q.length; if(n<this.base.en) return false;
      for(const code of ENABLED_LANGS){ const l=c.langs[code]; if(!l) continue; if(l.q.length!==n) return false;
        if(!l.q.every(q=>Array.isArray(q)&&q.length===5&&typeof q[1]==="string"&&Array.isArray(q[3])&&q[3].length===3)) return false; }
      return true; }catch(e){ return false; } },
  apply(c){ for(const code of Object.keys(c.langs)){ if(!LANGS[code]) continue; const l=c.langs[code];
      ["q","lessons","scen","domains"].forEach(k=>{ if(l[k]) LANGS[code][k]=l[k]; }); } ALL.length=0; EN.q.forEach((_,i)=>ALL.push(i)); },
  applyCached(){ this.base.en=EN.q.length; const c=this.cached(); if(c&&this.valid(c)&&c.version>(this.cfg().builtInVersion||"0")) this.apply(c); },
  async check(force){
    const url=this.cfg().contentUrl; if(!url||(navigator.onLine===false)) return;
    const last=+(localStorage.getItem(this.KEY+"-checked")||0); if(!force&&Date.now()-last<(this.cfg().checkEveryHours||6)*3600e3) return;
    try{ localStorage.setItem(this.KEY+"-checked",String(Date.now())); }catch(e){}
    try{ const r=await fetch(url,{cache:"no-store"}); if(!r.ok) return; const c=await r.json();
      if(!this.valid(c)||!(c.version>this.current())) return;
      const before=EN.q.length; try{ localStorage.setItem(this.KEY,JSON.stringify(c)); }catch(e){}
      this.apply(c); const added=EN.q.length-before;
      toast(added===1?t("contentUpdated1"):added>0?t("contentUpdatedN",{n:added}):t("contentUpdated"));
      if(!quiz&&S.session&&document.querySelector(".screen")&&!document.querySelector(".auth")) rerenderBehind();
    }catch(e){}
  }
};
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") Content.check(); });

Voice.onVoices = () => { refreshSettings(); };

Content.applyCached(); Auth.boot(); Content.check(true);
})();
