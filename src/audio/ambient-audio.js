import { assetUrl } from "../utils/asset-url.js";

const TRACK_SRC = "/assets/test-backtrack.m4a";
const ICON_ON = "/assets/audio-on.svg";
const ICON_MUTE = "/assets/audio-mute.svg";

export function initAmbientAudio() {
  const button = document.getElementById("audio-toggle");
  const icon = document.getElementById("audio-toggle-icon");

  const audio = new Audio(assetUrl(TRACK_SRC));
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0.7;

  let muted = false;
  let started = false;

  const syncUI = () => {
    if (!button || !icon) return;
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    icon.src = assetUrl(muted ? ICON_MUTE : ICON_ON);
  };

  const startPlayback = async () => {
    if (muted) return;
    try {
      await audio.play();
      started = true;
    } catch {
      /* autoplay blocked until user gesture */
    }
  };

  const unlockOnGesture = () => {
    if (!muted) startPlayback();
  };

  button?.addEventListener("click", () => {
    muted = !muted;
    audio.muted = muted;
    syncUI();
    if (!muted) startPlayback();
  });

  document.addEventListener("pointerdown", unlockOnGesture, { once: true, passive: true });
  document.addEventListener("keydown", unlockOnGesture, { once: true });

  syncUI();
  startPlayback();

  return { audio };
}
