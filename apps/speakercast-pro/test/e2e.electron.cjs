// Boots the real Electron app (virtual display on Linux: xvfb-run) and checks
// that the window loads, opens 5+ speaker outputs and plays a track.
//   xvfb-run -a node test/e2e.electron.cjs
const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

(async () => {
  const root = path.join(__dirname, '..');
  const wavPath = path.join(os.tmpdir(), 'speakercast-electron.wav');
  const sr = 48000, n = sr * 3, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const v = Math.round((0.3 * Math.sin(2 * Math.PI * 440 * i / sr) + 0.3 * Math.sin(2 * Math.PI * 55 * i / sr)) * 32767); buf.writeInt16LE(v, 44 + i * 4); buf.writeInt16LE(v, 46 + i * 4); }
  fs.writeFileSync(wavPath, buf);

  const app = await electron.launch({ executablePath: require(path.join(root, 'node_modules', 'electron')), args: [root, '--no-sandbox'], cwd: root });
  const errors = [];
  const win = await app.firstWindow();
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let code = 0;
  const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) code = 1; };
  try {
    ok((await win.title()) === 'SpeakerCast Pro', 'window opens');
    await win.waitForFunction(() => window.__engine && window.__engine.outputs.size >= 5 && [...window.__engine.outputs.values()].every((o) => o.ready), null, { timeout: 15000 });
    ok(true, 'engine opened ' + await win.evaluate(() => window.__engine.outputs.size) + ' speaker outputs');
    ok(await win.evaluate(() => typeof window.speakercast?.setPlaying === 'function'), 'preload bridge available');
    ok(await win.evaluate(() => self.crossOriginIsolated), 'cross-origin isolated (app:// protocol headers)');
    await win.setInputFiles('#file-in', wavPath);
    await win.waitForFunction(() => window.__engine.playlist.length === 1);
    await win.click('[data-act="play"]');
    await win.waitForTimeout(1500);
    const st = await win.evaluate(() => ({ playing: window.__engine.master.playing, peaks: [...window.__engine.outputs.values()].map((o) => o.meter().peakDb), err: window.__engine.health.maxErrMs }));
    ok(st.playing && st.peaks.every((p) => p > -40), `plays on every speaker (peaks ${st.peaks.map((p) => p.toFixed(0)).join(', ')} dBFS, lock ${st.err.toFixed(2)} ms)`);
    if (process.argv[2]) await win.screenshot({ path: process.argv[2] });
  } catch (e) {
    ok(false, e.message);
  }
  ok(errors.length === 0, 'no renderer errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await app.close();
  process.exit(code);
})();
