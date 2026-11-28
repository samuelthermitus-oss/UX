# SpeakerCast Pro

A macOS desktop app that plays one source on **5 to 16 speakers at once**, in sync, without dropouts.
Built from the *SpeakerCast Pro — UI Directions* design canvas (Studio Graphite, Daylight and Midnight Neon themes).

## What it does

| Screen | What you can do |
| --- | --- |
| **Mixer** | One strip per speaker: output device, role (FL, FR, C, SL, SR, RL, RR, SUB, Stereo, Mono), level fader, live meter, delay, mute/solo. Gapless playlist by drag-and-drop. |
| **EQ Pro** | 8-band parametric EQ per speaker or linked across all: drag points on the graph, scroll for Q, presets, A/B compare, bypass, live spectrum. |
| **Sync all** | Measures each speaker's real delay with the Mac mic (log-sweep + cross-correlation) and makes faster speakers wait for the slowest. Quick no-mic estimate too. |
| **Mic & Voice** | Talk over the music: auto-ducking, noise reduction, rumble filter, voice clarity, feedback guard, choose which speakers carry your voice. |
| **Stems** | Real-time split into bass / centre (vocals) / wide (instruments); karaoke and other presets; send each part to different speakers. |
| **Saved setups** | Save, load, export and import whole configurations. |

Sources: audio files (MP3, AAC/M4A, WAV, FLAC, OGG/Opus, AIFF) or **System audio** (whatever the Mac plays; macOS 13+).

## Why it doesn't break up

- **One audio clock per speaker, locked to a master.** Every output device runs on its own crystal and drifts by 20 to 100 ppm (up to 0.36 s an hour). A PI controller trims each speaker's playback rate by at most ±600 ppm (about 1 cent, inaudible) instead of skipping or repeating samples. Measured lock in tests: under 0.1 ms.
- **Click-free everything.** Every level, EQ, routing and delay change is ramped. Starts, stops, seeks and recoveries use short fades, never hard cuts.
- **Gapless playlist.** The next track is scheduled to start on the exact sample the current one ends, on one continuous timeline.
- **Playback-sized buffers** (80 ms default), real-time AudioWorklets that allocate nothing per block, and a safety limiter on every output so loud passages never clip.
- **Never throttled.** Background throttling is disabled and the Mac is kept from sleeping the app while it plays.
- **Self-healing.** Speakers that drop off (e.g. a Bluetooth reconnect) are rebound and realigned automatically. Underruns are counted in the status bar where the browser engine exposes them.

## Run it

```bash
npm install
```

```bash
npm start
```

Each speaker you want to use must appear as a macOS output device: Bluetooth, USB, HDMI/DisplayPort, AirPlay (when selected as a system output) or an aggregate device from *Audio MIDI Setup*. Click **Show device names** once to grant access, then pick a device on each strip.

## Build the .dmg

On a Mac:

```bash
npm run dist:mac
```

This produces a universal (Apple Silicon + Intel) `dist/SpeakerCast Pro-2.0.0-universal.dmg`. Without a mac, push to GitHub: the **SpeakerCast Pro (macOS .dmg)** workflow builds it and attaches it as a run artifact. The build is unsigned: right-click → Open the first time, or add signing secrets to the workflow.

## Tests

```bash
npm test
```

```bash
npm run test:e2e
```

`npm test` covers the DSP and clock engine: FFT, sweep detection in noise and echo, EQ curves, routing, alignment, and one simulated hour of 5 drifting sound cards. `test:e2e` launches the real app (use `xvfb-run -a` on Linux) and checks it opens 5+ outputs and plays on all of them. `test:browser` runs a longer UI walkthrough in Chromium.

## Limits worth knowing

- Speakers must be macOS output devices. Network-only speakers (Chromecast, Sonos) aren't supported yet.
- Stems is a signal split (mid/side + crossovers), not an AI separator. A vocal mixed off-centre stays with the instruments.
- Echo cancelling in the mic chain references the default output only.
- Sync all needs the mic to hear each speaker; quiet or distant speakers are reported as not heard.

## Layout

```
src/main/            Electron main process (window, app:// protocol, permissions, power)
src/renderer/
  engine/dsp.js      FFT, sweep, cross-correlation, biquads, roles, alignment (pure, tested)
  engine/clock.js    Drift controller, media timeline, master clock (pure, tested)
  engine/speaker.js  One AudioContext per speaker and its processing chain
  engine/engine.js   Transport, playlist, mic, Sync all, setups
  worklets/          Ducker, recorder and feedback-detector AudioWorklets
  app.js, styles.css UI
test/                Unit and end-to-end tests
```
