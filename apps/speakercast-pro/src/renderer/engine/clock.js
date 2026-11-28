// Keeping several sound cards together.
//
// Every output device (each Bluetooth speaker, USB DAC, HDMI port...) runs on
// its own crystal. Two "48 kHz" clocks typically differ by 20–100 ppm, which is
// up to 0.36 s of drift per hour: speakers slowly fall out of step. Skipping
// or repeating samples to fix that is exactly what causes audible ruptures.
//
// Instead each output gets a DriftController: a PI controller that nudges the
// source's playback rate by at most ±maxPpm (default 600 ppm ≈ 1 cent of
// pitch, far below what anyone can hear). The correction is continuous, so the
// waveform never jumps. Only if a speaker is badly off (a Bluetooth reconnect,
// a sleeping laptop) does it fall back to a resync, which the engine performs
// as a short equal-power crossfade, never a hard cut.

export class DriftController {
  constructor({ kp = 0.02, ki = 0.004, maxPpm = 600, resyncSec = 0.08, deadbandSec = 0.0002 } = {}) {
    this.kp = kp;
    this.ki = ki;
    this.max = maxPpm * 1e-6;
    this.resyncSec = resyncSec;
    this.deadband = deadbandSec;
    this.integral = 0;
    this.rate = 1;
    this.lastError = 0;
  }

  reset() {
    this.integral = 0;
    this.rate = 1;
    this.lastError = 0;
  }

  // errorSec > 0 means this output is ahead of the master clock.
  // dtSec is the time since the previous update.
  // Returns { rate, resync }.
  update(errorSec, dtSec) {
    this.lastError = errorSec;
    if (Math.abs(errorSec) > this.resyncSec) {
      this.reset();
      return { rate: 1, resync: true };
    }
    const e = Math.abs(errorSec) < this.deadband ? 0 : errorSec;
    // The integral term learns the steady clock offset (the ppm difference
    // between this device and the master); proportional pulls the phase in.
    this.integral += e * dtSec;
    const lim = this.max / Math.max(this.ki, 1e-9);
    this.integral = Math.max(-lim, Math.min(lim, this.integral));
    const correction = this.kp * e + this.ki * this.integral;
    this.rate = 1 - Math.max(-this.max, Math.min(this.max, correction));
    return { rate: this.rate, resync: false };
  }
}

// Piecewise-linear map from an output's context time to the media position it
// is playing, so the engine always knows where each speaker is in the song even
// while its rate is being adjusted.
export class MediaTimeline {
  constructor(ctxTime = 0, mediaTime = 0, rate = 1) {
    this.c0 = ctxTime;
    this.m0 = mediaTime;
    this.rate = rate;
  }
  at(ctxTime) {
    return this.m0 + (ctxTime - this.c0) * this.rate;
  }
  // Change rate from ctxTime on, keeping the position continuous.
  setRate(ctxTime, rate) {
    this.m0 = this.at(ctxTime);
    this.c0 = ctxTime;
    this.rate = rate;
  }
  // Context time at which the given media position will be reached.
  ctxFor(mediaTime) {
    return this.c0 + (mediaTime - this.m0) / this.rate;
  }
}

// Master transport clock, expressed against performance.now() (ms), which all
// AudioContexts can be mapped onto via getOutputTimestamp().
export class MasterClock {
  constructor() {
    this.playing = false;
    this.anchorPerf = 0; // performance time (ms) at which media position = anchorMedia
    this.anchorMedia = 0;
  }
  start(perfMs, mediaSec) {
    this.playing = true;
    this.anchorPerf = perfMs;
    this.anchorMedia = mediaSec;
  }
  pause(perfMs) {
    this.anchorMedia = this.at(perfMs);
    this.anchorPerf = perfMs;
    this.playing = false;
  }
  at(perfMs) {
    if (!this.playing) return this.anchorMedia;
    return this.anchorMedia + (perfMs - this.anchorPerf) / 1000;
  }
}

// Equal-power crossfade curves for click-free resyncs and source switches.
export function equalPowerCurves(n = 64) {
  const fadeIn = new Float32Array(n), fadeOut = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    fadeIn[i] = Math.sin(x * Math.PI / 2);
    fadeOut[i] = Math.cos(x * Math.PI / 2);
  }
  return { fadeIn, fadeOut };
}
