/**
 * Capture/record audio cues. Photo shutter uses the OEM-style camerasound.mp3
 * (from react-native-camera-kit); record start/stop stay synthesized so we
 * don't ship extra files. AudioContext is lazily created for synth fallbacks.
 */

const STORAGE_KEY = "fg.captureSounds";
const SHUTTER_URL = "/sounds/camerasound.mp3";

let ctx = null;
let muted = false;
let shutterTemplate = null;
try { muted = sessionStorage.getItem(STORAGE_KEY) === "off"; } catch { /* private mode */ }

export function setSoundsMuted(next) {
  muted = !!next;
  try { sessionStorage.setItem(STORAGE_KEY, muted ? "off" : "on"); } catch { /* no-op */ }
}
export function soundsMuted() { return muted; }

function getCtx() {
  if (muted) return null;
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function getShutterTemplate() {
  if (!shutterTemplate && typeof Audio !== "undefined") {
    shutterTemplate = new Audio(SHUTTER_URL);
    shutterTemplate.preload = "auto";
  }
  return shutterTemplate;
}

/** OEM-style shutter click — camerasound.mp3 with synthesized fallback. */
export function playShutter() {
  if (muted) return;
  const template = getShutterTemplate();
  if (template) {
    const clip = template.cloneNode();
    clip.volume = 1;
    clip.play().catch(() => playShutterSynth());
    return;
  }
  playShutterSynth();
}

/** Synthesized fallback when the mp3 can't load or play. */
function playShutterSynth() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;

  // Noise click — short, high-passed so it's a "tk" rather than a hiss.
  const noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.06), ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuf;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2200;
  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.35, now + 0.006);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  noise.connect(hp);
  hp.connect(noiseGain);
  noiseGain.connect(ac.destination);
  noise.start(now);
  noise.stop(now + 0.12);

  // Body thud — a low, fast-decaying sine so the click feels mechanical
  // instead of digital.
  const body = ac.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(220, now);
  body.frequency.exponentialRampToValueAtTime(110, now + 0.08);
  const bodyGain = ac.createGain();
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.18, now + 0.005);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  body.connect(bodyGain);
  bodyGain.connect(ac.destination);
  body.start(now);
  body.stop(now + 0.14);
}

function beep(freq, dur, peak = 0.22) {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Rising two-tone "start" cue, ~180ms total. */
export function playRecordStart() {
  beep(660, 0.14);
  setTimeout(() => beep(990, 0.18), 90);
}

/** Falling two-tone "stop" cue, ~200ms total. */
export function playRecordStop() {
  beep(880, 0.14);
  setTimeout(() => beep(520, 0.20), 100);
}
