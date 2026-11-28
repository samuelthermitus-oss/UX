// The conductor: owns the master clock, the playlist, the mic and every
// speaker output, and keeps them all on the same beat.
import { SpeakerOutput } from './speaker.js';
import { MasterClock } from './clock.js';
import { expSweep, findDelay, alignmentDelays, defaultEq } from './dsp.js';
import { normalizeSetup, store } from './setups.js';

const TICK_MS = 250;
const START_LEAD_MS = 160; // schedule starts slightly ahead so every device begins on the same sample
export const MIN_SPEAKERS = 5;
export const MAX_SPEAKERS = 16;

let idSeq = 0;
const newId = () => `spk-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

export class Engine extends EventTarget {
  constructor() {
    super();
    this.setup = normalizeSetup(store.loadLast() || {
      name: 'Living Room',
      speakers: [
        ['FL', 'Front Left'], ['FR', 'Front Right'], ['C', 'Center'], ['RL', 'Rear Left'], ['RR', 'Rear Right'], ['SUB', 'Subwoofer'],
      ].map(([role, name]) => ({ id: newId(), name, role, deviceId: 'default', gain: 0, eq: defaultEq() })),
    });
    this.outputs = new Map();
    this.master = new MasterClock();
    this.playlist = []; // { name, buffer }
    this.index = 0;
    this.repeat = true; // loop the playlist
    this.trackOffset = 0; // where the current track starts on the master timeline
    this.sourceKind = 'file'; // file | system
    this.systemStream = null;
    this.micStream = null;
    this.devices = [];
    this.timer = null;
    this.started = false;
    this.sync = { phase: 'idle', method: 'mic', current: null, spreadBefore: null, slowest: null, failed: [] };
    this.health = { glitches: 0, maxErrMs: 0 };
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  changed(what = 'state') { store.saveLast(this.setup); this.emit('change', what); }

  get speakers() { return this.setup.speakers; }
  get soloActive() { return this.speakers.some((s) => s.solo); }
  get current() { return this.playlist[this.index] || null; }

  // ---- lifecycle ----------------------------------------------------------
  async start() {
    if (this.started) return;
    this.started = true;
    await this.refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', () => this.onDeviceChange());
    for (const s of this.speakers) await this.openOutput(s);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.emit('change', 'started');
  }

  async refreshDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      this.devices = list.filter((d) => d.kind === 'audiooutput').map((d, i) => ({
        deviceId: d.deviceId, label: d.label || (d.deviceId === 'default' ? 'System default output' : `Output ${i + 1}`),
      }));
    } catch {
      this.devices = [];
    }
    if (!this.devices.some((d) => d.deviceId === 'default')) this.devices.unshift({ deviceId: 'default', label: 'System default output' });
    return this.devices;
  }

  // Device labels are hidden until the user grants the mic once.
  async unlockDeviceNames() {
    try {
      await window.speakercast?.askMic?.();
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch { /* denied: keep generic names */ }
    await this.refreshDevices();
    this.emit('change', 'devices');
  }

  async onDeviceChange() {
    await this.refreshDevices();
    const ids = new Set(this.devices.map((d) => d.deviceId));
    for (const s of this.speakers) {
      const out = this.outputs.get(s.id);
      if (!out) continue;
      if (!ids.has(s.deviceId) && s.deviceId !== 'default') out.status = 'offline';
      else if (out.status === 'offline') {
        // Speaker came back (e.g. Bluetooth reconnect): rebind and realign.
        await out.setDevice(s.deviceId).catch(() => {});
        if (this.master.playing && this.sourceKind === 'file') this.restartOutput(out);
      }
    }
    this.emit('change', 'devices');
  }

  async openOutput(cfg) {
    const out = new SpeakerOutput(cfg, { bufferMs: this.setup.bufferMs, onEvent: (t) => this.emit('change', t) });
    this.outputs.set(cfg.id, out);
    try {
      await out.open();
      out.apply(cfg, true, this.mixOpts());
      if (this.micStream) out.setMic(this.micStream, this.setup.mic);
      if (this.systemStream && this.sourceKind === 'system') out.playStream(this.systemStream);
    } catch (e) {
      out.status = 'error';
      out.errorText = String(e && e.message || e);
    }
    return out;
  }

  mixOpts() { return { masterDb: this.setup.master, soloActive: this.soloActive, stems: this.setup.stems }; }

  applyAll() {
    const o = this.mixOpts();
    for (const s of this.speakers) this.outputs.get(s.id)?.apply(s, false, o);
  }

  // ---- speakers -------------------------------------------------------------
  async addSpeaker(partial = {}) {
    if (this.speakers.length >= MAX_SPEAKERS) return null;
    const cfg = normalizeSetup({ speakers: [{ id: newId(), name: `Speaker ${this.speakers.length + 1}`, role: 'MONO', ...partial }] }).speakers[0];
    this.speakers.push(cfg);
    if (this.started) {
      const out = await this.openOutput(cfg);
      if (this.master.playing && this.sourceKind === 'file') this.restartOutput(out);
    }
    this.changed('speakers');
    return cfg;
  }

  async removeSpeaker(id) {
    const i = this.speakers.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.speakers.splice(i, 1);
    const out = this.outputs.get(id);
    this.outputs.delete(id);
    if (out) { out.stop(0.03); setTimeout(() => out.close(), 80); }
    this.applyAll();
    this.changed('speakers');
  }

  async updateSpeaker(id, patch) {
    const s = this.speakers.find((x) => x.id === id);
    if (!s) return;
    const deviceChanged = patch.deviceId != null && patch.deviceId !== s.deviceId;
    Object.assign(s, patch);
    const out = this.outputs.get(id);
    if (deviceChanged && out) {
      await out.setDevice(s.deviceId).catch(() => { out.status = 'error'; });
      if (this.master.playing && this.sourceKind === 'file') this.restartOutput(out);
    }
    if ('solo' in patch || 'mute' in patch) this.applyAll();
    else out?.apply(s, false, this.mixOpts());
    this.changed('speaker');
  }

  setMaster(db) { this.setup.master = db; this.applyAll(); this.changed('master'); }
  setStems(stems) { this.setup.stems = { ...this.setup.stems, ...stems }; this.applyAll(); this.changed('stems'); }

  // ---- sources & transport ------------------------------------------------------
  async addFiles(files) {
    const decoder = new OfflineAudioContext(2, 1, 48000);
    for (const f of files) {
      try {
        const buffer = await decoder.decodeAudioData(await f.arrayBuffer());
        this.playlist.push({ name: f.name.replace(/\.[^.]+$/, ''), buffer });
      } catch {
        this.emit('toast', `Couldn't read “${f.name}”`);
      }
    }
    this.emit('change', 'playlist');
  }

  async resumeAll() {
    await Promise.all([...this.outputs.values()].map((o) => o.resume().catch(() => {})));
  }

  async play(fromPos = null) {
    if (this.sourceKind === 'system') return this.useSystemAudio();
    const track = this.current;
    if (!track) return;
    await this.resumeAll();
    const pos = fromPos ?? (this.master.anchorMedia || 0);
    const perfStart = performance.now() + START_LEAD_MS;
    this.trackOffset = 0;
    this.master.start(perfStart, pos);
    for (const out of this.outputs.values()) if (out.ready) out.playBuffer(track.buffer, pos, perfStart);
    window.speakercast?.setPlaying?.(true);
    this.emit('change', 'transport');
  }

  pause() {
    this.master.pause(performance.now());
    this.master.anchorMedia -= this.trackOffset;
    this.trackOffset = 0;
    for (const out of this.outputs.values()) out.stop();
    window.speakercast?.setPlaying?.(false);
    this.emit('change', 'transport');
  }

  toggle() { return this.master.playing ? this.pause() : this.play(); }

  seek(pos) {
    const was = this.master.playing;
    if (was) this.play(Math.max(0, pos));
    else { this.master.anchorMedia = Math.max(0, pos); this.emit('change', 'transport'); }
  }

  skip(dir) {
    if (!this.playlist.length) return;
    const was = this.master.playing;
    this.index = (this.index + dir + this.playlist.length) % this.playlist.length;
    this.master.anchorMedia = 0;
    if (was) this.play(0); else this.emit('change', 'transport');
  }

  playIndex(i) { this.index = i; this.master.anchorMedia = 0; this.play(0); }

  restartOutput(out) {
    let track = this.current;
    if (!track || !out.ready) return;
    const perf = performance.now() + START_LEAD_MS;
    let offset = this.trackOffset;
    let local = this.master.at(perf) - offset;
    if (local >= track.buffer.duration && this.playlist.length) {
      // The restart lands in the next track.
      offset += track.buffer.duration;
      local -= track.buffer.duration;
      track = this.playlist[(this.index + 1) % this.playlist.length];
    }
    out.playBuffer(track.buffer, local, perf, 0.03, offset);
  }

  async useSystemAudio() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      stream.getVideoTracks().forEach((t) => t.stop());
      if (!stream.getAudioTracks().length) throw new Error('No audio track');
      this.pause();
      this.systemStream = stream;
      this.sourceKind = 'system';
      for (const out of this.outputs.values()) if (out.ready) out.playStream(stream);
      await this.resumeAll();
      window.speakercast?.setPlaying?.(true);
      stream.getAudioTracks()[0].addEventListener('ended', () => this.useFiles());
    } catch {
      this.emit('toast', 'System audio capture was not allowed or is not available on this Mac.');
    }
    this.emit('change', 'source');
  }

  useFiles() {
    if (this.systemStream) this.systemStream.getTracks().forEach((t) => t.stop());
    this.systemStream = null;
    for (const out of this.outputs.values()) out.stopStream();
    this.sourceKind = 'file';
    window.speakercast?.setPlaying?.(false);
    this.emit('change', 'source');
  }

  position() { return this.master.at(performance.now()) - this.trackOffset; }

  // ---- the heartbeat ---------------------------------------------------------------
  tick() {
    const now = performance.now();
    const track = this.current;
    if (this.master.playing && track && this.sourceKind === 'file') {
      const pos = this.master.at(now) - this.trackOffset;
      const remaining = track.buffer.duration - pos;
      const nextTrack = this.playlist[(this.index + 1) % this.playlist.length];
      const hasNext = this.playlist.length > 1 || this.repeat;
      const nextStart = this.trackOffset + track.buffer.duration;
      if (remaining < 4 && hasNext && nextTrack) for (const out of this.outputs.values()) out.queueNext(nextTrack.buffer, nextStart);
      if (remaining <= 0) {
        if (hasNext) {
          // The master timeline runs on; the next track simply starts where this one ended.
          this.trackOffset = nextStart;
          this.index = (this.index + 1) % this.playlist.length;
          this.emit('change', 'track');
        } else {
          this.pause();
          this.master.anchorMedia = 0;
        }
      }
      let worst = 0;
      for (const out of this.outputs.values()) {
        if (out.tick(this.master, now) === 'resync') this.restartOutput(out);
        worst = Math.max(worst, Math.abs(out.errMs));
      }
      this.health.maxErrMs = worst;
    }
    let g = 0, any = false;
    for (const out of this.outputs.values()) { const n = out.glitches(); if (n != null) { g += n; any = true; } }
    this.health.glitches = any ? g : null;
    this.emit('tick');
  }

  // ---- mic & voice ---------------------------------------------------------------
  async setMicEnabled(on) {
    if (!on) {
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.micStream = null;
      for (const out of this.outputs.values()) out.setMic(null, this.setup.mic);
      this.stopHowl();
      this.emit('change', 'mic');
      return;
    }
    try {
      await window.speakercast?.askMic?.();
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: this.setup.mic.feedbackGuard, noiseSuppression: this.setup.mic.noise, autoGainControl: false },
      });
      for (const out of this.outputs.values()) out.setMic(this.micStream, this.setup.mic);
      this.startHowl();
    } catch {
      this.emit('toast', 'Microphone access was denied.');
    }
    this.emit('change', 'mic');
  }

  updateMic(patch) {
    const reopen = ('noise' in patch && patch.noise !== this.setup.mic.noise) || ('feedbackGuard' in patch && patch.feedbackGuard !== this.setup.mic.feedbackGuard);
    Object.assign(this.setup.mic, patch);
    if (reopen && this.micStream) { this.setMicEnabled(false).then(() => this.setMicEnabled(true)); }
    else for (const out of this.outputs.values()) out.applyMic(this.setup.mic);
    this.changed('mic');
  }

  async startHowl() {
    const first = [...this.outputs.values()].find((o) => o.ready);
    if (!first || !this.micStream) return;
    this.howl = new AudioWorkletNode(first.ctx, 'sc-howl');
    this.howlSrc = first.ctx.createMediaStreamSource(this.micStream);
    this.howlSrc.connect(this.howl);
    this.micLevel = 0;
    this.howl.port.onmessage = (e) => {
      this.micLevel = e.data.rms;
      const trip = this.setup.mic.feedbackGuard && e.data.howl;
      if (trip !== !!this.setup.mic.guardTripped) {
        this.setup.mic.guardTripped = trip;
        for (const out of this.outputs.values()) out.applyMic(this.setup.mic);
        if (trip) this.emit('toast', 'Feedback detected: mic pulled down. Move it away from the speakers.');
      }
    };
  }

  stopHowl() {
    this.howlSrc?.disconnect(); this.howl?.disconnect();
    this.howl = this.howlSrc = null;
    this.setup.mic.guardTripped = false;
  }

  // ---- Sync all -----------------------------------------------------------------
  async syncAll(method = 'mic') {
    if (this.sync.phase === 'measuring') return;
    const was = this.master.playing && this.sourceKind === 'file';
    const resumeAt = this.position();
    if (was) this.pause();
    this.sync = { ...this.sync, phase: 'measuring', method, current: null };
    const list = this.speakers.filter((s) => this.outputs.get(s.id)?.ready);
    this.emit('change', 'sync');
    try {
      const measured = method === 'mic' ? await this.measureWithMic(list) : list.map((s) => this.outputs.get(s.id).reportedLatencyMs());
      list.forEach((s, i) => { s.measuredMs = measured[i]; });
      const add = alignmentDelays(measured);
      const known = measured.filter((v) => v != null);
      this.sync.spreadBefore = known.length ? Math.max(...known) - Math.min(...known) : null;
      list.forEach((s, i) => { if (add[i] != null) s.delayMs = Math.round(add[i] * 10) / 10; });
      const failed = list.filter((_, i) => measured[i] == null).map((s) => s.name);
      this.sync.failed = failed;
      this.sync.slowest = known.length ? list[measured.indexOf(Math.max(...known))].name : null;
      this.sync.phase = failed.length === list.length ? 'failed' : 'done';
      this.applyAll();
      this.changed('sync');
    } catch (e) {
      this.sync.phase = 'failed';
      this.sync.error = String(e && e.message || e);
      this.emit('toast', 'Sync failed: ' + this.sync.error);
    }
    this.sync.current = null;
    this.emit('change', 'sync');
    if (was) this.play(resumeAt);
  }

  async measureWithMic(list) {
    await window.speakercast?.askMic?.();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    const micCtx = new AudioContext({ latencyHint: 'interactive' });
    try {
      await micCtx.audioWorklet.addModule(new URL('../worklets/processors.js', import.meta.url).href);
      const rec = new AudioWorkletNode(micCtx, 'sc-recorder');
      const src = micCtx.createMediaStreamSource(stream);
      const sink = new GainNode(micCtx, { gain: 0 });
      src.connect(rec).connect(sink).connect(micCtx.destination);
      await micCtx.resume();
      await this.resumeAll();
      const fsMic = micCtx.sampleRate;
      const sweepSec = 0.5;
      const ref = expSweep(fsMic, sweepSec);
      const results = [];
      for (const s of list) {
        this.sync.current = s.id;
        this.emit('change', 'sync');
        const out = this.outputs.get(s.id);
        const chunks = [];
        rec.port.onmessage = (e) => chunks.push(e.data);
        rec.port.postMessage('start');
        await new Promise((r) => setTimeout(r, 120));
        const emitPerf = performance.now() + 200;
        out.playProbe(expSweep(out.ctx.sampleRate, sweepSec), emitPerf);
        await new Promise((r) => setTimeout(r, 200 + sweepSec * 1000 + 900));
        rec.port.postMessage('stop');
        await new Promise((r) => setTimeout(r, 60));
        // Lay recorded chunks on one timeline and find the sweep after emitPerf.
        const emitFrame = Math.round(this.perfToCtx(micCtx, emitPerf) * fsMic);
        const first = chunks.length ? chunks[0].frame : 0;
        const last = chunks.length ? chunks[chunks.length - 1].frame + chunks[chunks.length - 1].data.length : 0;
        const all = new Float32Array(Math.max(0, last - first));
        chunks.forEach((c) => all.set(c.data, c.frame - first));
        const startIdx = Math.max(0, emitFrame - first);
        const seg = all.subarray(startIdx);
        if (seg.length < ref.length) { results.push(null); continue; }
        const { lag, confidence } = findDelay(seg, ref);
        results.push(confidence > 8 ? (lag / fsMic) * 1000 : null);
        s.measuredMs = results[results.length - 1];
        this.emit('change', 'sync');
      }
      return results;
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      micCtx.close();
    }
  }

  perfToCtx(ctx, perfMs) {
    const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (ts && ts.performanceTime > 0) return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    return ctx.currentTime + (perfMs - performance.now()) / 1000;
  }

  // ---- setups ---------------------------------------------------------------------
  async loadSetup(setup) {
    const wasPlaying = this.master.playing;
    const pos = this.position();
    if (wasPlaying) this.pause();
    for (const out of this.outputs.values()) out.close();
    this.outputs.clear();
    this.setup = normalizeSetup(setup);
    if (this.started) for (const s of this.speakers) await this.openOutput(s);
    this.changed('setup');
    if (wasPlaying) this.play(pos);
  }
}
