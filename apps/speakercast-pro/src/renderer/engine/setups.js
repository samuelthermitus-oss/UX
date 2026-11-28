// Saved setups: speakers, roles, levels, delays, EQ, mic and stem settings.
import { ROLES, defaultEq } from './dsp.js';

export const SETUP_VERSION = 1;
const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d);

function cleanSpeaker(s, i) {
  return {
    id: String(s.id ?? `spk-${i}`),
    name: String(s.name ?? `Speaker ${i + 1}`).slice(0, 60),
    deviceId: String(s.deviceId ?? 'default'),
    role: ROLES[s.role] ? s.role : 'ST',
    gain: clamp(s.gain, -60, 12, 0),
    mute: !!s.mute,
    solo: !!s.solo,
    delayMs: clamp(s.delayMs, 0, 2000, 0),
    measuredMs: s.measuredMs == null ? null : clamp(s.measuredMs, 0, 4000, null),
    eq: Array.isArray(s.eq) && s.eq.length === 8 ? s.eq.map((b) => ({ ...b })) : defaultEq(),
    eqB: Array.isArray(s.eqB) && s.eqB.length === 8 ? s.eqB.map((b) => ({ ...b })) : null,
    eqBypass: !!s.eqBypass,
    abSlot: s.abSlot === 'B' ? 'B' : 'A',
    micOn: s.micOn !== false,
    stems: { bass: clamp(s.stems?.bass, 0, 2, 1), center: clamp(s.stems?.center, 0, 2, 1), wide: clamp(s.stems?.wide, 0, 2, 1) },
  };
}

export function normalizeSetup(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.speakers)) throw new Error('Not a SpeakerCast setup');
  return {
    v: SETUP_VERSION,
    name: String(raw.name ?? 'Untitled').slice(0, 80),
    savedAt: raw.savedAt ?? new Date().toISOString(),
    master: clamp(raw.master, -60, 6, 0),
    bufferMs: clamp(raw.bufferMs, 20, 400, 80),
    stems: { bass: clamp(raw.stems?.bass, 0, 2, 1), center: clamp(raw.stems?.center, 0, 2, 1), wide: clamp(raw.stems?.wide, 0, 2, 1) },
    mic: {
      gain: clamp(raw.mic?.gain, -40, 12, 0),
      duck: raw.mic?.duck !== false,
      thresholdDb: clamp(raw.mic?.thresholdDb, -70, 0, -42),
      depthDb: clamp(raw.mic?.depthDb, 0, 40, 14),
      attackMs: clamp(raw.mic?.attackMs, 1, 500, 30),
      releaseMs: clamp(raw.mic?.releaseMs, 20, 5000, 600),
      rumble: raw.mic?.rumble !== false,
      clarity: raw.mic?.clarity !== false,
      noise: raw.mic?.noise !== false,
      feedbackGuard: raw.mic?.feedbackGuard !== false,
    },
    speakers: raw.speakers.slice(0, 32).map(cleanSpeaker),
  };
}

export const serializeSetup = (setup) => JSON.stringify({ ...normalizeSetup(setup), savedAt: new Date().toISOString() }, null, 2);
export function parseSetup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('Setup file is not valid JSON'); }
  return normalizeSetup(raw);
}

const KEY = 'speakercast.setups.v1';
const LAST = 'speakercast.last.v1';
const safe = (fn, d) => { try { return fn(); } catch { return d; } };

export const store = {
  list: () => safe(() => JSON.parse(localStorage.getItem(KEY) || '[]').map(normalizeSetup), []),
  save(setup) {
    const all = this.list().filter((s) => s.name !== setup.name);
    all.unshift(normalizeSetup({ ...setup, savedAt: new Date().toISOString() }));
    safe(() => localStorage.setItem(KEY, JSON.stringify(all)));
    return all;
  },
  remove(name) {
    const all = this.list().filter((s) => s.name !== name);
    safe(() => localStorage.setItem(KEY, JSON.stringify(all)));
    return all;
  },
  saveLast: (setup) => safe(() => localStorage.setItem(LAST, JSON.stringify(normalizeSetup(setup)))),
  loadLast: () => safe(() => normalizeSetup(JSON.parse(localStorage.getItem(LAST))), null),
};
