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
  const falling = direction === "down";
  const isClick = voice === "click";

  // Transient — click voice is mostly this sharp fleck.
  const noiseDur = isClick ? 0.009 : 0.016;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, noiseDur);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = (isClick ? (rising ? 3200 : 2800) : rising ? 1700 : 2000) * pitch;
  band.Q.value = isClick ? 2.2 : 0.75;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(isClick ? 0.32 : 0.07, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + (isClick ? 0.008 : 0.014));
  noise.connect(band);
  band.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(t0);
  noise.stop(t0 + noiseDur);

  // Body — click is a tiny blip; soft keeps a mild spring (less plunge than before).
  const body = ctx.createOscillator();
  body.type = isClick ? "square" : "sine";
  let fStart;
  let fEnd;
  if (isClick) {
    if (rising) {
      fStart = 920 * pitch;
      fEnd = 1040 * pitch;
    } else if (falling) {
      fStart = 1040 * pitch;
      fEnd = 900 * pitch;
    } else {
      fStart = 980 * pitch;
      fEnd = 940 * pitch;
    }
  } else if (rising) {
    fStart = 480 * pitch;
    fEnd = 580 * pitch;
  } else if (falling) {
    fStart = 560 * pitch;
    fEnd = 460 * pitch;
  } else {
    fStart = 520 * pitch;
    fEnd = 500 * pitch;
  }
  const bodyMs = isClick ? 0.028 : 0.09;
  body.frequency.setValueAtTime(fStart, t0);
  body.frequency.exponentialRampToValueAtTime(Math.max(40, fEnd), t0 + bodyMs);
  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "lowpass";
  bodyFilter.frequency.value = isClick ? 4200 : 1800;
  bodyFilter.Q.value = isClick ? 0.6 : 0.55;
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, t0);
  bodyGain.gain.exponentialRampToValueAtTime(isClick ? 0.1 : 0.2, t0 + 0.0015);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + (isClick ? 0.032 : 0.095));
  body.connect(bodyFilter);
  bodyFilter.connect(bodyGain);
  bodyGain.connect(master);
  body.start(t0);
  body.stop(t0 + (isClick ? 0.038 : 0.1));

  if (isClick) return;

  // Soft voice only — quiet high fleck, no big rebound.
  const sparkle = ctx.createOscillator();
  sparkle.type = "triangle";
  if (rising) {
    sparkle.frequency.setValueAtTime(720 * pitch, t0);
    sparkle.frequency.exponentialRampToValueAtTime(880 * pitch, t0 + 0.04);
  } else {
    sparkle.frequency.setValueAtTime(900 * pitch, t0);
    sparkle.frequency.exponentialRampToValueAtTime(740 * pitch, t0 + 0.04);
  }
  const sparkleGain = ctx.createGain();
  sparkleGain.gain.setValueAtTime(0.0001, t0);
  sparkleGain.gain.exponentialRampToValueAtTime(0.035, t0 + 0.002);
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
  sparkle.connect(sparkleGain);
  sparkleGain.connect(master);
  sparkle.start(t0);
  sparkle.stop(t0 + 0.05);
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
