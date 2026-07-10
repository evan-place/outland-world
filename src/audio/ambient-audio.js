import { assetUrl } from "../utils/asset-url.js";
import { mountAudioToggle } from "./audio-toggle.js";

const TRACK_SRC = "/assets/test-backtrack.m4a";
const DEFAULT_VOLUME = 0.7;

export function initAmbientAudio() {
  const button = document.getElementById("audio-toggle");
  const toggleUi = mountAudioToggle(button);

  const audio = new Audio(assetUrl(TRACK_SRC));
  audio.loop = true;
  audio.preload = "none";
  audio.volume = DEFAULT_VOLUME;

  let muted = true;

  const syncUI = () => {
    if (!button) return;
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
  };

  const startPlayback = async () => {
    if (muted) return false;
    try {
      if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        audio.load();
      }
      audio.muted = false;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  };

  const applyMutedState = (nextMuted) => {
    muted = nextMuted;
    audio.muted = muted;
    syncUI();
  };

  button?.addEventListener("click", async () => {
    if (muted) {
      applyMutedState(false);
      const ok = await startPlayback();
      if (!ok) {
        applyMutedState(true);
      }
    } else {
      applyMutedState(true);
      audio.pause();
    }
  });

  applyMutedState(true);

  return {
    audio,
    destroy() {
      toggleUi.destroy();
    },
  };
}
