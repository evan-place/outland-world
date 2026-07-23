import { assetUrl } from "../utils/asset-url.js";

const SUCCESS_SRC = "/assets/UIClick-Satisfying_subscribe.mp3";
const SUCCESS_GAIN = 0.6;
/** Overall loudness for the synth UI click — keep soft like polished product UI. */
const CLICK_GAIN = 0.5;

let audioCtx = null;
const buffers = new Map();
const loading = new Map();

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function loadBuffer(src) {
  if (buffers.has(src)) return Promise.resolve(buffers.get(src));
  if (loading.has(src)) return loading.get(src);

  const task = (async () => {
    const ctx = ensureAudio();
    try {
      const res = await fetch(assetUrl(src));
      const buf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      buffers.set(src, decoded);
      return decoded;
    } catch {
      return null;
    } finally {
      loading.delete(src);
    }
  })();

  loading.set(src, task);
  return task;
}

function playBuffer(src, { rate = 1, gain = 1 } = {}) {
  void loadBuffer(src).then((buffer) => {
    if (!buffer || !audioCtx) return;
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const node = audioCtx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = rate;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = gain;
    node.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    node.start();
  });
}

function makeNoiseBuffer(ctx, durationSec) {
  const length = Math.max(1, Math.ceil(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Soft UI press with a little spring, or a tighter click voice for CTAs.
 * @param {"up"|"down"|"neutral"} direction — open rises, close falls.
 * @param {"soft"|"click"} voice — soft = springy; click = short & snappy.
 */
function playSynthUiClick(rate = 1, gain = 1, direction = "neutral", voice = "soft") {
  const ctx = ensureAudio();
  if (ctx.state === "suspended") void ctx.resume();

  const t0 = ctx.currentTime;
  const pitch = Math.max(0.5, Math.min(1.8, rate));
  const master = ctx.createGain();
  master.gain.value = CLICK_GAIN * gain;
  master.connect(ctx.destination);

  const rising = direction === "up";
  const isClick = voice === "click";

  // Transient — click voice leans harder on the noise fleck.
  const noiseDur = isClick ? 0.012 : 0.018;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, noiseDur);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = (rising ? 1900 : 2200) * pitch;
  band.Q.value = isClick ? 1.15 : 0.8;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(isClick ? 0.16 : 0.09, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + (isClick ? 0.01 : 0.016));
  noise.connect(band);
  band.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(t0);
  noise.stop(t0 + noiseDur);

  // Body — click is a short blip; soft keeps the longer spring.
  const body = ctx.createOscillator();
  body.type = isClick ? "triangle" : "sine";
  let fStart;
  let fEnd;
  if (rising) {
    fStart = (isClick ? 780 : 420) * pitch;
    fEnd = (isClick ? 980 : 720) * pitch;
  } else {
    fStart = (isClick ? 980 : 740) * pitch;
    fEnd = (isClick ? 720 : 400) * pitch;
  }
  const bodyMs = isClick ? 0.045 : 0.14;
  body.frequency.setValueAtTime(fStart, t0);
  body.frequency.exponentialRampToValueAtTime(fEnd, t0 + bodyMs * 0.7);
  if (!isClick) {
    body.frequency.exponentialRampToValueAtTime(
      rising ? fEnd * 0.98 : fEnd * 1.05,
      t0 + bodyMs,
    );
  }
  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "lowpass";
  bodyFilter.frequency.value = isClick ? 3200 : 2200;
  bodyFilter.Q.value = isClick ? 0.9 : 0.7;
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, t0);
  bodyGain.gain.exponentialRampToValueAtTime(isClick ? 0.22 : 0.3, t0 + 0.002);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + (isClick ? 0.05 : 0.155));
  body.connect(bodyFilter);
  bodyFilter.connect(bodyGain);
  bodyGain.connect(master);
  body.start(t0);
  body.stop(t0 + (isClick ? 0.055 : 0.165));

  if (isClick) return;

  // Soft voice only — quiet sparkle tail.
  const sparkle = ctx.createOscillator();
  sparkle.type = "triangle";
  if (rising) {
    sparkle.frequency.setValueAtTime(780 * pitch, t0);
    sparkle.frequency.exponentialRampToValueAtTime(1120 * pitch, t0 + 0.06);
  } else {
    sparkle.frequency.setValueAtTime(1180 * pitch, t0);
    sparkle.frequency.exponentialRampToValueAtTime(700 * pitch, t0 + 0.06);
  }
  const sparkleGain = ctx.createGain();
  sparkleGain.gain.setValueAtTime(0.0001, t0);
  sparkleGain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.002);
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.065);
  sparkle.connect(sparkleGain);
  sparkleGain.connect(master);
  sparkle.start(t0);
  sparkle.stop(t0 + 0.07);
}

/** @deprecated Prefer playUiClick — kept for any leftover hover wiring. */
export function playBeep(rate = 1) {
  playSynthUiClick(rate, 0.55, "neutral", "soft");
}

export function playUiClick(rate = 1, direction = "neutral") {
  playSynthUiClick(rate, 1, direction, "soft");
}

export function playUiOpen(rate = 1) {
  playSynthUiClick(rate, 1, "up", "soft");
}

export function playUiClose(rate = 1) {
  playSynthUiClick(rate, 1, "down", "soft");
}

/** Snappier CTA / button click — still rises on open, falls on close. */
export function playCtaOpen(rate = 1) {
  playSynthUiClick(rate, 1, "up", "click");
}

export function playCtaClose(rate = 1) {
  playSynthUiClick(rate, 1, "down", "click");
}

export function playSuccessClick(rate = 1) {
  playBuffer(SUCCESS_SRC, { rate, gain: SUCCESS_GAIN });
}
