import { Color, SRGBColorSpace } from "three";

export class AssetFx {
  constructor(renderer, scene, camera, { reducedMotion = false, backgroundColor = 0x1d1c1a } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this._clearColor = new Color(backgroundColor);

    scene.background = null;
    this.renderer.outputColorSpace = SRGBColorSpace;
  }

  setMotionIntensity(_intensity) {
    // Motion trails disabled — max-blend afterimage corrupts layered asset colors.
  }

  setBackgroundColor(color) {
    this._clearColor.set(color);
  }

  setSize(_width, _height) {
    // Direct render uses the canvas/backbuffer; no composer targets to resize.
  }

  clearTrailBuffers() {
    // No-op: trail buffers removed with the afterimage pass.
  }

  render() {
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(this._clearColor, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    // No composer resources to release.
  }
}
