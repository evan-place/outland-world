import assetsManifest from "./data/assets.json";
import storyData from "./data/story.json";
import { AssetField } from "./scene/asset-field.js";
import { TextWarp } from "./scene/text-warp.js";
import { createLenis, initStoryScroll } from "./scroll/story-scroll.js";

async function main() {
  const webglRoot = document.getElementById("webgl-root");
  const storyCanvas = document.getElementById("story-canvas");
  const beats = storyData.beats;

  const assetField = new AssetField(webglRoot, assetsManifest);
  const textWarp = new TextWarp(storyCanvas, beats);

  createLenis();

  initStoryScroll({
    beats,
    onBeatChange: (index, progress) => {
      textWarp.setBeatState(index, progress);
    },
    onTransitionProgress: (index, progress) => {
      textWarp.setBeatState(index, progress);
    },
  });

  const a11y = document.getElementById("story-a11y");
  a11y.innerHTML = beats[0].html.replace(/<[^>]+>/g, "");

  function loop(time) {
    assetField.render();
    textWarp.render(time * 0.001);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main().catch(console.error);
