// One physical speaker = one AudioContext bound to that output device.
//
//   source ─► stem split (LR4 crossover, mid/side) ─► role matrix ─► 8-band EQ
//          ─► ducker (mic sidechain) ─► + mic voice ─► level/mute ─► delay
//          ─► safety limiter ─► meter ─► device
//
// Every parameter change is ramped (setTargetAtTime) so nothing clicks, and
// the playback rate is trimmed continuously by the DriftController instead of
// dropping or repeating samples.
import { routingMatrix, eqStages, dbToGain, levels, STEMS } from './dsp.js';
import { DriftController, MediaTimeline } from './clock.js';

const XOVER_HZ = 120;
const RAMP = 0.015; // 15 ms time-constant for parameter changes
const WORKLET_URL = new URL('../worklets/processors.js', import.meta.url).href;

export class SpeakerOutput {
  constructor(cfg, { bufferMs = 80, onEvent = () => {} } = {}) {
    this.cfg = cfg;
    this.bufferMs = bufferMs;
    this.onEvent = onEvent;
    this.ctx = null;
    this.ready = false;
    this.status = 'idle'; // idle | ok | offline | error
    this.current = null; // { src, fade, timeline, buffer }
    this.next = null;
    this.stream = null;
    this.drift = new DriftController();
    this.errMs = 0;
    this.duckGain = 1;
    this.lastTick = 0;
  }

  async open() {
    const opts = { latencyHint: this.bufferMs / 1000, sampleRate: 48000 };
    if (this.cfg.deviceId && this.cfg.deviceId !== 'default') opts.sinkId = this.cfg.deviceId;
    try {
      this.ctx = new AudioContext(opts);
    } catch {
      // Device may not support 48 kHz; let it pick its native rate.
      delete opts.sampleRate;
      this.ctx = new AudioContext(opts);
    }
    const ctx = this.ctx;
    ctx.onstatechange = () => this.onEvent('state', this);
    if ('onsinkchange' in ctx) ctx.onsinkchange = () => this.onEvent('sink', this);
    if ('onerror' in ctx) ctx.onerror = () => { this.status = 'offline'; this.onEvent('error', this); };
    await ctx.audioWorklet.addModule(WORKLET_URL);
    this.build();
    this.ready = true;
    this.status = 'ok';
    this.apply(this.cfg, true);
    return this;
  }

  build() {
    const ctx = this.ctx;
    const g = (v = 1) => new GainNode(ctx, { gain: v });
    const bq = (type, frequency, Q = 0.7071) => new BiquadFilterNode(ctx, { type, frequency, Q });

    // --- input bus & stem split ------------------------------------------
    this.input = new GainNode(ctx, { channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    this.input.connect(split);
    const mid = g(), side = g();
    const lMid = g(0.5), rMid = g(0.5), lSide = g(0.5), rSide = g(-0.5);
    split.connect(lMid, 0); split.connect(rMid, 1); split.connect(lSide, 0); split.connect(rSide, 1);
    lMid.connect(mid); rMid.connect(mid); lSide.connect(side); rSide.connect(side);
    // Linkwitz-Riley 4th order = two cascaded 2nd-order Butterworths; LP + HP sum flat.
    const lr4 = (input, type) => { const a = bq(type, XOVER_HZ), b = bq(type, XOVER_HZ); input.connect(a).connect(b); return b; };
    this.stemNodes = { bass: lr4(mid, 'lowpass'), center: lr4(mid, 'highpass'), wide: lr4(side, 'highpass') };

    // --- role matrix -------------------------------------------------------
    const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    this.matrix = {};
    STEMS.forEach((k) => {
      const toL = g(0), toR = g(0);
      this.stemNodes[k].connect(toL); this.stemNodes[k].connect(toR);
      toL.connect(merger, 0, 0); toR.connect(merger, 0, 1);
      this.matrix[k] = { L: toL, R: toR };
    });

    // --- EQ: fixed chain of 11 biquads (cuts use 2 stages for 24 dB/oct) ----
    this.eqNodes = Array.from({ length: 11 }, () => new BiquadFilterNode(ctx, { type: 'peaking', gain: 0 }));
    this.eqNodes.reduce((a, b) => (a.connect(b), b));
    this.eqWet = g(1); this.eqDry = g(0);
    merger.connect(this.eqNodes[0]); this.eqNodes[10].connect(this.eqWet);
    merger.connect(this.eqDry);

    // --- ducker (music in 0, mic sidechain in 1) ----------------------------
    this.ducker = new AudioWorkletNode(ctx, 'sc-ducker', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] });
    this.ducker.port.onmessage = (e) => { this.duckGain = e.data.gr; };
    this.eqWet.connect(this.ducker, 0, 0); this.eqDry.connect(this.ducker, 0, 0);

    // --- mic voice chain (connected when the mic is on) ---------------------
    this.micIn = g(1);
    this.micRumble = bq('highpass', 90);
    this.micClarity = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 3000, Q: 0.9, gain: 3 });
    this.micComp = new DynamicsCompressorNode(ctx, { threshold: -24, ratio: 4, knee: 6, attack: 0.005, release: 0.15 });
    this.micGain = g(0);
    this.micIn.connect(this.micRumble).connect(this.micClarity).connect(this.micComp).connect(this.micGain);
    this.micIn.connect(this.ducker, 0, 1);

    // --- level, delay, limiter, meter --------------------------------------
    this.post = g(1);
    this.ducker.connect(this.post); this.micGain.connect(this.post);
    this.level = g(0);
    this.delay = new DelayNode(ctx, { maxDelayTime: 2.0, delayTime: 0 });
    this.limiter = new DynamicsCompressorNode(ctx, { threshold: -1.5, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
    this.analyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.75 });
    this.post.connect(this.level).connect(this.delay).connect(this.limiter).connect(this.analyser).connect(ctx.destination);
    this.timeBuf = new Float32Array(this.analyser.fftSize);
    this.freqBuf = new Float32Array(this.analyser.frequencyBinCount);
  }

  // Apply speaker config. `instant` skips ramps (first build only).
  apply(cfg, instant = false, { masterDb = 0, soloActive = false, stems = { bass: 1, center: 1, wide: 1 } } = {}) {
    this.cfg = cfg;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const set = (param, v, tc = RAMP) => (instant ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, tc));

    const combined = { bass: (stems.bass ?? 1) * (cfg.stems?.bass ?? 1), center: (stems.center ?? 1) * (cfg.stems?.center ?? 1), wide: (stems.wide ?? 1) * (cfg.stems?.wide ?? 1) };
    const m = routingMatrix(cfg.role, combined);
    STEMS.forEach((k, i) => { set(this.matrix[k].L.gain, m.L[i]); set(this.matrix[k].R.gain, m.R[i]); });

    const audible = !cfg.mute && (!soloActive || cfg.solo);
    set(this.level.gain, audible ? dbToGain(cfg.gain + masterDb) : 0);
    set(this.delay.delayTime, Math.max(0, cfg.delayMs) / 1000, instant ? RAMP : 0.12);
    this.applyEq(cfg.eq, cfg.eqBypass, instant);
  }

  applyEq(bands, bypass, instant = false) {
    const t = this.ctx.currentTime;
    const stages = [];
    // Map 8 bands onto 11 fixed slots: lowcut(2) ls bell×4 hs highcut(2).
    const slots = [[0, 1], [2], [3], [4], [5], [6], [7], [8, 9]];
    bands.forEach((band, i) => {
      const st = eqStages(band);
      slots[i].forEach((slot, j) => stages[slot] = st[j] || null);
    });
    stages[10] = null; // spare slot kept neutral
    this.eqNodes.forEach((node, i) => {
      const s = stages[i];
      const type = s ? s.type : 'peaking';
      if (node.type !== type) node.type = type;
      const set = (p, v) => (instant ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, RAMP));
      set(node.frequency, s ? s.f : 1000);
      set(node.Q, s ? s.q : 0.7071);
      set(node.gain, s ? s.g : 0);
    });
    const set = (p, v) => (instant ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, 0.02));
    set(this.eqWet.gain, bypass ? 0 : 1);
    set(this.eqDry.gain, bypass ? 1 : 0);
  }

  setMic(stream, opts) {
    if (this.micSrc) { this.micSrc.disconnect(); this.micSrc = null; }
    if (stream && this.ready) {
      this.micSrc = this.ctx.createMediaStreamSource(stream);
      this.micSrc.connect(this.micIn);
    }
    this.applyMic(opts, !!stream);
  }

  applyMic(mic, active = !!this.micSrc) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const p = this.ducker.parameters;
    p.get('enabled').setValueAtTime(active && mic.duck ? 1 : 0, t);
    p.get('thresholdDb').setValueAtTime(mic.thresholdDb, t);
    p.get('depthDb').setValueAtTime(mic.depthDb, t);
    p.get('attackMs').setValueAtTime(mic.attackMs, t);
    p.get('releaseMs').setValueAtTime(mic.releaseMs, t);
    this.micRumble.frequency.setTargetAtTime(mic.rumble ? 90 : 10, t, RAMP);
    this.micClarity.gain.setTargetAtTime(mic.clarity ? 3 : 0, t, RAMP);
    const g = active && this.cfg.micOn && !mic.guardTripped ? dbToGain(mic.gain) : 0;
    this.micGain.gain.setTargetAtTime(g, t, RAMP);
  }

  // ---- clock mapping ------------------------------------------------------
  // Map performance.now() (ms) to this context's time, using the device's own
  // output timestamp so the mapping includes the reported output latency.
  perfToCtx(perfMs) {
    const ts = this.ctx.getOutputTimestamp ? this.ctx.getOutputTimestamp() : null;
    if (ts && ts.performanceTime > 0) return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    return this.ctx.currentTime + (perfMs - performance.now()) / 1000;
  }

  // ---- file playback --------------------------------------------------------
  // `offset` is where this track starts on the playlist-wide timeline, so a
  // speaker's position never jumps at a track boundary.
  playBuffer(buffer, mediaPos, perfStart, fadeSec = 0.012, offset = 0) {
    const ctx = this.ctx;
    let when = this.perfToCtx(perfStart);
    const earliest = ctx.currentTime + 0.01;
    if (when < earliest) { mediaPos += earliest - when; when = earliest; }
    const voice = this.makeVoice(buffer, 1);
    voice.fade.gain.setValueAtTime(0, when);
    voice.fade.gain.linearRampToValueAtTime(1, when + fadeSec);
    voice.src.start(when, Math.max(0, Math.min(mediaPos, buffer.duration)));
    voice.timeline = new MediaTimeline(when, offset + mediaPos, 1);
    voice.startCtx = when;
    voice.offset = offset;
    this.retire(this.current, when, fadeSec);
    this.cancelNext();
    this.current = voice;
    this.drift.reset();
  }

  makeVoice(buffer, rate) {
    const src = new AudioBufferSourceNode(this.ctx, { buffer, playbackRate: rate });
    const fade = new GainNode(this.ctx, { gain: 0 });
    src.connect(fade).connect(this.input);
    return { src, fade, buffer, timeline: null, startCtx: 0, offset: 0 };
  }

  retire(voice, at = this.ctx.currentTime, fadeSec = 0.012) {
    if (!voice) return;
    const v = voice.fade.gain;
    v.cancelScheduledValues(at);
    v.setValueAtTime(v.value, at);
    v.linearRampToValueAtTime(0, at + fadeSec);
    try { voice.src.stop(at + fadeSec + 0.005); } catch { /* already stopped */ }
    voice.src.onended = () => { voice.src.disconnect(); voice.fade.disconnect(); };
  }

  // Gapless: start the next track exactly where the current one ends, at the
  // current corrected rate, so the hand-over is sample-accurate.
  queueNext(buffer, globalStart) {
    if (!this.current || this.next) return;
    const tl = this.current.timeline;
    const when = tl.ctxFor(globalStart);
    if (when < this.ctx.currentTime + 0.02) return;
    const voice = this.makeVoice(buffer, tl.rate);
    voice.fade.gain.setValueAtTime(1, when);
    voice.src.start(when);
    voice.timeline = new MediaTimeline(when, globalStart, tl.rate);
    voice.startCtx = when;
    voice.offset = globalStart;
    this.next = voice;
  }

  cancelNext() {
    if (!this.next) return;
    try { this.next.src.stop(); } catch { /* not started */ }
    this.next.src.disconnect(); this.next.fade.disconnect();
    this.next = null;
  }

  stop(fadeSec = 0.025) {
    const at = this.ctx ? this.ctx.currentTime : 0;
    this.retire(this.current, at, fadeSec);
    this.cancelNext();
    this.current = null;
    this.drift.reset();
  }

  // Called ~4× a second with the master position. Returns 'resync' when the
  // speaker is too far off to trim smoothly.
  tick(master, perfNow) {
    if (!this.ready) return null;
    const nowCtx = this.perfToCtx(perfNow); // the moment being heard right now
    if (this.next && nowCtx >= this.next.startCtx) {
      this.current = this.next;
      this.next = null;
    }
    const v = this.current;
    if (!v || !master.playing) return null;
    // Scheduled but not audible yet: nothing to measure or correct.
    if (nowCtx < v.startCtx + 0.02) { this.errMs = 0; this.lastTick = 0; return null; }
    const dt = this.lastTick ? (perfNow - this.lastTick) / 1000 : 0.25;
    this.lastTick = perfNow;
    const heard = v.timeline.at(nowCtx);
    const err = heard - master.at(perfNow);
    this.errMs = err * 1000;
    const local = heard - v.offset;
    // Ran off the end with nothing queued (e.g. it joined too late to queue).
    if (local > v.buffer.duration + 0.05) return 'resync';
    // Hold the rate steady while the next track is queued so the hand-over lines up.
    if (this.next && v.buffer.duration - local < 1.5) return null;
    const { rate, resync } = this.drift.update(err, dt);
    if (resync) return 'resync';
    const at = this.ctx.currentTime + 0.02;
    v.src.playbackRate.setValueAtTime(rate, at);
    v.timeline.setRate(at, rate);
    return null;
  }

  // ---- live streams (system audio) -----------------------------------------
  playStream(stream) {
    this.stopStream();
    if (!stream) return;
    this.stream = this.ctx.createMediaStreamSource(stream);
    this.streamFade = new GainNode(this.ctx, { gain: 0 });
    this.stream.connect(this.streamFade).connect(this.input);
    this.streamFade.gain.setTargetAtTime(1, this.ctx.currentTime, RAMP);
  }

  stopStream() {
    if (!this.stream) return;
    const s = this.stream, f = this.streamFade;
    f.gain.setTargetAtTime(0, this.ctx.currentTime, RAMP);
    setTimeout(() => { s.disconnect(); f.disconnect(); }, 120);
    this.stream = null;
  }

  // ---- calibration ------------------------------------------------------------
  // Plays a sweep straight into the limiter (after the alignment delay), so the
  // measurement is of the raw device path.
  playProbe(samples, perfAt) {
    const buf = new AudioBuffer({ length: samples.length, numberOfChannels: 1, sampleRate: this.ctx.sampleRate });
    buf.copyToChannel(samples, 0);
    const src = new AudioBufferSourceNode(this.ctx, { buffer: buf });
    src.connect(this.limiter);
    const when = Math.max(this.ctx.currentTime + 0.02, this.perfToCtx(perfAt));
    src.start(when);
    src.onended = () => src.disconnect();
    return when;
  }

  reportedLatencyMs() {
    return ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000;
  }

  meter() {
    if (!this.ready) return { rmsDb: -180, peakDb: -180 };
    this.analyser.getFloatTimeDomainData(this.timeBuf);
    return levels(this.timeBuf);
  }

  spectrum() {
    this.analyser.getFloatFrequencyData(this.freqBuf);
    return this.freqBuf;
  }

  // Underrun counter where the browser exposes it (AudioContext.playoutStats).
  glitches() {
    const s = this.ctx && this.ctx.playoutStats;
    return s && typeof s.fallbackFramesEvents === 'number' ? s.fallbackFramesEvents : null;
  }

  async setDevice(deviceId) {
    this.cfg.deviceId = deviceId;
    if (this.ctx && this.ctx.setSinkId) {
      await this.ctx.setSinkId(deviceId === 'default' ? '' : deviceId);
      this.status = 'ok';
    }
  }

  async resume() { if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume(); }

  async close() {
    this.ready = false;
    if (this.ctx) await this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
