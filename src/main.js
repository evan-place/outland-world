import assetsManifest from "./data/assets.json";
import storyData from "./data/story.json";
import { AssetField } from "./scene/asset-field.js";
import { StoryText } from "./scene/story-text.js";
import { initStoryScroll } from "./scroll/story-scroll.js";

async function main() {
  const webglRoot = document.getElementById("webgl-root");
  const storyTextA = document.getElementById("story-text-a");
  const storyTextB = document.getElementById("story-text-b");
  const beats = storyData.beats;

  const assetField = new AssetField(webglRoot, assetsManifest);
  const storyText = new StoryText(storyTextA, storyTextB, beats);

  await assetField.loadPromise;

  initStoryScroll({
    beats,
    onBeatChange: (fromIndex, progress) => {
      storyText.setBeatState(fromIndex, progress);
    },
  });

  document.body.focus({ preventScroll: true });

  function loop() {
    assetField.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main().catch(console.error);
