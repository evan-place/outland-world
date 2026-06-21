import assetsManifest from "./data/assets.json";
import storyData from "./data/story.json";
import { initAmbientAudio } from "./audio/ambient-audio.js";
import { AssetField } from "./scene/asset-field.js";
import { StoryText } from "./scene/story-text.js";
import { initStoryScroll } from "./scroll/story-scroll.js";

function main() {
  const webglRoot = document.getElementById("webgl-root");
  const storyTextA = document.getElementById("story-text-a");
  const storyTextB = document.getElementById("story-text-b");
  const storyCanvas = document.getElementById("story-canvas");
  const beats = storyData.beats;

  const assetField = new AssetField(webglRoot, assetsManifest);
  const storyText = new StoryText(storyTextA, storyTextB, storyCanvas, beats);

  initAmbientAudio();

  initStoryScroll({
    beats,
    onBeatChange: (fromIndex, progress) => {
      storyText.setBeatState(fromIndex, progress);
    },
  });

  window.addEventListener("resize", () => storyText.resize());

  document.body.focus({ preventScroll: true });

  function loop() {
    assetField.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  assetField.loadPromise.catch(console.error);
}

main().catch(console.error);
