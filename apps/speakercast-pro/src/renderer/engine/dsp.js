// Pure DSP helpers. No Web Audio here, so everything in this file runs (and is
// unit-tested) in plain Node as well as in the app.

export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => (g <= 1e-9 ? -180 : 20 * Math.log10(g));

export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// In-place iterative radix-2 FFT. `inverse` computes the unscaled inverse.
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len * (inverse ? 1 : -1);
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// Exponential (log) sine sweep, the standard excitation for acoustic latency
// and impulse-response measurement (Farina). Short raised-cosine fades keep it
// click-free on the speakers.
export function expSweep(sampleRate, seconds = 0.6, f1 = 200, f2 = 12000, amp = 0.5) {
  const n = Math.round(sampleRate * seconds);
  const out = new Float32Array(n);
  const k = Math.log(f2 / f1);
  const fade = Math.round(sampleRate * 0.01);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = Math.sin((2 * Math.PI * f1 * seconds / k) * (Math.exp((t / seconds) * k) - 1));
    if (i < fade) v *= 0.5 - 0.5 * Math.cos(Math.PI * i / fade);
    if (i > n - fade) v *= 0.5 - 0.5 * Math.cos(Math.PI * (n - i) / fade);
    out[i] = v * amp;
  }
  return out;
}

// Finds where `ref` occurs inside `signal` using FFT cross-correlation, with
// PHAT weighting (robust in reverberant rooms) and parabolic interpolation for
// sub-sample accuracy. Returns lag in samples (fractional), and a confidence
// score: peak height over the RMS of the correlation (> ~8 is a clean hit).
export function findDelay(signal, ref, { phat = true, minLag = 0 } = {}) {
  const n = nextPow2(signal.length + ref.length);
  const sr = new Float64Array(n), si = new Float64Array(n);
  const rr = new Float64Array(n), ri = new Float64Array(n);
  sr.set(signal); rr.set(ref);
  fft(sr, si); fft(rr, ri);
  for (let i = 0; i < n; i++) {
    // signal * conj(ref)
    let xr = sr[i] * rr[i] + si[i] * ri[i];
    let xi = si[i] * rr[i] - sr[i] * ri[i];
    if (phat) {
      const m = Math.hypot(xr, xi) + 1e-12;
      xr /= m; xi /= m;
    }
    sr[i] = xr; si[i] = xi;
  }
  fft(sr, si, true);
  const maxLag = signal.length - 1;
  let best = -Infinity, bestI = minLag, sumSq = 0;
  for (let i = minLag; i <= maxLag; i++) {
    const v = sr[i];
    sumSq += v * v;
    if (v > best) { best = v; bestI = i; }
  }
  const rms = Math.sqrt(sumSq / Math.max(1, maxLag - minLag + 1)) + 1e-12;
  let lag = bestI;
  if (bestI > minLag && bestI < maxLag) {
    const a = sr[bestI - 1], b = sr[bestI], c = sr[bestI + 1];
    const den = a - 2 * b + c;
    if (den !== 0) lag = bestI + 0.5 * (a - c) / den;
  }
  return { lag, confidence: best / rms };
}

// Robert Bristow-Johnson cookbook biquads, normalised so a0 = 1.
// Matches the shapes Web Audio's BiquadFilterNode uses, so the EQ curve we
// draw is the curve you hear.
export function biquadCoeffs(type, freq, q, gainDb, fs) {
  const w0 = 2 * Math.PI * Math.min(freq, fs * 0.499) / fs;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const A = Math.pow(10, gainDb / 40);
  const alpha = sin / (2 * Math.max(q, 1e-4));
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass':
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cos + s); b1 = 2 * A * ((A - 1) - (A + 1) * cos); b2 = A * ((A + 1) - (A - 1) * cos - s);
      a0 = (A + 1) + (A - 1) * cos + s; a1 = -2 * ((A - 1) + (A + 1) * cos); a2 = (A + 1) + (A - 1) * cos - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cos + s); b1 = -2 * A * ((A - 1) + (A + 1) * cos); b2 = A * ((A + 1) + (A - 1) * cos - s);
      a0 = (A + 1) - (A - 1) * cos + s; a1 = 2 * ((A - 1) - (A + 1) * cos); a2 = (A + 1) - (A - 1) * cos - s; break;
    }
    default:
      return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function biquadMagDb(c, freq, fs) {
  const w = 2 * Math.PI * freq / fs;
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * c1 + c.b2 * c2, ni = -(c.b1 * s1 + c.b2 * s2);
  const dr = 1 + c.a1 * c1 + c.a2 * c2, di = -(c.a1 * s1 + c.a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

// The 8-band EQ as a list of biquad stages. Cuts are true Butterworth:
// 24 dB/oct = two stages (Q 0.541, 1.307), 12 dB/oct = one stage (Q 0.707).
export const BUTTER4_Q = [0.5412, 1.3066];

export function eqStages(band) {
  if (!band.on) return [];
  switch (band.kind) {
    case 'lowcut':
      return band.slope === 24
        ? BUTTER4_Q.map((q) => ({ type: 'highpass', f: band.f, q, g: 0 }))
        : [{ type: 'highpass', f: band.f, q: 0.7071, g: 0 }];
    case 'highcut':
      return band.slope === 24
        ? BUTTER4_Q.map((q) => ({ type: 'lowpass', f: band.f, q, g: 0 }))
        : [{ type: 'lowpass', f: band.f, q: 0.7071, g: 0 }];
    case 'lowshelf': return [{ type: 'lowshelf', f: band.f, q: band.q, g: band.g }];
    case 'highshelf': return [{ type: 'highshelf', f: band.f, q: band.q, g: band.g }];
    default: return [{ type: 'peaking', f: band.f, q: band.q, g: band.g }];
  }
}

export function eqResponseDb(bands, freqs, fs = 48000) {
  const stages = bands.flatMap(eqStages).map((s) => biquadCoeffs(s.type, s.f, s.q, s.g, fs));
  return freqs.map((f) => stages.reduce((sum, c) => sum + biquadMagDb(c, f, fs), 0));
}

export function defaultEq() {
  return [
    { kind: 'lowcut', f: 30, q: 0.71, g: 0, slope: 24, on: true },
    { kind: 'lowshelf', f: 90, q: 0.71, g: 0, on: true },
    { kind: 'bell', f: 220, q: 1.2, g: 0, on: true },
    { kind: 'bell', f: 650, q: 1.0, g: 0, on: true },
    { kind: 'bell', f: 2200, q: 1.2, g: 0, on: true },
    { kind: 'bell', f: 5200, q: 2.0, g: 0, on: true },
    { kind: 'highshelf', f: 10000, q: 0.71, g: 0, on: true },
    { kind: 'highcut', f: 20000, q: 0.71, g: 0, slope: 12, on: false },
  ];
}

// ---------------------------------------------------------------------------
// Speaker roles and stem routing.
//
// The stereo source is split (Linkwitz-Riley 4th-order crossovers, which sum
// flat) into three stems that add back to the original:
//   bass   = low-passed mid (L+R)/2, below the crossover — mono bass
//   center = high-passed mid — vocals, lead, dialogue (what's common to L & R)
//   wide   = high-passed side (L-R)/2 — instruments panned off-centre, ambience
// so L ≈ bass + center + wide and R ≈ bass + center - wide.
// A role is a 2×3 matrix: how much of each stem goes to the device's left and
// right channel. Stem levels (Stems screen) scale the columns.
// ---------------------------------------------------------------------------
export const ROLES = {
  ST: { label: 'Stereo', L: [1, 1, 1], R: [1, 1, -1] },
  FL: { label: 'Front Left', L: [1, 1, 1], R: [1, 1, 1] },
  FR: { label: 'Front Right', L: [1, 1, -1], R: [1, 1, -1] },
  C: { label: 'Center', L: [0.35, 1, 0], R: [0.35, 1, 0] },
  SL: { label: 'Side Left', L: [0.35, 0.3, 1.1], R: [0.35, 0.3, 1.1] },
  SR: { label: 'Side Right', L: [0.35, 0.3, -1.1], R: [0.35, 0.3, -1.1] },
  RL: { label: 'Rear Left', L: [0.35, 0.25, 1], R: [0.35, 0.25, 1] },
  RR: { label: 'Rear Right', L: [0.35, 0.25, -1], R: [0.35, 0.25, -1] },
  SUB: { label: 'Subwoofer', L: [1.2, 0, 0], R: [1.2, 0, 0] },
  MONO: { label: 'Mono', L: [1, 1, 0], R: [1, 1, 0] },
};

export const STEMS = ['bass', 'center', 'wide'];

export function routingMatrix(role, stems = { bass: 1, center: 1, wide: 1 }) {
  const r = ROLES[role] || ROLES.ST;
  const s = STEMS.map((k) => stems[k] ?? 1);
  return { L: r.L.map((v, i) => v * s[i]), R: r.R.map((v, i) => v * s[i]) };
}

// Delay that each speaker must add so all arrive together: the slowest one
// gets 0, every other one waits the difference. Speakers with no measurement
// are left alone (null).
export function alignmentDelays(measuredMs) {
  const known = measuredMs.filter((v) => v != null && Number.isFinite(v));
  if (!known.length) return measuredMs.map(() => null);
  const max = Math.max(...known);
  return measuredMs.map((v) => (v == null || !Number.isFinite(v) ? null : max - v));
}

// RMS / peak meters in dBFS from a time-domain block.
export function levels(block) {
  let sum = 0, peak = 0;
  for (let i = 0; i < block.length; i++) {
    const v = block[i];
    sum += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  return { rmsDb: gainToDb(Math.sqrt(sum / Math.max(1, block.length))), peakDb: gainToDb(peak) };
}
