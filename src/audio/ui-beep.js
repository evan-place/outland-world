import { assetUrl } from "../utils/asset-url.js";

const BEEP_SRC = "/assets/UIBeep-Hover_over_button.mp3";

let audioCtx = null;
let beepBuffer = null;
let loading = null;

function ensureAudio() {
  if (loading) return loading;
  loading = (async () => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const res = await fetch(assetUrl(BEEP_SRC));
      const buf = await res.arrayBuffer();
      beepBuffer = await audioCtx.decodeAudioData(buf);
    } catch { /* silent fail */ }
  })();
  return loading;
}

export function playBeep(rate = 1) {
  void ensureAudio().then(() => {
    if (!audioCtx || !beepBuffer) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = beepBuffer;
    src.playbackRate.value = rate;
    src.connect(audioCtx.destination);
    src.start();
  });
}
