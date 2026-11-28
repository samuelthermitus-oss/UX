// End-to-end check of the renderer in Chromium (no Electron needed):
//   node test/e2e.browser.mjs [screenshotDir]
// Plays two generated tracks on 6+ speakers and checks they run, stay locked,
// hand over gaplessly, and that every screen renders without errors.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2];
const port = 5199;

function wav(file, seconds, freq) {
  const sr = 48000, n = Math.round(sr * seconds), data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(sr, 24);
  data.writeUInt32LE(sr * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const l = 0.4 * Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(2 * Math.PI * 60 * t);
    const r = 0.4 * Math.sin(2 * Math.PI * freq * 1.5 * t) + 0.2 * Math.sin(2 * Math.PI * 60 * t);
    data.writeInt16LE(Math.round(l * 32767), 44 + i * 4); data.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  writeFileSync(file, data);
}

const tmp = path.join(os.tmpdir(), 'speakercast-e2e');
mkdirSync(tmp, { recursive: true });
const t1 = path.join(tmp, 'Track One.wav'), t2 = path.join(tmp, 'Track Two.wav');
wav(t1, 4, 440); wav(t2, 3, 330);

const server = spawn(process.execPath, [path.join(here, '..', 'scripts', 'preview-server.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const fail = (msg) => { console.error('FAIL', msg); process.exitCode = 1; };
const ok = (cond, msg) => (cond ? console.log('ok  ', msg) : fail(msg));

try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__engine && window.__engine.outputs.size >= 5 && [...window.__engine.outputs.values()].every((o) => o.ready));
  ok(await page.evaluate(() => window.__engine.outputs.size) >= 5, 'opens at least 5 speaker outputs');

  await page.setInputFiles('#file-in', [t1, t2]);
  await page.waitForFunction(() => window.__engine.playlist.length === 2);
  ok(true, 'decodes two tracks');

  await page.click('[data-act="play"]');
  await page.waitForTimeout(1800);
  const s1 = await page.evaluate(() => {
    const e = window.__engine;
    const outs = [...e.outputs.values()];
    return {
      playing: e.master.playing,
      running: outs.every((o) => o.ctx.state === 'running'),
      peaks: outs.map((o) => o.meter().peakDb),
      err: e.health.maxErrMs,
      pos: e.position(),
    };
  });
  ok(s1.playing && s1.running, 'all speaker outputs running');
  ok(s1.peaks.every((p) => p > -40), `audio reaches every speaker (peaks ${s1.peaks.map((p) => p.toFixed(0)).join(', ')} dBFS)`);
  ok(s1.err < 5, `clock lock error ${s1.err.toFixed(2)} ms`);

  await page.waitForFunction(() => window.__engine.index === 1, null, { timeout: 8000 });
  await page.waitForTimeout(800);
  const s2 = await page.evaluate(() => ({ playing: window.__engine.master.playing, pos: window.__engine.position(), err: window.__engine.health.maxErrMs }));
  ok(s2.playing && s2.pos < 2.5, 'hands over to track two gaplessly');
  ok(s2.err < 2, `speakers stay locked across the track change (${s2.err.toFixed(2)} ms)`);

  // Add speakers up to 8 and remove one while playing.
  await page.click('.add-strip');
  await page.click('.add-strip');
  await page.waitForFunction(() => window.__engine.outputs.size === 8);
  const last = await page.evaluate(() => window.__engine.speakers.at(-1).id);
  await page.click(`[data-act="spk-del:${last}"]`);
  await page.waitForFunction(() => window.__engine.outputs.size === 7);
  ok(true, 'adds and removes speakers live');

  // Fader, mute, solo
  const id0 = await page.evaluate(() => window.__engine.speakers[0].id);
  await page.click(`[data-act="spk-solo:${id0}"]`);
  ok(await page.evaluate(() => window.__engine.soloActive), 'solo works');
  await page.click(`[data-act="spk-solo:${id0}"]`);

  if (shots) await page.screenshot({ path: path.join(shots, 'mixer.png') });

  for (const v of ['eq', 'sync', 'mic', 'stems', 'setups']) {
    await page.click(`[data-act="nav:${v}"]`);
    await page.waitForTimeout(300);
    if (shots) await page.screenshot({ path: path.join(shots, `${v}.png`) });
  }

  // EQ drag
  await page.click('[data-act="nav:eq"]');
  const dot = await page.$('.eq-dot[data-band="4"] ellipse');
  const box = await dot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y - 60, { steps: 5 });
  await page.mouse.up();
  const g = await page.evaluate(() => window.__engine.speakers.map((s) => s.eq[4].g));
  ok(g.every((v) => v > 2), `EQ drag (linked) raised band 5 on every speaker: ${g.join(', ')} dB`);

  // Sync, quick method
  await page.click('[data-act="nav:sync"]');
  await page.click('[data-act="sync-method:quick"]');
  await page.click('[data-act="sync-run"]');
  await page.waitForFunction(() => window.__engine.sync.phase === 'done', null, { timeout: 8000 });
  ok(true, 'quick sync completes');

  // Sync with mic: the fake mic can't hear the speakers, so it must fail gracefully.
  await page.click('[data-act="sync-method:mic"]');
  await page.click('[data-act="sync-run"]');
  await page.waitForFunction(() => ['done', 'failed'].includes(window.__engine.sync.phase) && window.__engine.sync.current == null, null, { timeout: 40000 });
  ok(await page.evaluate(() => window.__engine.master.playing), 'music resumes after a mic sync');

  // Mic on
  await page.click('[data-act="nav:mic"]');
  await page.click('[data-act="mic-toggle"]');
  await page.waitForFunction(() => !!window.__engine.micStream);
  ok(true, 'mic & voice turns on');
  if (shots) await page.screenshot({ path: path.join(shots, 'mic-live.png') });

  // Save + reload setup
  await page.click('[data-act="nav:setups"]');
  await page.fill('#setup-name', 'Test Party');
  await page.click('[data-act="setup-save"]');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('speakercast.setups.v1')).some((s) => s.name === 'Test Party')), 'saves a setup');

  for (const theme of ['daylight', 'midnight']) {
    await page.click(`[data-act="theme:${theme}"]`);
    await page.click('[data-act="nav:mixer"]');
    if (shots) await page.screenshot({ path: path.join(shots, `mixer-${theme}.png`) });
  }
} catch (e) {
  fail(e.stack || e.message);
} finally {
  ok(errors.length === 0, `no page errors${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
  await browser.close();
  server.kill();
}
