// AudioWorklet processors. These run on the real-time audio thread, so they
// allocate nothing per block and do only fixed, small amounts of work.

const dbToGain = (db) => Math.pow(10, db / 20);

// Sidechain ducker: lowers the music while the mic carries speech.
// Input 0 = music (stereo), input 1 = mic sidechain (mono). Smooth one-pole
// envelope with separate attack/release, applied per sample (no zipper noise).
class DuckerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'thresholdDb', defaultValue: -42, minValue: -90, maxValue: 0, automationRate: 'k-rate' },
      { name: 'depthDb', defaultValue: 14, minValue: 0, maxValue: 60, automationRate: 'k-rate' },
      { name: 'attackMs', defaultValue: 30, minValue: 1, maxValue: 1000, automationRate: 'k-rate' },
      { name: 'releaseMs', defaultValue: 600, minValue: 10, maxValue: 10000, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.env = 0; // sidechain level (linear RMS-ish)
    this.gain = 1;
    this.posted = 0;
  }
  process(inputs, outputs, params) {
    const music = inputs[0];
    const side = inputs[1] && inputs[1][0];
    const out = outputs[0];
    const n = out[0].length;
    const enabled = params.enabled[0] > 0.5;
    const thr = dbToGain(params.thresholdDb[0]);
    const floor = dbToGain(-params.depthDb[0]);
    const aEnv = Math.exp(-1 / (0.005 * sampleRate));
    const aAtk = Math.exp(-1 / (params.attackMs[0] * 0.001 * sampleRate));
    const aRel = Math.exp(-1 / (params.releaseMs[0] * 0.001 * sampleRate));
    for (let i = 0; i < n; i++) {
      const s = side ? side[i] : 0;
      this.env = aEnv * this.env + (1 - aEnv) * s * s;
      const target = enabled && Math.sqrt(this.env) > thr ? floor : 1;
      const a = target < this.gain ? aAtk : aRel;
      this.gain = a * this.gain + (1 - a) * target;
      for (let ch = 0; ch < out.length; ch++) {
        const src = music[ch] || music[0];
        out[ch][i] = src ? src[i] * this.gain : 0;
      }
    }
    this.posted += n;
    if (this.posted >= sampleRate / 10) {
      this.posted = 0;
      this.port.postMessage({ gr: this.gain });
    }
    return true;
  }
}

// Mic recorder for Sync all: streams blocks of samples with their absolute
// frame index, so the main thread can place each block on the shared clock.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.buf = new Float32Array(4096);
    this.fill = 0;
    this.startFrame = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'start') { this.on = true; this.fill = 0; }
      if (e.data === 'stop') { this.flush(); this.on = false; }
    };
  }
  flush() {
    if (!this.fill) return;
    const chunk = this.buf.slice(0, this.fill);
    this.port.postMessage({ frame: this.startFrame, data: chunk }, [chunk.buffer]);
    this.fill = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!this.on || !ch) return true;
    if (this.fill === 0) this.startFrame = currentFrame;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.fill++] = ch[i];
      if (this.fill === this.buf.length) {
        this.flush();
        this.startFrame = currentFrame + i + 1;
      }
    }
    return true;
  }
}

// Feedback guard: a howl is the mic hearing the speakers and building up into
// a loud, sustained tone. This flags a mic level that stays very hot for more
// than 350 ms so the engine can pull the mic down before it screams.
class HowlDetectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rms = 0;
    this.hot = 0;
    this.count = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let sum = 0;
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    this.rms = 0.9 * this.rms + 0.1 * Math.sqrt(sum / ch.length);
    this.hot = this.rms > 0.25 ? this.hot + ch.length : 0;
    this.count += ch.length;
    if (this.count >= sampleRate / 20) {
      this.count = 0;
      this.port.postMessage({ howl: this.hot > sampleRate * 0.35, rms: this.rms });
    }
    return true;
  }
}

registerProcessor('sc-ducker', DuckerProcessor);
registerProcessor('sc-recorder', RecorderProcessor);
registerProcessor('sc-howl', HowlDetectorProcessor);
