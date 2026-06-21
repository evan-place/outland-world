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

  /** User-facing mute state (also reflects autoplay blocked). */
  let muted = false;

  const syncUI = () => {
    if (!button || !icon) return;
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    icon.src = assetUrl(muted ? ICON_MUTE : ICON_ON);
  };

  const startPlayback = async () => {
    if (muted) return false;
    try {
      audio.muted = false;
      await audio.play();
      return true;
    } catch {
      /* Autoplay policy: unmuted playback needs a user gesture. */
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

  syncUI();

  startPlayback().then((ok) => {
    if (!ok) {
      applyMutedState(true);
    }
  });

  return { audio };
}
