import { assetUrl } from "../utils/asset-url.js";

const TRACK_SRC = "/assets/test-backtrack.m4a";
const ICON_ON = "/assets/audio-on.svg";
const ICON_MUTE = "/assets/audio-mute.svg";
const DEFAULT_VOLUME = 0.7;

export function initAmbientAudio() {
  const button = document.getElementById("audio-toggle");
  const icon = document.getElementById("audio-toggle-icon");
  const volumeWrap = document.getElementById("audio-volume-wrap");
  const volumeInput = document.getElementById("audio-volume");

  const audio = new Audio(assetUrl(TRACK_SRC));
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = DEFAULT_VOLUME;

  /** User-facing mute state (also reflects autoplay blocked). */
  let muted = false;

  const syncVolumeFill = (value = volumeInput?.value) => {
    if (!volumeInput) return;
    volumeInput.style.setProperty("--volume-percent", `${value}%`);
  };

  const syncUI = () => {
    if (!button || !icon) return;
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    icon.src = assetUrl(muted ? ICON_MUTE : ICON_ON);

    if (volumeWrap) {
      volumeWrap.hidden = muted;
      volumeWrap.classList.toggle("chrome-volume--visible", !muted);
    }
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

  volumeInput?.addEventListener("input", () => {
    const level = Number(volumeInput.value) / 100;
    audio.volume = level;
    syncVolumeFill(volumeInput.value);
  });

  if (volumeInput) {
    volumeInput.value = String(Math.round(DEFAULT_VOLUME * 100));
    syncVolumeFill(volumeInput.value);
  }

  syncUI();

  startPlayback().then((ok) => {
    if (!ok) {
      applyMutedState(true);
    }
  });

  return { audio };
}
