import { assetUrl } from "../utils/asset-url.js";

const BEEP_SRC = "/assets/UIBeep-Hover_over_button.mp3";
const CLICK_SRC = "/assets/UIClick-Clean_modern_UI_button.mp3";
const SUCCESS_SRC = "/assets/UIClick-Satisfying_subscribe.mp3";
const CLICK_GAIN = 0.55;
const SUCCESS_GAIN = 0.6;

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

function playSound(src, { rate = 1, gain = 1 } = {}) {
  void loadBuffer(src).then((buffer) => {
    if (!buffer || !audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
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

export function playBeep(rate = 1) {
  playSound(BEEP_SRC, { rate });
}

export function playUiClick(rate = 1) {
  playSound(CLICK_SRC, { rate, gain: CLICK_GAIN });
}

export function playSuccessClick(rate = 1) {
  playSound(SUCCESS_SRC, { rate, gain: SUCCESS_GAIN });
}
