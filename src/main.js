import assetsManifest from "./data/assets.json";
import beatLayouts from "./data/beat-layouts.json";
import storyData from "./data/story.json";
import { initAmbientAudio } from "./audio/ambient-audio.js";
import { initContactModal } from "./contact/contact-modal.js";
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
  initContactModal();

  initStoryScroll({
    beats,
    getAssetSettleDelayMs: () => beatAssets.getSettleRemainingMs(),
    onBeatChange: (fromIndex, progress, direction = 1) => {
      storyText.setBeatState(fromIndex, progress, direction);
      beatAssets.setBeatState(fromIndex, progress, direction);
    },
  });

  window.addEventListener("resize", () => storyText.resize());

  document.body.focus({ preventScroll: true });

  function loop() {
    beatAssets.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  beatAssets.loadPromise?.catch(console.error);
}

main();
