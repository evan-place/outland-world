import assetsManifest from "./data/assets.json";
import beatLayouts from "./data/beat-layouts.json";
import storyData from "./data/story.json";
import { initAmbientAudio } from "./audio/ambient-audio.js";
import { initRail } from "./chrome/rail.js";
import { initSelectionFx } from "./chrome/selection-fx.js";
import { initThemeToggle } from "./chrome/theme-toggle.js";
import { BeatAssets } from "./scene/beat-assets.js";
import { StoryText } from "./scene/story-text.js";
import { initStoryScroll } from "./scroll/story-scroll.js";

function main() {
  const webglRoot = document.getElementById("webgl-root");
  const storyTextA = document.getElementById("story-text-a");
  const storyTextB = document.getElementById("story-text-b");
  const storyCanvas = document.getElementById("story-canvas");
  const beats = storyData.beats;

  const beatAssets = new BeatAssets(webglRoot, assetsManifest, beatLayouts, beats.length);
  const storyText = new StoryText(storyTextA, storyTextB, storyCanvas, beats);

  initAmbientAudio();
  initRail();
  initSelectionFx();
  initThemeToggle();

  const contactOpen = document.getElementById("contact-open");
  let contactModal = null;
  let contactLoading = null;
  const ensureContactModal = (openOnReady = false) => {
    if (contactModal) {
      if (openOnReady) contactModal.open();
      return Promise.resolve(contactModal);
    }
    if (!contactLoading) {
      contactLoading = import("./contact/contact-modal.js").then(({ initContactModal }) => {
        contactModal = initContactModal();
        return contactModal;
      });
    }
    return contactLoading.then((modal) => {
      if (openOnReady) modal?.open();
      return modal;
    });
  };
  contactOpen?.addEventListener("click", () => {
    void ensureContactModal(true);
  });
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => ensureContactModal(), { timeout: 4000 });
  } else {
    window.setTimeout(() => ensureContactModal(), 3000);
  }

  const storyScroll = initStoryScroll({
    beats,
    getAssetSettleDelayMs: () => beatAssets.getSettleRemainingMs(),
    onReturnToStart: () => beatAssets.restartFromBeginning(),
    onBeatChange: (fromIndex, progress, direction = 1) => {
      storyText.setBeatState(fromIndex, progress, direction);
      beatAssets.setBeatState(fromIndex, progress, direction);
    },
  });

  window.addEventListener("resize", () => storyText.resize());
  window.addEventListener("outland:themechange", () => {
    void storyText.resize();
  });

  // Asset layout tuner — hidden gate (right-click logo). Remove before public launch.
  import("./dev/asset-layout-tuner-gate.js").then(({ mountAssetLayoutTunerGate }) => {
    mountAssetLayoutTunerGate({
      beatAssets,
      storyText,
      storyScroll,
      beats,
      assets: assetsManifest.assets,
    });
  });

  // Dev lens tuner — re-enable when tuning shader params.
  // if (import.meta.env.DEV) {
  //   import("./dev/lens-tuner.js").then(({ initLensTuner }) => {
  //     initLensTuner({ storyText });
  //   });
  // }

  document.body.focus({ preventScroll: true });

  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = document.visibilityState === "visible";
    if (running) requestAnimationFrame(loop);
  });

  function loop() {
    if (!running) return;
    beatAssets.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  beatAssets.loadPromise?.catch(console.error);
}

main();
