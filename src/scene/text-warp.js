import * as THREE from "three";
import vert from "../shaders/text-warp.vert?raw";
import frag from "../shaders/text-warp.frag?raw";
import { STYLE_PRESETS, STORY_TRANSITION } from "../config.js";

function parseHtmlToLines(html, maxWidth, ctx, style) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const segments = [];

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text) segments.push({ text, italic: false });
    } else if (node.nodeName === "EM" || node.nodeName === "I") {
      const text = node.textContent;
      if (text) segments.push({ text, italic: true });
    } else {
      node.childNodes.forEach(walk);
    }
  }
  temp.childNodes.forEach(walk);

  const preset = STYLE_PRESETS[style] || STYLE_PRESETS["serif-lg"];
  const fontSize = preset.fontSize;
  const lineHeight = fontSize * preset.lineHeight;
  const fontFamily = '"Ivory LL", Georgia, serif';
  const fontNormal = `${fontSize}px ${fontFamily}`;
  const fontItalic = `italic ${fontSize}px ${fontFamily}`;

  const lines = [];
  let current = [];
  let currentW = 0;

  const measure = (text, italic) => {
    ctx.font = italic ? fontItalic : fontNormal;
    return ctx.measureText(text).width;
  };

  const flush = () => {
    if (current.length) lines.push([...current]);
    current = [];
    currentW = 0;
  };

  for (const seg of segments) {
    const words = seg.text.split(/(\s+)/);
    for (const word of words) {
      if (!word) continue;
      const w = measure(word, seg.italic);
      if (currentW + w > maxWidth && current.length) flush();
      current.push({ text: word, italic: seg.italic });
      currentW += w;
    }
  }
  flush();

  return { lines, fontSize, lineHeight, preset };
}

export function renderBeatToCanvas(canvas, html, style, dpr = 2) {
  const maxWidth = 514;
  const pad = 8;

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  const { lines, fontSize, lineHeight } = parseHtmlToLines(html, maxWidth - pad * 2, mctx, style);

  const height = Math.ceil(lines.length * lineHeight + pad * 2);
  const canvasW = maxWidth + pad * 2;

  canvas.width = Math.ceil(canvasW * dpr);
  canvas.height = Math.ceil(height * dpr);
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasW, height);
  ctx.fillStyle = "#fcfcf5";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const fontFamily = '"Ivory LL", Georgia, serif';
  const cx = canvasW / 2;

  lines.forEach((line, li) => {
    const y = pad + li * lineHeight;
    const lineWidth = line.reduce((sum, seg) => {
      ctx.font = seg.italic
        ? `italic ${fontSize}px ${fontFamily}`
        : `${fontSize}px ${fontFamily}`;
      return sum + ctx.measureText(seg.text).width;
    }, 0);
    let x = cx - lineWidth / 2;
    for (const seg of line) {
      ctx.font = seg.italic
        ? `italic ${fontSize}px ${fontFamily}`
        : `${fontSize}px ${fontFamily}`;
      ctx.fillText(seg.text, x, y);
      x += ctx.measureText(seg.text).width;
    }
  });

  return { width: canvasW, height, aspect: canvasW / height };
}

function easeTransition(t) {
  return Math.pow(Math.max(0, Math.min(1, t)), STORY_TRANSITION.easePower);
}

export class TextWarp {
  constructor(canvasEl, beats) {
    this.canvasEl = canvasEl;
    this.beats = beats;
    this.fromIndex = 0;
    this.toIndex = 0;
    this.progress = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.frameAspectA = 514 / 120;
    this.frameAspectB = 514 / 120;

    this.texCanvasA = document.createElement("canvas");
    this.texCanvasB = document.createElement("canvas");
    this.dpr = Math.min(window.devicePixelRatio, 2);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      uTextureA: { value: null },
      uTextureB: { value: null },
      uProgress: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uFrameAspectA: { value: this.frameAspectA },
      uFrameAspectB: { value: this.frameAspectB },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.scene.add(this.mesh);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      alpha: true,
      antialias: false,
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setClearColor(0x000000, 0);

    this.texA = new THREE.CanvasTexture(this.texCanvasA);
    this.texB = new THREE.CanvasTexture(this.texCanvasB);
    this.texA.colorSpace = THREE.SRGBColorSpace;
    this.texB.colorSpace = THREE.SRGBColorSpace;
    this.texA.minFilter = THREE.LinearFilter;
    this.texB.minFilter = THREE.LinearFilter;

    this.uniforms.uTextureA.value = this.texA;
    this.uniforms.uTextureB.value = this.texB;

    this.renderBeatPair(0, 0);
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
  }

  renderBeatPair(fromIdx, toIdx) {
    const from = this.beats[fromIdx] ?? this.beats[0];
    const to = this.beats[toIdx] ?? from;
    const sizeA = renderBeatToCanvas(this.texCanvasA, from.html, from.style, this.dpr);
    const sizeB =
      toIdx === fromIdx
        ? sizeA
        : renderBeatToCanvas(this.texCanvasB, to.html, to.style, this.dpr);

    if (toIdx === fromIdx) {
      const ctx = this.texCanvasB.getContext("2d");
      ctx.clearRect(0, 0, this.texCanvasB.width, this.texCanvasB.height);
      ctx.drawImage(this.texCanvasA, 0, 0);
      this.frameAspectB = sizeA.aspect;
    } else {
      this.frameAspectB = sizeB.aspect;
    }

    this.frameAspectA = sizeA.aspect;
    this.uniforms.uFrameAspectA.value = this.frameAspectA;
    this.uniforms.uFrameAspectB.value = this.frameAspectB;

    this.texA.needsUpdate = true;
    this.texB.needsUpdate = true;

    this.fromIndex = fromIdx;
    this.toIndex = toIdx;
    this.resize();
  }

  setBeatState(index, rawProgress) {
    const idx = Math.max(0, Math.min(this.beats.length - 1, index));
    const nextIdx = Math.min(this.beats.length - 1, idx + 1);
    const clamped = Math.max(0, Math.min(1, rawProgress));

    let warpProgress = 0;
    if (clamped > 0.001 && idx < this.beats.length - 1) {
      warpProgress = this.reducedMotion ? (clamped > 0.5 ? 1 : 0) : easeTransition(clamped);
    }

    if (warpProgress <= 0.001) {
      if (this.fromIndex !== idx || this.toIndex !== idx) {
        this.renderBeatPair(idx, idx);
      }
      this.progress = 0;
    } else {
      if (this.fromIndex !== idx || this.toIndex !== nextIdx) {
        this.renderBeatPair(idx, nextIdx);
      }
      this.progress = warpProgress;
    }

    this.uniforms.uProgress.value = this.progress;
  }

  resize() {
    const maxW = Math.min(514, window.innerWidth - 48);
    const activeAspect =
      this.progress > 0.001
        ? Math.min(this.frameAspectA, this.frameAspectB)
        : this.frameAspectA;
    const h = maxW / activeAspect;

    this.canvasEl.style.width = `${maxW}px`;
    this.canvasEl.style.height = `${h}px`;

    this.renderer.setSize(maxW, h, false);
    this.uniforms.uResolution.value.set(
      Math.max(1, Math.floor(maxW * this.dpr)),
      Math.max(1, Math.floor(h * this.dpr))
    );
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.texA.dispose();
    this.texB.dispose();
    this.renderer.dispose();
  }
}
