import { STYLE_PRESETS } from "../config.js";

const DEFAULT_TEXT_WIDTH = 600;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

const UNIFIED_STYLE = {
  fontSize: STYLE_PRESETS["serif-lg"].fontSize,
  lineHeight: 1.3,
};

function getMeasureEl(sampleEl) {
  const stack = sampleEl?.closest(".story-text-stack");
  const width = sampleEl?.closest(".story-stage")?.clientWidth || stack?.clientWidth || DEFAULT_TEXT_WIDTH;
  let el = document.getElementById("story-text-measure");

  if (!el) {
    el = document.createElement("p");
    el.id = "story-text-measure";
    el.className = "story-text";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;margin:0;padding:0;width:100%;";
    (stack || document.body).appendChild(el);
  }

  el.style.width = `${width}px`;
  return el;
}

function isItalicNode(node) {
  let parent = node.parentElement;
  while (parent) {
    if (parent.tagName === "EM" || parent.tagName === "I") return true;
    if (parent === parent.ownerDocument.body) break;
    parent = parent.parentElement;
  }
  return false;
}

function getDomWordRuns(el) {
  const range = document.createRange();
  const box = el.getBoundingClientRect();
  const runs = [];

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let textNode;

  while ((textNode = walker.nextNode())) {
    const text = textNode.textContent;
    if (!text) continue;

    const italic = isItalicNode(textNode);
    let offset = 0;

    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + part.length);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        offset += part.length;
        continue;
      }

      runs.push({
        text: part,
        x: rect.left - box.left,
        y: rect.top - box.top,
        italic,
      });
      offset += part.length;
    }
  }

  return runs;
}

export function readTextMetrics(sampleEl, textWidth = DEFAULT_TEXT_WIDTH) {
  if (!sampleEl) {
    return {
      fontSize: UNIFIED_STYLE.fontSize,
      lineHeight: UNIFIED_STYLE.lineHeight,
      fontFamily: '"Ivory LL", Georgia, serif',
      textWidth,
    };
  }

  const computed = getComputedStyle(sampleEl);
  const fontSize = parseFloat(computed.fontSize) || UNIFIED_STYLE.fontSize;
  const lineHeightPx = parseFloat(computed.lineHeight);
  const lineHeight = Number.isFinite(lineHeightPx)
    ? lineHeightPx / fontSize
    : UNIFIED_STYLE.lineHeight;

  return {
    fontSize,
    lineHeight,
    fontFamily: computed.fontFamily || '"Ivory LL", Georgia, serif',
    textWidth:
      sampleEl?.closest(".story-stage")?.clientWidth ||
      sampleEl?.closest(".story-text-stack")?.clientWidth ||
      sampleEl?.clientWidth ||
      textWidth,
  };
}

function measureBeatBlockH(html, sampleEl, metrics) {
  const measureEl = getMeasureEl(sampleEl);
  measureEl.innerHTML = html;
  measureEl.className = "story-text";
  return Math.ceil(measureEl.offsetHeight);
}

export function renderBeatToStageCanvas(canvas, html, sampleEl, metrics, stageH) {
  const measureEl = getMeasureEl(sampleEl);
  measureEl.innerHTML = html;
  measureEl.className = "story-text";

  const textWidth = metrics.textWidth;
  const blockH = Math.ceil(measureEl.offsetHeight);
  const top = Math.max(0, (stageH - blockH) / 2);

  canvas.width = Math.floor(textWidth * DPR);
  canvas.height = Math.floor(stageH * DPR);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, textWidth, stageH);
  ctx.fillStyle = "#fcfcf5";
  ctx.textBaseline = "top";

  const computed = getComputedStyle(measureEl);
  const fontSize = parseFloat(computed.fontSize);
  const fontFamily = computed.fontFamily;
  const letterSpacing = computed.letterSpacing;

  if (letterSpacing && letterSpacing !== "normal") {
    ctx.letterSpacing = letterSpacing;
  }

  for (const run of getDomWordRuns(measureEl)) {
    ctx.font = run.italic
      ? `italic ${fontSize}px ${fontFamily}`
      : `${fontSize}px ${fontFamily}`;
    ctx.fillText(run.text, run.x, run.y + top);
  }

  return { aspect: textWidth / stageH, blockH, stageH };
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform float u_mode;
uniform float u_introSettle;
uniform vec2 u_resolution;
varying vec2 v_uv;

float smoothPulse(float t) {
  return sin(t * 3.14159265);
}

vec2 crtWarp(vec2 uv, float amount) {
  vec2 c = uv - 0.5;
  float r2 = clamp(dot(c, c), 0.0, 0.48);
  float horizEdge = smoothstep(0.12, 0.92, abs(c.x) * 2.0);
  float kx = 1.0 + amount * r2 * (1.0 + horizEdge * 1.25);
  float ky = 1.0 + amount * r2 * 0.55;
  return clamp(vec2(0.5 + c.x * kx, 0.5 + c.y * ky), vec2(0.006), vec2(0.994));
}

void main() {
  float t = clamp(u_progress, 0.0, 1.0);
  bool introMode = u_mode > 0.5;
  float pulse = introMode ? (1.0 - clamp(u_introSettle, 0.0, 1.0)) : smoothPulse(t);
  float edge = max(abs(v_uv.x - 0.5), abs(v_uv.y - 0.5)) * 2.0;
  float edgeMask = smoothstep(0.48, 0.95, edge);
  edgeMask = edgeMask * edgeMask * (3.0 - 2.0 * edgeMask);

  float warpAmt = pulse * 0.68 * (0.3 + edgeMask * 0.7);
  vec2 warped = crtWarp(v_uv, warpAmt);

  float ripple = sin(v_uv.y * u_resolution.y * 0.28 + t * 14.0) * pulse * edgeMask * 0.0048;
  warped.x += ripple;
  warped.x += sin(v_uv.x * u_resolution.x * 0.18 + t * 11.0) * pulse * edgeMask * 0.0032;

  float chroma = pulse * edgeMask * 0.007;
  vec4 fromCol = texture2D(u_from, warped);
  vec4 toCol = texture2D(u_to, warped);
  vec4 fromR = texture2D(u_from, vec2(clamp(warped.x + chroma, 0.006, 0.994), warped.y));
  vec4 toR = texture2D(u_to, vec2(clamp(warped.x + chroma, 0.006, 0.994), warped.y));
  vec4 fromB = texture2D(u_from, vec2(clamp(warped.x - chroma, 0.006, 0.994), warped.y));
  vec4 toB = texture2D(u_to, vec2(clamp(warped.x - chroma, 0.006, 0.994), warped.y));

  float mixAmt = introMode ? 1.0 : smoothstep(0.06, 0.94, t);
  vec4 baseCol = mix(fromCol, toCol, mixAmt);
  vec4 rCol = mix(fromR, toR, mixAmt);
  vec4 bCol = mix(fromB, toB, mixAmt);
  float ca = pulse * edgeMask * 0.65;
  vec3 fringe = vec3(rCol.r - baseCol.r, 0.0, bCol.b - baseCol.b);
  vec4 col;
  col.rgb = baseCol.rgb + fringe * ca;
  col.a = baseCol.a;

  if (introMode) {
    col.a *= smoothstep(0.0, 0.22, u_introSettle);
  }

  float scan = 0.965 + 0.035 * sin(v_uv.y * u_resolution.y * 0.65 + t * 9.0);
  col.rgb *= mix(1.0, scan, edgeMask * 0.38);
  col.rgb *= 1.0 - edgeMask * pulse * 0.075;
  gl_FragColor = col;
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}

export class CRTBlend {
  constructor(canvas, sampleEl) {
    this.canvas = canvas;
    this.sampleEl = sampleEl;
    this.gl =
      canvas.getContext("webgl", { alpha: true, antialias: false }) ||
      canvas.getContext("experimental-webgl");
    this.textures = [];
    this.metrics = readTextMetrics(sampleEl);
    this.displayWidth = this.metrics.textWidth;
    this.displayHeight = 0;
    this.stageHeight = 0;
    this._initGL();
    this.resize();
  }

  _initGL() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    this.prog = prog;
    this.u = {
      from: gl.getUniformLocation(prog, "u_from"),
      to: gl.getUniformLocation(prog, "u_to"),
      progress: gl.getUniformLocation(prog, "u_progress"),
      mode: gl.getUniformLocation(prog, "u_mode"),
      introSettle: gl.getUniformLocation(prog, "u_introSettle"),
      resolution: gl.getUniformLocation(prog, "u_resolution"),
    };

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  buildTextures(beats) {
    const gl = this.gl;
    this.metrics = readTextMetrics(this.sampleEl);
    this.displayWidth = this.metrics.textWidth;

    const blockHeights = beats.map((beat) =>
      measureBeatBlockH(beat.html, this.sampleEl, this.metrics)
    );
    const stageH = Math.max(...blockHeights, 1);
    this.stageHeight = stageH;

    this.textures = beats.map((beat, index) => {
      const c = document.createElement("canvas");
      renderBeatToStageCanvas(c, beat.html, this.sampleEl, this.metrics, stageH);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      return {
        tex,
        aspect: this.metrics.textWidth / stageH,
        blockH: blockHeights[index],
        stageH,
      };
    });

    this.setStageHeight(stageH);
  }

  _setDisplaySize(width, height) {
    const w = Math.floor(width * DPR);
    const h = Math.floor(height * DPR);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.displayWidth = width;
    this.displayHeight = height;
  }

  setStageHeight(height) {
    this.stageHeight = Math.max(1, Math.ceil(height));
    if (this.metrics.textWidth > 0) {
      this._setDisplaySize(this.metrics.textWidth, this.stageHeight);
    }
  }

  resize() {
    this.metrics = readTextMetrics(this.sampleEl);
    this.displayWidth = this.metrics.textWidth;
    if (this.stageHeight > 0) {
      this._setDisplaySize(this.displayWidth, this.stageHeight);
    } else if (this.displayHeight > 0) {
      this._setDisplaySize(this.displayWidth, this.displayHeight);
    }
  }

  _draw(beatIndex, { progress = 1, mode = 0, introSettle = -1 } = {}) {
    const gl = this.gl;
    const idx = Math.max(0, Math.min(beatIndex, this.textures.length - 1));
    const meta = this.textures[idx];
    if (!meta) return;

    if (this.stageHeight > 0 && this.metrics.textWidth > 0) {
      this._setDisplaySize(this.metrics.textWidth, this.stageHeight);
    }

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, meta.tex);
    gl.uniform1i(this.u.from, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, meta.tex);
    gl.uniform1i(this.u.to, 1);
    gl.uniform1f(this.u.progress, progress);
    gl.uniform1f(this.u.mode, mode);
    gl.uniform1f(this.u.introSettle, introSettle);
    gl.uniform2f(this.u.resolution, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  showSettledBeat(beatIndex) {
    this._draw(beatIndex, { progress: 1, mode: 0, introSettle: -1 });
  }

  introSettleBeat(beatIndex, settle) {
    this._draw(beatIndex, { progress: 1, mode: 1, introSettle: settle });
  }

  blend(from, to, progress) {
    const gl = this.gl;
    const t = Math.max(0, Math.min(1, progress));
    const fromIdx = Math.max(0, Math.min(from, this.textures.length - 1));
    const toIdx = Math.max(0, Math.min(to, this.textures.length - 1));
    const fromMeta = this.textures[fromIdx];
    const toMeta = this.textures[toIdx];
    if (!fromMeta || !toMeta) return;

    if (this.stageHeight > 0 && this.metrics.textWidth > 0) {
      this._setDisplaySize(this.metrics.textWidth, this.stageHeight);
    }

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fromMeta.tex);
    gl.uniform1i(this.u.from, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, toMeta.tex);
    gl.uniform1i(this.u.to, 1);
    gl.uniform1f(this.u.progress, t);
    gl.uniform1f(this.u.mode, 0);
    gl.uniform1f(this.u.introSettle, -1);
    gl.uniform2f(this.u.resolution, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
