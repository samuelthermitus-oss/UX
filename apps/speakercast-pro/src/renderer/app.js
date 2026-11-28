import { Engine, MIN_SPEAKERS, MAX_SPEAKERS } from './engine/engine.js';
import { ROLES, eqResponseDb, defaultEq } from './engine/dsp.js';
import { store, serializeSetup, parseSetup } from './engine/setups.js';

const engine = new Engine();
window.__engine = engine; // handy for debugging from DevTools

const safeGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } };

const ui = {
  view: 'mixer',
  theme: safeGet('speakercast.theme', 'graphite'),
  eqTab: 'ALL',
  eqSel: 4,
  seeking: false,
  pointerDown: false,
  pending: false,
  setupName: '',
  toast: null,
};
document.documentElement.dataset.theme = ui.theme;

// ---------------------------------------------------------------- helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
const fmtDb = (v) => (v > 0 ? '+' : '') + v.toFixed(1);
const fmtF = (f) => (f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' kHz' : Math.round(f) + ' Hz');
const pct = (v, lo, hi) => `${((v - lo) / (hi - lo)) * 100}%`;
const ROLE_COLORS = { ST: '#3CC8E8', FL: '#3CC8E8', FR: '#3CC8E8', C: '#F2B84B', SL: '#9B8CFF', SR: '#9B8CFF', RL: '#FF8A5B', RR: '#FF8A5B', SUB: '#3DDC97', MONO: '#AEB5BF' };
const BAND_COLORS = ['#3CC8E8', '#5B9BFF', '#9B8CFF', '#E879F9', '#F2B84B', '#FF8A5B', '#3DDC97', '#A3E635'];
const BAND_NAMES = { lowcut: 'Low Cut', lowshelf: 'Low Shelf', bell: 'Bell', highshelf: 'High Shelf', highcut: 'High Cut' };

const I = {
  logo: '<svg width="24" height="24" viewBox="0 0 26 26" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="13" cy="13" r="3"/><path d="M7.5 7.5a8 8 0 0 0 0 11M18.5 7.5a8 8 0 0 1 0 11M4 4a13 13 0 0 0 0 18M22 4a13 13 0 0 1 0 18"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4.5" height="16" rx="1"/><rect x="13.5" y="4" width="4.5" height="16" rx="1"/></svg>',
  prev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
  next: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
  mixer: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 3v18M12 3v18M18 3v18"/><rect x="4" y="13" width="4" height="3" rx="1"/><rect x="10" y="7" width="4" height="3" rx="1"/><rect x="16" y="15" width="4" height="3" rx="1"/></svg>',
  eq: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 14c3 0 4-6 7-6s4 10 7 10 4-6 6-6"/></svg>',
  sync: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  mic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v4"/></svg>',
  stems: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h6"/><circle cx="18" cy="15" r="3"/></svg>',
  setups: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/></svg>',
  x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  refresh: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M18.5 2v4h-4M5.5 22v-4h4"/></svg>',
  bigmic: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v4"/></svg>',
};

const VIEWS = [
  ['mixer', 'Mixer', I.mixer], ['eq', 'EQ Pro', I.eq], ['sync', 'Sync all', I.sync],
  ['mic', 'Mic & Voice', I.mic], ['stems', 'Stems', I.stems], ['setups', 'Saved setups', I.setups],
];

const EQ_PRESETS = {
  Flat: () => defaultEq(),
  Warm: () => withGains([0, 3, 0, -1, 0, -1.5, -2, 0]),
  'Vocal / Dialogue': () => withGains([0, -3, -2, 0, 3, 2, 0, 0], { 0: { f: 80 } }),
  'Bass Boost': () => withGains([0, 6, 2, 0, 0, 0, 1, 0]),
  'Small speaker': () => withGains([0, 0, -1, 0, 2, 1, 1.5, 0], { 0: { f: 75 } }),
  'Late night': () => withGains([0, -4, -1, 0, 1, 0, -2, 0]),
  'Subwoofer': () => withGains([0, 2, 0, 0, 0, 0, 0, 0], { 0: { f: 25 }, 7: { f: 110, on: true, slope: 24 } }),
};
function withGains(gains, extra = {}) {
  return defaultEq().map((b, i) => ({ ...b, g: b.kind === 'lowcut' || b.kind === 'highcut' ? 0 : gains[i], ...(extra[i] || {}) }));
}

// ---------------------------------------------------------------- rendering
function render() {
  if (ui.pointerDown) { ui.pending = true; return; }
  ui.pending = false;
  const active = document.activeElement;
  const keep = active && active.id ? active.id : null;
  $('#app').innerHTML = `${topBar()}<div class="body">${sidebar()}<main class="main" id="main">${view()}</main></div>${statusBar()}${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ''}`;
  if (keep && $('#' + CSS.escape(keep))) $('#' + CSS.escape(keep)).focus();
  live();
}

function topBar() {
  const t = engine.current;
  const playing = engine.master.playing || engine.sourceKind === 'system';
  const dur = t ? t.buffer.duration : 0;
  return `<header class="top">
    <div class="brand">${I.logo}<span>SpeakerCast <b>Pro</b></span></div>
    <div class="transport">
      <button class="icon-btn" data-act="prev" aria-label="Previous track">${I.prev}</button>
      <button class="icon-btn play" data-act="play" aria-label="${playing ? 'Pause' : 'Play'}">${playing ? I.pause : I.play}</button>
      <button class="icon-btn" data-act="next" aria-label="Next track">${I.next}</button>
    </div>
    <div class="now">
      <div class="now-row"><span class="now-title">${engine.sourceKind === 'system' ? 'System audio (live)' : t ? esc(t.name) : 'No music loaded'}</span><span class="now-time mono" id="time">0:00 / ${fmtTime(dur)}</span></div>
      <input class="seek" id="seek" type="range" min="0" max="${dur || 1}" step="0.1" value="0" data-in="seek" aria-label="Position" ${t && engine.sourceKind === 'file' ? '' : 'disabled'}>
    </div>
    <div class="seg" role="group" aria-label="Source">
      <button data-act="src-files" aria-pressed="${engine.sourceKind === 'file'}">Files</button>
      <button data-act="src-system" aria-pressed="${engine.sourceKind === 'system'}">System audio</button>
    </div>
    <div class="chips mono" id="chips"></div>
    <div class="master">
      <span class="label-xs">Master</span>
      <input id="master" type="range" min="-40" max="6" step="0.5" value="${engine.setup.master}" data-in="master" aria-label="Master volume" style="width:120px; --fill:${pct(engine.setup.master, -40, 6)}">
      <span class="mono" id="master-v" style="width:52px">${fmtDb(engine.setup.master)} dB</span>
    </div>
  </header>`;
}

function sidebar() {
  const saved = store.list().slice(0, 5);
  return `<nav class="side" aria-label="Sections">
    <div class="label-xs" style="padding:6px 10px">Workspace</div>
    ${VIEWS.map(([id, label, icon]) => `<button class="nav" data-act="nav:${id}" ${ui.view === id ? 'aria-current="page"' : ''}>${icon}${label}</button>`).join('')}
    ${saved.length ? `<div class="label-xs side-h">Scenes</div>${saved.map((s) => `<button class="scene" data-act="setup-load:${esc(s.name)}"><span>${esc(s.name)}</span><span class="mono" style="color:var(--faint)">${s.speakers.length}</span></button>`).join('')}` : ''}
    <div class="theme-box">
      <div style="font-size:11px; color:var(--dim)">Theme</div>
      <div class="swatches">
        <button class="swatch" style="background:#0B0D10" data-act="theme:graphite" aria-pressed="${ui.theme === 'graphite'}" aria-label="Studio Graphite"></button>
        <button class="swatch" style="background:#F4F5F7" data-act="theme:daylight" aria-pressed="${ui.theme === 'daylight'}" aria-label="Daylight"></button>
        <button class="swatch" style="background:#1A1030" data-act="theme:midnight" aria-pressed="${ui.theme === 'midnight'}" aria-label="Midnight Neon"></button>
      </div>
    </div>
  </nav>`;
}

function statusBar() {
  const outs = [...engine.outputs.values()];
  const ok = outs.filter((o) => o.status === 'ok').length;
  const off = outs.length - ok;
  return `<footer class="status mono">
    <span class="${engine.master.playing || engine.sourceKind === 'system' ? 'good' : ''}">● ${engine.sourceKind === 'system' ? 'Capturing system audio' : engine.master.playing ? 'Playing' : 'Stopped'}</span>
    <span>${ok} of ${outs.length} speakers online${off ? ` · <span class="bad">${off} offline</span>` : ''}</span>
    <span id="lock">Clock lock: —</span>
    <span id="glitch"></span>
    <span style="margin-left:auto">v2.0</span>
  </footer>`;
}

function view() {
  switch (ui.view) {
    case 'eq': return eqView();
    case 'sync': return syncView();
    case 'mic': return micView();
    case 'stems': return stemsView();
    case 'setups': return setupsView();
    default: return mixerView();
  }
}

// ---- mixer ----------------------------------------------------------------
function deviceOptions(sel) {
  const devs = engine.devices.length ? engine.devices : [{ deviceId: 'default', label: 'System default output' }];
  const known = devs.some((d) => d.deviceId === sel);
  return devs.map((d) => `<option value="${esc(d.deviceId)}" ${d.deviceId === sel ? 'selected' : ''}>${esc(d.label)}</option>`).join('')
    + (known ? '' : `<option value="${esc(sel)}" selected>Disconnected device</option>`);
}

function miniCurve(eq) {
  const W = 104, H = 30, n = 40;
  const freqs = Array.from({ length: n }, (_, i) => 20 * Math.pow(1000, i / (n - 1)));
  const db = eqResponseDb(eq, freqs);
  const d = db.map((v, i) => `${i ? 'L' : 'M'}${(i / (n - 1) * W).toFixed(1)} ${Math.max(2, Math.min(H - 2, H / 2 - v * 0.9)).toFixed(1)}`).join(' ');
  return `<svg class="mini-eq" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="var(--line)"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5"/></svg>`;
}

function mixerView() {
  const n = engine.speakers.length;
  const unnamed = engine.devices.length <= 1 || engine.devices.every((d) => !d.label || /^Output \d+$/.test(d.label) || d.deviceId === 'default');
  const allDefault = engine.speakers.every((s) => s.deviceId === 'default');
  return `<div class="head">
      <div><div class="h1">Mixer</div><div class="sub">${n} speakers · up to ${MAX_SPEAKERS} at once · ${esc(engine.setup.name)}</div></div>
      <div class="row">
        <button class="btn" data-act="open-files">Add music…</button>
        ${unnamed ? '<button class="btn" data-act="unlock">Show device names</button>' : ''}
        <button class="btn" data-act="nav:sync">Sync all</button>
      </div>
    </div>
    ${n < MIN_SPEAKERS ? `<div class="notice"><span>SpeakerCast is built for ${MIN_SPEAKERS} or more speakers. You have ${n}: add ${MIN_SPEAKERS - n} more for full surround.</span><button class="btn" data-act="spk-add">+ Add speaker</button></div>` : ''}
    ${allDefault ? `<div class="notice"><span>Every speaker is on the system default output. Pick each speaker's device (Bluetooth, USB, HDMI, AirPlay) from the menu on its strip.</span></div>` : ''}
    <div class="drop" id="drop">
      <div class="tracks">${engine.playlist.length ? engine.playlist.map((t, i) => `<button class="track" data-act="track:${i}" aria-current="${i === engine.index}">${esc(t.name)} · ${fmtTime(t.buffer.duration)}</button>`).join('') : '<span style="color:var(--dim)">Drop audio files here, or use <b>Add music…</b>. Tracks play gaplessly on every speaker.</span>'}</div>
      ${engine.playlist.length ? '<button class="btn" data-act="clear-playlist">Clear</button>' : ''}
    </div>
    <div class="strips">
      ${engine.speakers.map(strip).join('')}
      ${n < MAX_SPEAKERS ? '<button class="add-strip" data-act="spk-add">+ Add speaker</button>' : ''}
    </div>`;
}

function strip(s) {
  const out = engine.outputs.get(s.id);
  const status = out ? out.status : 'idle';
  const fader = Math.max(-40, Math.min(12, s.gain));
  return `<section class="strip ${status === 'offline' || status === 'error' ? 'offline' : ''}" aria-label="${esc(s.name)}">
    <div class="strip-top">
      <select class="role" data-ch="spk-role:${s.id}" aria-label="Role" style="background:${ROLE_COLORS[s.role]}">${Object.entries(ROLES).map(([k]) => `<option value="${k}" ${k === s.role ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <span class="row" style="gap:4px"><span class="status-dot ${status}" title="${esc(status === 'ok' ? 'Online' : out?.errorText || status)}"></span><button class="x" data-act="spk-del:${s.id}" aria-label="Remove ${esc(s.name)}">${I.x}</button></span>
    </div>
    <input class="name" id="name-${s.id}" value="${esc(s.name)}" data-ch="spk-name:${s.id}" aria-label="Speaker name">
    <select class="dev" data-ch="spk-dev:${s.id}" aria-label="Output device for ${esc(s.name)}">${deviceOptions(s.deviceId)}</select>
    <button class="mini-eq" data-act="eq-open:${s.id}" aria-label="Edit EQ for ${esc(s.name)}" title="Edit EQ">${miniCurve(s.eqBypass ? defaultEq().map((b) => ({ ...b, on: false })) : s.eq)}</button>
    <label class="kv"><span class="label-xs">Delay</span><span class="mono"><input id="delay-${s.id}" type="number" min="0" max="2000" step="0.5" value="${s.delayMs}" data-ch="spk-delay:${s.id}" aria-label="Delay in ms"> ms</span></label>
    <div class="fader-wrap">
      <div class="meter" aria-hidden="true"><i data-meter="${s.id}"></i></div>
      <input class="vfader" id="fader-${s.id}" type="range" min="-40" max="12" step="0.5" value="${fader}" data-in="spk-gain:${s.id}" aria-label="Level for ${esc(s.name)}" style="--fill:${pct(fader, -40, 12)}">
    </div>
    <div class="gain mono" id="gain-${s.id}">${fmtDb(s.gain)} dB</div>
    <div class="ms">
      <button class="m" data-act="spk-mute:${s.id}" aria-pressed="${s.mute}" aria-label="Mute">M</button>
      <button class="s" data-act="spk-solo:${s.id}" aria-pressed="${s.solo}" aria-label="Solo">S</button>
    </div>
  </section>`;
}

// ---- EQ ---------------------------------------------------------------------
const EQW = 1000, EQH = 320;
const xf = (f) => (Math.log10(f) - Math.log10(20)) / 3 * EQW;
const fx = (x) => 20 * Math.pow(10, 3 * x / EQW);
const yg = (g) => EQH / 2 - g * (EQH / 2 / 18);
const gy = (y) => (EQH / 2 - y) / (EQH / 2 / 18);

function eqTarget() {
  if (ui.eqTab === 'ALL') return engine.speakers[0] || null;
  return engine.speakers.find((s) => s.id === ui.eqTab) || engine.speakers[0] || null;
}

function eqView() {
  const s = eqTarget();
  if (!s) return '<div class="card">Add a speaker first.</div>';
  const bands = s.eq;
  const slot = s.abSlot || 'A';
  return `<div class="head">
      <div><div class="h1">EQ Pro <span class="badge">8-BAND PARAMETRIC</span></div><div class="sub">Drag a point to move a band, scroll on it to change its width (Q). ${ui.eqTab === 'ALL' ? 'Linked: edits apply to every speaker.' : 'Editing ' + esc(s.name) + ' only.'}</div></div>
      <div class="row">
        <label class="row" style="gap:6px"><span class="sub" style="margin:0">Preset</span>
          <select class="btn" data-ch="eq-preset" aria-label="Preset"><option value="">Choose…</option>${Object.keys(EQ_PRESETS).map((p) => `<option>${p}</option>`).join('')}</select></label>
        <button class="btn" data-act="eq-copy" ${ui.eqTab === 'ALL' ? 'disabled' : ''}>Copy to all speakers</button>
        <div class="seg" role="group" aria-label="A/B compare">
          <button data-act="eq-ab:A" aria-pressed="${slot === 'A'}">A</button><button data-act="eq-ab:B" aria-pressed="${slot === 'B'}">B</button>
        </div>
        <button class="btn ${s.eqBypass ? 'primary' : ''}" data-act="eq-bypass" aria-pressed="${s.eqBypass}">Bypass</button>
      </div>
    </div>
    <div class="tabs" role="group" aria-label="Speaker">
      <button class="tab" data-act="eq-tab:ALL" aria-pressed="${ui.eqTab === 'ALL'}">All (linked)</button>
      ${engine.speakers.map((x) => `<button class="tab mono" data-act="eq-tab:${x.id}" aria-pressed="${ui.eqTab === x.id}" title="${esc(x.name)}">${esc(x.role)} · ${esc(x.name.slice(0, 14))}</button>`).join('')}
    </div>
    <div class="graph">
      <svg id="eq-svg" viewBox="0 0 ${EQW} ${EQH}" preserveAspectRatio="none" role="img" aria-label="EQ response curve">
        <g id="eq-grid">${eqGrid()}</g>
        <path id="eq-spec" fill="var(--accent)" fill-opacity="0.08" stroke="var(--accent)" stroke-opacity="0.25"/>
        <g id="eq-dyn">${eqDyn(bands, s.eqBypass)}</g>
      </svg>
    </div>
    <div class="bands">${bands.map((b, i) => bandCard(b, i)).join('')}</div>`;
}

function eqGrid() {
  const ticks = [[20, '20'], [50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k'], [20000, '20k']];
  const dbs = [12, 6, 0, -6, -12];
  return ticks.map(([f, t]) => `<line x1="${xf(f)}" y1="0" x2="${xf(f)}" y2="${EQH}" stroke="var(--line)" vector-effect="non-scaling-stroke"/><text x="${Math.min(EQW - 24, xf(f) + 3)}" y="${EQH - 6}">${t}</text>`).join('')
    + dbs.map((d) => `<line x1="0" y1="${yg(d)}" x2="${EQW}" y2="${yg(d)}" stroke="${d === 0 ? 'var(--line2)' : 'var(--line)'}" vector-effect="non-scaling-stroke"/><text x="4" y="${yg(d) - 3}">${d > 0 ? '+' : ''}${d} dB</text>`).join('');
}

function eqDyn(bands, bypass) {
  const n = 200;
  const freqs = Array.from({ length: n }, (_, i) => fx(i / (n - 1) * EQW));
  const total = bypass ? freqs.map(() => 0) : eqResponseDb(bands, freqs);
  const sel = bands[ui.eqSel];
  const selDb = sel && sel.on ? eqResponseDb([sel], freqs) : freqs.map(() => 0);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${(i / (n - 1) * EQW).toFixed(1)} ${Math.max(1, Math.min(EQH - 1, yg(v))).toFixed(1)}`).join(' ');
  const curve = path(total);
  const selPath = path(selDb) + ` L${EQW} ${EQH / 2} L0 ${EQH / 2} Z`;
  const dots = bands.map((b, i) => {
    const y = b.kind === 'lowcut' || b.kind === 'highcut' ? yg(-3) : yg(b.g);
    const r = i === ui.eqSel ? 13 : 10;
    return `<g class="eq-dot" data-band="${i}" style="cursor:grab; opacity:${b.on ? 1 : 0.35}">
      <ellipse cx="${xf(b.f)}" cy="${y}" rx="${r * 0.6}" ry="${r}" fill="${i === ui.eqSel ? BAND_COLORS[i] : 'var(--bg)'}" stroke="${BAND_COLORS[i]}" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </g>`;
  }).join('');
  return `<path d="${selPath}" fill="${BAND_COLORS[ui.eqSel]}" fill-opacity="0.14"/>
    <path d="${curve}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" opacity="${bypass ? 0.4 : 1}"/>${dots}`;
}

function bandCard(b, i) {
  const cut = b.kind === 'lowcut' || b.kind === 'highcut';
  return `<div class="band" style="--bc:${BAND_COLORS[i]}" aria-current="${i === ui.eqSel}">
    <div class="band-h"><button class="band-n" data-act="eq-sel:${i}" aria-label="Select band ${i + 1}">${i + 1}</button><span style="font-size:11px; font-weight:600; color:var(--muted)">${BAND_NAMES[b.kind]}</span>
      <button class="toggle" data-act="eq-on:${i}" aria-pressed="${b.on}" aria-label="Band ${i + 1} on"></button></div>
    <label>FREQ<input class="mono" id="eqf-${i}" type="number" min="20" max="20000" step="1" value="${Math.round(b.f)}" data-ch="eq-field:${i}:f" aria-label="Band ${i + 1} frequency in Hz"></label>
    ${cut
      ? `<label>SLOPE<select data-ch="eq-field:${i}:slope" aria-label="Band ${i + 1} slope"><option value="12" ${b.slope === 12 ? 'selected' : ''}>12 dB/oct</option><option value="24" ${b.slope === 24 ? 'selected' : ''}>24 dB/oct</option></select></label>`
      : `<label>GAIN<input class="mono" id="eqg-${i}" type="number" min="-18" max="18" step="0.5" value="${b.g}" data-ch="eq-field:${i}:g" aria-label="Band ${i + 1} gain in dB"></label>
         <label>Q<input class="mono" id="eqq-${i}" type="number" min="0.1" max="12" step="0.1" value="${b.q}" data-ch="eq-field:${i}:q" aria-label="Band ${i + 1} Q"></label>`}
  </div>`;
}

function setBand(i, patch, { quiet = false } = {}) {
  const targets = ui.eqTab === 'ALL' ? engine.speakers : [eqTarget()];
  for (const s of targets) {
    const eq = s.eq.map((b, j) => (j === i ? { ...b, ...patch } : b));
    withQuiet(() => engine.updateSpeaker(s.id, { eq }));
  }
  if (!quiet) render();
  else {
    const s = eqTarget();
    $('#eq-dyn').innerHTML = eqDyn(s.eq, s.eqBypass);
  }
}

// ---- Sync ------------------------------------------------------------------------
function syncView() {
  const sy = engine.sync;
  const list = engine.speakers;
  const meas = list.map((s) => s.measuredMs).filter((v) => v != null);
  const max = meas.length ? Math.max(...meas) : 0;
  const scale = Math.max(200, Math.ceil((max * 1.2) / 50) * 50);
  const ph = sy.phase;
  const doneN = list.filter((s) => s.measuredMs != null).length;
  return `<div class="head"><div><div class="h1">Sync all speakers</div><div class="sub">Every speaker, especially Bluetooth, has its own delay. Sync all measures each one and makes the faster ones wait, so every beat lands together.</div></div></div>
    <div class="sync-grid">
      <div style="display:flex; flex-direction:column; gap:14px">
        <div class="card" style="text-align:center; display:flex; flex-direction:column; gap:14px">
          <button class="big-btn ${ph}" data-act="sync-run" aria-label="${ph === 'measuring' ? 'Measuring' : 'Sync all speakers'}" ${ph === 'measuring' ? 'disabled' : ''}>
            ${ph === 'done' ? I.check : ph === 'measuring' ? I.bigmic : I.refresh}
            <b>${ph === 'done' ? 'In sync' : ph === 'measuring' ? 'Listening…' : 'Sync all'}</b>
            <span class="mono" style="font-size:11px; opacity:.85">${ph === 'measuring' ? `${doneN} of ${list.length}` : `${list.length} speakers`}</span>
          </button>
          <div><div style="font-size:15px; font-weight:700">${ph === 'done' ? `All ${list.length - (sy.failed?.length || 0)} speakers line up` : ph === 'measuring' ? `Measuring ${esc(list.find((s) => s.id === sy.current)?.name || '…')}` : ph === 'failed' ? "Couldn't hear the speakers" : 'One tap lines up every speaker'}</div>
            <div class="sub" style="margin-top:6px; line-height:1.5">${ph === 'done' ? `Faster speakers now wait for the slowest one${sy.slowest ? ` (${esc(sy.slowest)})` : ''}. ${sy.failed?.length ? `Not heard: ${esc(sy.failed.join(', '))}. Turn them up and try again.` : 'Tap again any time.'}` : ph === 'failed' ? 'Turn the speakers up, put the Mac where you sit, and keep the room quiet.' : 'Sit where you usually listen and keep the room quiet for a few seconds per speaker. Music pauses during the test.'}</div></div>
        </div>
        <div class="card" style="display:flex; flex-direction:column; gap:8px">
          <div style="font-weight:600">How to measure</div>
          <button class="method" data-act="sync-method:mic" aria-pressed="${sy.method === 'mic'}"><b>With the Mac microphone (best)</b><span>Plays a short sweep on each speaker and times when it reaches the mic, to a fraction of a millisecond.</span></button>
          <button class="method" data-act="sync-method:quick" aria-pressed="${sy.method === 'quick'}"><b>Quick estimate (no mic)</b><span>Uses the delay each device reports. Instant, but Bluetooth speakers often report it wrong.</span></button>
        </div>
        <div class="card sub" style="margin:0; line-height:1.5"><b style="color:var(--text)">Clock lock is always on.</b> Each device's clock runs slightly fast or slow; SpeakerCast trims every speaker's speed by up to 0.06% (inaudible) so they never drift apart, without skipping a single sample.</div>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between"><div><div style="font-size:17px; font-weight:700">When each speaker's sound reaches you</div><div class="sub">Grey = measured. Colour = after sync: everyone arrives with the slowest speaker.</div></div>
          <span class="badge">${sy.spreadBefore != null ? `Spread before: ${sy.spreadBefore.toFixed(1)} ms` : 'Not measured yet'}</span></div>
        <div class="sync-row label-xs" style="border-top:none"><span>Speaker</span><span style="text-align:right">Measured</span><span style="text-align:right">Added</span><span class="row mono" style="justify-content:space-between">${[0, 1, 2, 3, 4].map((k) => `<span>${Math.round(scale * k / 4)}</span>`).join('')}</span></div>
        ${list.map((s) => {
          const listening = ph === 'measuring' && sy.current === s.id;
          const m = s.measuredMs;
          return `<div class="sync-row"><span class="row" style="gap:8px; flex-wrap:nowrap"><span class="badge" style="min-width:38px; text-align:center">${esc(s.role)}</span><span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(s.name)}</span></span>
            <span class="mono" style="text-align:right; color:${listening ? 'var(--accent)' : 'inherit'}">${listening ? 'listening…' : m != null ? m.toFixed(1) + ' ms' : '—'}</span>
            <span class="mono" style="text-align:right; color:var(--accent)">${m != null ? '+' + s.delayMs.toFixed(1) + ' ms' : '—'}</span>
            <span class="lane">${m != null ? `<i style="left:${(m / scale) * 100}%; background:var(--faint)"></i><i style="left:${((m + s.delayMs) / scale) * 100}%; background:var(--accent)"></i>` : ''}</span></div>`;
        }).join('')}
      </div>
    </div>`;
}

// ---- Mic ------------------------------------------------------------------------------
function micView() {
  const m = engine.setup.mic;
  const on = !!engine.micStream;
  const slider = (key, label, help, min, max, step, unit) => `<div class="ctl"><span><b>${label}</b><small>${help}</small></span>
    <input id="mic-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${m[key]}" data-in="mic-field:${key}" aria-label="${label}" style="--fill:${pct(m[key], min, max)}">
    <span class="mono" id="micv-${key}" style="text-align:right">${m[key]} ${unit}</span></div>`;
  const sw = (key, label, help) => `<div class="sw"><span><b>${label}</b><small style="display:block; color:var(--dim); font-size:11px">${help}</small></span><button class="toggle" data-act="mic-sw:${key}" aria-pressed="${!!m[key]}" aria-label="${label}"></button></div>`;
  return `<div class="head"><div><div class="h1">Mic &amp; Voice</div><div class="sub">Talk over the music: your voice plays on the speakers you choose and the music dips while you speak.</div></div>
      <button class="btn ${on ? 'primary' : ''}" data-act="mic-toggle">${on ? 'Mic is live — turn off' : 'Turn mic on'}</button></div>
    <div class="two">
      <div class="card">
        <div class="row" style="justify-content:space-between; margin-bottom:8px"><b>Input level</b><span class="mono sub" id="duck-v">${on ? '' : 'off (mic muted)'}</span></div>
        <div class="big-meter" aria-hidden="true"><i id="mic-meter"></i></div>
        <div style="margin-top:12px">
          ${slider('gain', 'Mic level', 'How loud your voice plays', -40, 12, 0.5, 'dB')}
          ${slider('thresholdDb', 'Sensitivity', 'How loud you speak before it ducks', -70, 0, 1, 'dB')}
          ${slider('depthDb', 'Duck amount', 'How far the music drops', 0, 40, 1, 'dB')}
          ${slider('attackMs', 'Attack', 'How fast the music drops', 1, 300, 1, 'ms')}
          ${slider('releaseMs', 'Release', 'How smoothly it returns', 50, 3000, 10, 'ms')}
        </div>
      </div>
      <div class="card">
        ${sw('duck', 'Auto-duck the music', 'Lowers the music while you speak')}
        ${sw('noise', 'Noise reduction', 'Removes hum, fans and room noise')}
        ${sw('rumble', 'Rumble filter', 'Cuts handling and table bumps')}
        ${sw('clarity', 'Voice clarity', 'Lifts presence so speech cuts through')}
        ${sw('feedbackGuard', 'Feedback guard', 'Echo cancelling, and pulls the mic down if it starts to howl')}
        <div style="margin-top:12px"><b>Speakers that play your voice</b>
          <div class="row" style="margin-top:8px">${engine.speakers.map((s) => `<button class="pill" data-act="mic-spk:${s.id}" aria-pressed="${s.micOn}">${esc(s.role)} · ${esc(s.name)}</button>`).join('')}</div>
        </div>
      </div>
    </div>`;
}

// ---- Stems ------------------------------------------------------------------------------
const STEM_PRESETS = {
  Original: { bass: 1, center: 1, wide: 1 },
  'Karaoke (no vocals)': { bass: 1, center: 0, wide: 1 },
  'Vocals up': { bass: 0.8, center: 1.5, wide: 0.8 },
  'Bass party': { bass: 1.6, center: 1, wide: 1 },
  'Wide & airy': { bass: 0.9, center: 0.8, wide: 1.5 },
};
function stemsView() {
  const st = engine.setup.stems;
  const row = (key, label, help) => `<div class="ctl"><span><b>${label}</b><small>${help}</small></span>
    <input id="stem-${key}" type="range" min="0" max="2" step="0.05" value="${st[key]}" data-in="stem:${key}" aria-label="${label}" style="--fill:${pct(st[key], 0, 2)}">
    <span class="mono" id="stemv-${key}" style="text-align:right">${Math.round(st[key] * 100)}%</span></div>`;
  return `<div class="head"><div><div class="h1">Stems</div><div class="sub">Splits the song into bass, centre (vocals, lead, dialogue) and wide (instruments, ambience) in real time, then lets you send each part to different speakers.</div></div></div>
    <div class="row">${Object.keys(STEM_PRESETS).map((p) => `<button class="pill" data-act="stem-preset:${p}" aria-pressed="${JSON.stringify(STEM_PRESETS[p]) === JSON.stringify({ bass: st.bass, center: st.center, wide: st.wide })}">${p}</button>`).join('')}</div>
    <div class="two">
      <div class="card">
        ${row('bass', 'Bass', 'Everything below 120 Hz, in mono')}
        ${row('center', 'Centre · vocals', "What's common to left and right: voice, lead, kick, snare")}
        ${row('wide', 'Wide · instruments', 'What differs between left and right: guitars, keys, reverb')}
        <p class="sub" style="line-height:1.5">Zero-latency signal split (mid/side with phase-matched Linkwitz-Riley crossovers): the three parts add back to the original exactly. It is not an AI separator, so a vocal mixed off-centre stays with the instruments.</p>
      </div>
      <div class="card">
        <b>Per speaker</b>
        <table class="matrix" style="margin-top:6px"><thead><tr><th>Speaker</th><th>Bass</th><th>Centre</th><th>Wide</th></tr></thead><tbody>
        ${engine.speakers.map((s) => `<tr><td><span class="badge">${esc(s.role)}</span> ${esc(s.name)}</td>${['bass', 'center', 'wide'].map((k) => `<td><button class="toggle" data-act="spk-stem:${s.id}:${k}" aria-pressed="${s.stems[k] > 0}" aria-label="${k} on ${esc(s.name)}"></button></td>`).join('')}</tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
}

// ---- Setups ----------------------------------------------------------------------------------
function setupsView() {
  const all = store.list();
  return `<div class="head"><div><div class="h1">Saved setups</div><div class="sub">Save the whole configuration (speakers, devices, roles, levels, delays, EQ, mic and stems) and switch in one click.</div></div>
      <div class="row"><button class="btn" data-act="setup-import">Import…</button><button class="btn" data-act="setup-export">Export current…</button></div></div>
    <div class="card row">
      <input class="text-in" id="setup-name" placeholder="Name this setup" value="${esc(ui.setupName || engine.setup.name)}" data-in="setup-name" aria-label="Setup name">
      <button class="btn primary" data-act="setup-save">Save current setup</button>
    </div>
    <div class="setups">${all.length ? all.map((s) => {
      const delays = s.speakers.map((x) => x.delayMs);
      return `<div class="card setup"><h3>${esc(s.name)}</h3><div class="sub">${s.speakers.length} speakers · saved ${esc(new Date(s.savedAt).toLocaleString())}</div>
        <div style="margin:8px 0">${s.speakers.slice(0, 8).map((x) => `<span class="tag">${esc(x.role)} ${esc(x.name)}</span>`).join('')}${s.speakers.length > 8 ? `<span class="tag">+${s.speakers.length - 8}</span>` : ''}</div>
        <div class="sub mono">Delays ${Math.min(...delays).toFixed(0)}–${Math.max(...delays).toFixed(0)} ms · Master ${fmtDb(s.master)} dB</div>
        <div class="row" style="margin-top:10px"><button class="btn primary" data-act="setup-load:${esc(s.name)}">Load</button><button class="btn" data-act="setup-del:${esc(s.name)}">Delete</button></div></div>`;
    }).join('') : '<div class="card sub">No saved setups yet.</div>'}</div>`;
}

// ---------------------------------------------------------------- live updates (60 fps)
function live() {
  const pos = engine.position();
  const t = engine.current;
  const time = $('#time');
  if (time && engine.sourceKind === 'file') time.textContent = `${fmtTime(Math.min(pos, t ? t.buffer.duration : 0))} / ${fmtTime(t ? t.buffer.duration : 0)}`;
  const seek = $('#seek');
  if (seek && !ui.seeking && t) { seek.value = String(pos); seek.style.setProperty('--fill', pct(Math.min(pos, t.buffer.duration), 0, t.buffer.duration || 1)); }

  const outs = [...engine.outputs.values()].filter((o) => o.ready);
  const first = outs[0];
  const chips = $('#chips');
  if (chips && first) {
    const err = engine.health.maxErrMs;
    const buf = Math.round(((first.ctx.baseLatency || 0) + (first.ctx.outputLatency || 0)) * 1000);
    chips.innerHTML = `<span>${(first.ctx.sampleRate / 1000).toFixed(1)} kHz</span><span>${outs.length} OUT</span><span>BUF ${buf} ms</span><span class="${engine.master.playing ? (err < 1 ? 'good' : err < 5 ? 'warn' : 'bad') : ''}">SYNC ${engine.master.playing ? '±' + err.toFixed(2) + ' ms' : 'idle'}</span>`;
  }
  const lock = $('#lock');
  if (lock) lock.textContent = engine.master.playing ? `Clock lock: worst ${engine.health.maxErrMs.toFixed(2)} ms` : 'Clock lock: ready';
  const gl = $('#glitch');
  if (gl) gl.innerHTML = engine.health.glitches == null ? '' : `Dropouts: <span class="${engine.health.glitches ? 'bad' : 'good'}">${engine.health.glitches}</span>`;

  for (const el of $$('[data-meter]')) {
    const out = engine.outputs.get(el.dataset.meter);
    const { peakDb } = out ? out.meter() : { peakDb: -180 };
    el.style.height = `${Math.max(0, Math.min(100, (peakDb + 60) / 60 * 100))}%`;
  }
  const spec = $('#eq-spec');
  if (spec) {
    const s = eqTarget();
    const out = s && engine.outputs.get(s.id);
    if (out && out.ready) {
      const bins = out.spectrum();
      const nyq = out.ctx.sampleRate / 2;
      let d = `M0 ${EQH}`;
      for (let x = 0; x <= EQW; x += 6) {
        const f = fx(x);
        const db = bins[Math.min(bins.length - 1, Math.round(f / nyq * bins.length))];
        const y = EQH - Math.max(0, Math.min(1, (db + 100) / 90)) * EQH * 0.9;
        d += ` L${x} ${y.toFixed(1)}`;
      }
      spec.setAttribute('d', d + ` L${EQW} ${EQH} Z`);
    }
  }
  const mm = $('#mic-meter');
  if (mm) mm.style.width = `${Math.min(100, Math.max(0, ((20 * Math.log10((engine.micLevel || 0) + 1e-6)) + 60) / 60 * 100))}%`;
  const dv = $('#duck-v');
  if (dv && engine.micStream && first) dv.textContent = `Music ${first.duckGain < 0.98 ? 'ducked ' + (20 * Math.log10(first.duckGain)).toFixed(1) + ' dB' : 'at full level'}`;
}
(function loop() { if (!ui.pointerDown || ui.view !== 'eq') live(); requestAnimationFrame(loop); })();

// ---------------------------------------------------------------- events
let quietDepth = 0;
function withQuiet(fn) { quietDepth++; try { return fn(); } finally { quietDepth--; } }
engine.addEventListener('change', () => { if (!quietDepth) render(); });
engine.addEventListener('toast', (e) => toast(e.detail));
function toast(msg) {
  ui.toast = msg;
  render();
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { ui.toast = null; render(); }, 4200);
}

document.addEventListener('pointerdown', () => { ui.pointerDown = true; });
document.addEventListener('pointerup', () => { ui.pointerDown = false; if (ui.pending) render(); });

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const [act, a, b] = el.dataset.act.split(':');
  const spk = (id) => engine.speakers.find((s) => s.id === id);
  switch (act) {
    case 'nav': ui.view = a; render(); break;
    case 'theme': ui.theme = a; safeSet('speakercast.theme', a); document.documentElement.dataset.theme = a; render(); break;
    case 'play': engine.sourceKind === 'system' ? engine.useFiles() : engine.playlist.length ? engine.toggle() : $('#file-in').click(); break;
    case 'prev': engine.skip(-1); break;
    case 'next': engine.skip(1); break;
    case 'track': engine.playIndex(+a); break;
    case 'clear-playlist': engine.pause(); engine.playlist = []; engine.index = 0; engine.master.anchorMedia = 0; render(); break;
    case 'src-files': engine.useFiles(); break;
    case 'src-system': engine.useSystemAudio(); break;
    case 'open-files': $('#file-in').click(); break;
    case 'unlock': engine.unlockDeviceNames(); break;
    case 'spk-add': await engine.addSpeaker(); break;
    case 'spk-del': if (engine.speakers.length > 1) engine.removeSpeaker(a); break;
    case 'spk-mute': engine.updateSpeaker(a, { mute: !spk(a).mute }); break;
    case 'spk-solo': engine.updateSpeaker(a, { solo: !spk(a).solo }); break;
    case 'eq-open': ui.eqTab = a; ui.view = 'eq'; render(); break;
    case 'eq-tab': ui.eqTab = a; render(); break;
    case 'eq-sel': ui.eqSel = +a; render(); break;
    case 'eq-on': setBand(+a, { on: !eqTarget().eq[+a].on }); break;
    case 'eq-bypass': {
      const v = !eqTarget().eqBypass;
      (ui.eqTab === 'ALL' ? engine.speakers : [eqTarget()]).forEach((s) => withQuiet(() => engine.updateSpeaker(s.id, { eqBypass: v })));
      render(); break;
    }
    case 'eq-copy': {
      const src = eqTarget();
      engine.speakers.forEach((s) => withQuiet(() => engine.updateSpeaker(s.id, { eq: src.eq.map((x) => ({ ...x })) })));
      toast(`Copied ${src.name}'s EQ to all speakers`); break;
    }
    case 'eq-ab': {
      (ui.eqTab === 'ALL' ? engine.speakers : [eqTarget()]).forEach((s) => {
        const slot = s.abSlot || 'A';
        if (slot === a) return;
        const other = s.eqB ? s.eqB.map((x) => ({ ...x })) : s.eq.map((x) => ({ ...x }));
        withQuiet(() => engine.updateSpeaker(s.id, { eqB: s.eq.map((x) => ({ ...x })), eq: other, abSlot: a }));
      });
      render(); break;
    }
    case 'sync-method': engine.sync.method = a; render(); break;
    case 'sync-run': engine.syncAll(engine.sync.method); break;
    case 'mic-toggle': engine.setMicEnabled(!engine.micStream); break;
    case 'mic-sw': engine.updateMic({ [a]: !engine.setup.mic[a] }); break;
    case 'mic-spk': engine.updateSpeaker(a, { micOn: !spk(a).micOn }); for (const o of engine.outputs.values()) o.applyMic(engine.setup.mic); break;
    case 'stem-preset': engine.setStems(STEM_PRESETS[a]); break;
    case 'spk-stem': { const s = spk(a); engine.updateSpeaker(a, { stems: { ...s.stems, [b]: s.stems[b] > 0 ? 0 : 1 } }); break; }
    case 'setup-save': {
      const name = ($('#setup-name')?.value || '').trim() || engine.setup.name;
      engine.setup.name = name;
      store.save(engine.setup); engine.changed('setup'); toast(`Saved “${name}”`); break;
    }
    case 'setup-load': { const s = store.list().find((x) => x.name === el.dataset.act.slice('setup-load:'.length)); if (s) { await engine.loadSetup(s); toast(`Loaded “${s.name}”`); } break; }
    case 'setup-del': store.remove(el.dataset.act.slice('setup-del:'.length)); render(); break;
    case 'setup-export': {
      const blob = new Blob([serializeSetup(engine.setup)], { type: 'application/json' });
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${engine.setup.name.replace(/[^\w -]+/g, '')}.speakercast.json` });
      link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); break;
    }
    case 'setup-import': $('#setup-in').click(); break;
    default: break;
  }
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-in]');
  if (!el) return;
  const [act, a] = el.dataset.in.split(':');
  const v = +el.value;
  if (el.type === 'range') el.style.setProperty('--fill', pct(v, +el.min, +el.max));
  withQuiet(() => {
    switch (act) {
      case 'seek': ui.seeking = true; $('#time').textContent = `${fmtTime(v)} / ${fmtTime(engine.current?.buffer.duration)}`; break;
      case 'master': engine.setMaster(v); $('#master-v').textContent = `${fmtDb(v)} dB`; break;
      case 'spk-gain': engine.updateSpeaker(a, { gain: v }); $('#gain-' + a).textContent = `${fmtDb(v)} dB`; break;
      case 'mic-field': engine.updateMic({ [a]: v }); $('#micv-' + a).textContent = `${v} ${/Ms$/.test(a) ? 'ms' : 'dB'}`; break;
      case 'stem': engine.setStems({ [a]: v }); $('#stemv-' + a).textContent = `${Math.round(v * 100)}%`; break;
      case 'setup-name': ui.setupName = el.value; break;
      default: break;
    }
  });
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'file-in') { engine.addFiles([...el.files]).then(() => { if (!engine.master.playing && engine.playlist.length) render(); }); el.value = ''; return; }
  if (el.id === 'setup-in') {
    const f = el.files[0];
    el.value = '';
    if (f) f.text().then((txt) => { const s = parseSetup(txt); store.save(s); return engine.loadSetup(s).then(() => toast(`Imported “${s.name}”`)); }).catch((err) => toast(err.message));
    return;
  }
  if (el.dataset.in === 'seek') { ui.seeking = false; engine.seek(+el.value); return; }
  if (el.dataset.in && el.dataset.in.startsWith('stem')) { render(); return; }
  const key = el.dataset.ch;
  if (!key) return;
  const [act, a, b] = key.split(':');
  switch (act) {
    case 'spk-name': engine.updateSpeaker(a, { name: el.value.trim() || 'Speaker' }); break;
    case 'spk-dev': engine.updateSpeaker(a, { deviceId: el.value }); break;
    case 'spk-role': engine.updateSpeaker(a, { role: el.value }); break;
    case 'spk-delay': engine.updateSpeaker(a, { delayMs: Math.max(0, Math.min(2000, +el.value || 0)) }); break;
    case 'eq-preset': {
      const p = EQ_PRESETS[el.value];
      if (p) (ui.eqTab === 'ALL' ? engine.speakers : [eqTarget()]).forEach((s) => withQuiet(() => engine.updateSpeaker(s.id, { eq: p() })));
      render(); break;
    }
    case 'eq-field': {
      const lim = { f: [20, 20000], g: [-18, 18], q: [0.1, 12], slope: [12, 24] }[b];
      setBand(+a, { [b]: Math.max(lim[0], Math.min(lim[1], +el.value)) }); break;
    }
    default: break;
  }
});

// EQ graph dragging
document.addEventListener('pointerdown', (e) => {
  const dot = e.target.closest('.eq-dot');
  if (!dot) return;
  const svg = $('#eq-svg');
  const i = +dot.dataset.band;
  ui.eqSel = i;
  svg.setPointerCapture(e.pointerId);
  const toLocal = (ev) => {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * EQW, y: (ev.clientY - r.top) / r.height * EQH };
  };
  const band = eqTarget().eq[i];
  const cut = band.kind === 'lowcut' || band.kind === 'highcut';
  const move = (ev) => {
    const p = toLocal(ev);
    const f = Math.max(20, Math.min(20000, fx(p.x)));
    const patch = cut ? { f } : { f, g: Math.round(Math.max(-18, Math.min(18, gy(p.y))) * 2) / 2 };
    setBand(i, patch, { quiet: true });
  };
  const up = () => { svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up); render(); };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerup', up);
  setBand(i, {}, { quiet: true });
});

document.addEventListener('wheel', (e) => {
  const dot = e.target.closest('.eq-dot');
  if (!dot) return;
  e.preventDefault();
  const i = +dot.dataset.band;
  const b = eqTarget().eq[i];
  if (b.kind === 'lowcut' || b.kind === 'highcut') return;
  const q = Math.max(0.1, Math.min(12, b.q * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
  ui.eqSel = i;
  setBand(i, { q: Math.round(q * 100) / 100 }, { quiet: true });
}, { passive: false });

// Drag & drop music
document.addEventListener('dragover', (e) => { e.preventDefault(); $('#drop')?.classList.add('over'); });
document.addEventListener('dragleave', () => $('#drop')?.classList.remove('over'));
document.addEventListener('drop', (e) => {
  e.preventDefault();
  $('#drop')?.classList.remove('over');
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|flac|ogg|opus|aiff?)$/i.test(f.name));
  if (files.length) engine.addFiles(files);
});

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
  e.preventDefault();
  if (engine.playlist.length) engine.toggle();
});

render();
engine.start().then(render);
