import * as THREE from "three";
import vert from "../shaders/text-warp.vert?raw";
import frag from "../shaders/text-warp.frag?raw";
import { STYLE_PRESETS } from "../config.js";

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
  const preset = STYLE_PRESETS[style] || STYLE_PRESETS["serif-lg"];
  const maxWidth = 514;
  const pad = 8;

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  const { lines, fontSize, lineHeight } = parseHtmlToLines(html, maxWidth - pad * 2, mctx, style);

  const height = Math.ceil(lines.length * lineHeight + pad * 2);
  canvas.width = Math.ceil((maxWidth + pad * 2) * dpr);
  canvas.height = Math.ceil(height * dpr);
  canvas.style.width = `${maxWidth + pad * 2}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, maxWidth + pad * 2, height);
  ctx.fillStyle = "#fcfcf5";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  const fontFamily = '"Ivory LL", Georgia, serif';
  const cx = (maxWidth + pad * 2) / 2;

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

  return { width: maxWidth + pad * 2, height, preset };
}

export class TextWarp {
  constructor(canvasEl, beats) {
    this.canvasEl = canvasEl;
    this.beats = beats;
    this.currentIndex = 0;
    this.progress = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.texCanvasA = document.createElement("canvas");
    this.texCanvasB = document.createElement("canvas");
    this.dpr = Math.min(window.devicePixelRatio, 2);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      uTextureA: { value: null },
      uTextureB: { value: null },
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uWarpStrength: { value: this.reducedMotion ? 0 : 0.12 },
      uChroma: { value: this.reducedMotion ? 0 : 0.006 },
      uAspect: { value: 1 },
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
      antialias: true,
    });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setClearColor(0x000000, 0);

    this.texA = new THREE.CanvasTexture(this.texCanvasA);
    this.texB = new THREE.CanvasTexture(this.texCanvasB);
    this.texA.colorSpace = THREE.SRGBColorSpace;
    this.texB.colorSpace = THREE.SRGBColorSpace;

    this.uniforms.uTextureA.value = this.texA;
    this.uniforms.uTextureB.value = this.texB;

    this.renderBeatPair(0, 1);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  renderBeatPair(fromIdx, toIdx) {
    const from = this.beats[fromIdx] ?? this.beats[0];
    const to = this.beats[toIdx] ?? from;
    const sizeA = renderBeatToCanvas(this.texCanvasA, from.html, from.style, this.dpr);
    const sizeB = renderBeatToCanvas(this.texCanvasB, to.html, to.style, this.dpr);
    this.texA.needsUpdate = true;
    this.texB.needsUpdate = true;
    this.contentAspect = Math.max(sizeA.height, sizeB.height) / (sizeA.width || 514);
    this.resize();
  }

  setBeatState(index, progress) {
    const idx = Math.max(0, Math.min(this.beats.length - 1, index));
    const nextIdx = Math.min(this.beats.length - 1, idx + 1);

    if (idx !== this.currentIndex) {
      this.currentIndex = idx;
      this.renderBeatPair(idx, nextIdx);
    }

    this.progress = this.reducedMotion ? (progress > 0.5 ? 1 : 0) : progress;
    this.uniforms.uProgress.value = this.progress;
  }

  resize() {
    const maxW = Math.min(514, window.innerWidth - 48);
    const h = maxW * (this.contentAspect || 0.25);
    this.renderer.setSize(maxW, h, false);
    this.uniforms.uAspect.value = maxW / h;
  }

  render(time) {
    this.uniforms.uTime.value = time;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.texA.dispose();
    this.texB.dispose();
    this.renderer.dispose();
  }
}
