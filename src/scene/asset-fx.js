import { NoBlending, SRGBColorSpace, UnsignedByteType, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { CopyShader } from "three/addons/shaders/CopyShader.js";
import { ASSET_FX } from "../config.js";

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function createComposerTarget(renderer) {
  const size = renderer.getSize(new Vector2());
  const dpr = renderer.getPixelRatio();
  const target = new WebGLRenderTarget(size.x * dpr, size.y * dpr, {
    type: UnsignedByteType,
  });
  target.texture.colorSpace = SRGBColorSpace;
  return target;
}

export class AssetFx {
  constructor(renderer, scene, camera, { reducedMotion = false, backgroundColor = 0x1d1c1a } = {}) {
    this.renderer = renderer;
    this.backgroundColor = backgroundColor;
    this.reducedMotion = reducedMotion;
    this.motionIntensity = 0;
    this.smoothedIntensity = 0;

    scene.background = null;

    const renderTarget = createComposerTarget(renderer);
    this.composer = new EffectComposer(renderer, renderTarget);
    this.renderPass = new RenderPass(scene, camera, null, backgroundColor, 1);
    this.afterimagePass = new AfterimagePass(ASSET_FX.motionTrail.dampRest);
    this.compositePass = new ShaderPass(CopyShader);
    this.compositePass.clear = false;
    this.compositePass.material.transparent = false;
    this.compositePass.material.depthTest = false;
    this.compositePass.material.depthWrite = false;
    this.compositePass.material.blending = NoBlending;

    this.composer.addPass(this.renderPass);
    if (!reducedMotion) {
      this.composer.addPass(this.afterimagePass);
    }
    this.composer.addPass(this.compositePass);
  }

  setMotionIntensity(intensity) {
    this.motionIntensity = clamp01(intensity);
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
  }

  render() {
    const target = this.reducedMotion ? 0 : this.motionIntensity;
    this.smoothedIntensity += (target - this.smoothedIntensity) * 0.22;
    const t = this.smoothedIntensity;

    if (!this.reducedMotion) {
      const { motionTrail } = ASSET_FX;
      this.afterimagePass.damp = lerp(motionTrail.dampRest, motionTrail.dampPeak, t);
    }

    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
    if (!this.reducedMotion) {
      this.afterimagePass.dispose();
    }
    this.compositePass.dispose();
  }
}
