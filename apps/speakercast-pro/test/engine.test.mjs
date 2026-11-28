import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expSweep, findDelay, eqResponseDb, defaultEq, routingMatrix, alignmentDelays, fft, ROLES,
} from '../src/renderer/engine/dsp.js';
import { DriftController, MediaTimeline, MasterClock } from '../src/renderer/engine/clock.js';
import { serializeSetup, parseSetup } from '../src/renderer/engine/setups.js';

test('fft round-trips', () => {
  const n = 64;
  const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.3) + (i % 5) * 0.1);
  const im = new Float64Array(n);
  const orig = re.slice();
  fft(re, im);
  fft(re, im, true);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(re[i] / n - orig[i]) < 1e-9);
});

test('finds a sweep buried in noise and room echo to sub-millisecond accuracy', () => {
  const fs = 48000;
  const sweep = expSweep(fs, 0.4);
  const trueDelay = 6123.4; // samples ≈ 127.57 ms
  const rec = new Float32Array(fs);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);
  for (let i = 0; i < rec.length; i++) rec[i] = rand() * 0.2; // noise louder than many rooms
  const add = (delay, amp) => {
    const d0 = Math.floor(delay), frac = delay - d0;
    for (let i = 0; i < sweep.length; i++) {
      const j = i + d0;
      if (j + 1 < rec.length) { rec[j] += sweep[i] * amp * (1 - frac); rec[j + 1] += sweep[i] * amp * frac; }
    }
  };
  add(trueDelay, 0.3);
  add(trueDelay + 900, 0.15); // a wall reflection 19 ms later
  const { lag, confidence } = findDelay(rec, sweep);
  assert.ok(Math.abs(lag - trueDelay) < 0.5 * fs / 1000, `lag ${lag}`);
  assert.ok(confidence > 8, `confidence ${confidence}`);
});

test('flat EQ is flat and a +6 dB bell peaks at +6 dB', () => {
  const freqs = [50, 100, 1000, 5000, 15000];
  const flat = eqResponseDb(defaultEq().map((b) => (b.kind === 'lowcut' ? { ...b, on: false } : b)), freqs);
  flat.forEach((v) => assert.ok(Math.abs(v) < 0.01));
  const bands = defaultEq().map((b) => ({ ...b, on: false }));
  bands[3] = { kind: 'bell', f: 1000, q: 1, g: 6, on: true };
  const [atF] = eqResponseDb(bands, [1000]);
  assert.ok(Math.abs(atF - 6) < 0.01);
});

test('24 dB/oct low cut is -3 dB at its corner and ~-24 dB an octave below', () => {
  const lc = [{ kind: 'lowcut', f: 100, slope: 24, on: true }];
  const [corner, octBelow] = eqResponseDb(lc, [100, 50]);
  assert.ok(Math.abs(corner + 3.01) < 0.1, `corner ${corner}`);
  assert.ok(octBelow < -23 && octBelow > -26, `octave below ${octBelow}`);
});

test('stereo role reconstructs L and R from stems', () => {
  const m = routingMatrix('ST');
  assert.deepEqual(m.L, [1, 1, 1]);
  assert.deepEqual(m.R, [1, 1, -1]);
  const k = routingMatrix('ST', { bass: 1, center: 0, wide: 1 });
  assert.equal(k.L[1], 0); // karaoke: vocals gone
  assert.ok(Object.keys(ROLES).length >= 9);
});

test('alignment: slowest speaker waits 0, others wait the difference', () => {
  assert.deepEqual(alignmentDelays([96, 92, 58, null, 140]), [44, 48, 82, null, 0]);
});

test('drift controller holds 5 drifting speakers within 1 ms with no resyncs', () => {
  const ppms = [0, 45, -80, 120, -35]; // realistic sound-card clock errors
  for (const ppm of ppms) {
    const ctl = new DriftController();
    const dt = 0.25;
    let ctxClock = 0, mediaPos = 0, worst = 0, resyncs = 0;
    for (let step = 0; step < 4 * 3600; step++) { // one hour of 250 ms ticks
      // device clock runs fast/slow by ppm; media advances at device time × rate
      ctxClock += dt * (1 + ppm * 1e-6);
      mediaPos += dt * (1 + ppm * 1e-6) * ctl.rate;
      const master = (step + 1) * dt;
      const err = mediaPos - master;
      if (step > 400) worst = Math.max(worst, Math.abs(err));
      const r = ctl.update(err, dt);
      if (r.resync) resyncs++;
    }
    assert.equal(resyncs, 0, `ppm ${ppm}`);
    assert.ok(worst < 0.001, `ppm ${ppm}: worst ${worst * 1000} ms`);
    assert.ok(Math.abs(ctl.rate - 1) <= 600e-6 + 1e-12);
  }
});

test('media timeline stays continuous across rate changes', () => {
  const tl = new MediaTimeline(10, 0, 1);
  assert.equal(tl.at(12), 2);
  tl.setRate(12, 1.0005);
  assert.equal(tl.at(12), 2);
  assert.ok(Math.abs(tl.at(14) - (2 + 2 * 1.0005)) < 1e-12);
  assert.ok(Math.abs(tl.ctxFor(tl.at(20)) - 20) < 1e-9);
});

test('master clock pauses and resumes in place', () => {
  const c = new MasterClock();
  c.start(1000, 5);
  assert.equal(c.at(3000), 7);
  c.pause(3000);
  assert.equal(c.at(9000), 7);
});

test('setups round-trip and reject junk', () => {
  const setup = {
    name: 'Living Room', master: -2,
    speakers: [{ id: 'a', name: 'L', deviceId: 'x', role: 'FL', gain: -1, mute: false, solo: false, delayMs: 4, eq: defaultEq() }],
  };
  const back = parseSetup(serializeSetup(setup));
  assert.equal(back.name, 'Living Room');
  assert.equal(back.speakers[0].role, 'FL');
  assert.throws(() => parseSetup('{"nope":1}'));
  assert.throws(() => parseSetup('not json'));
});
