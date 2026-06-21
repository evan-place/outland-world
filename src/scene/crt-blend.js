import { STYLE_PRESETS } from "../config.js";

const DEFAULT_TEXT_WIDTH = 600;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

const UNIFIED_STYLE = {
  fontSize: STYLE_PRESETS["serif-lg"].fontSize,
  lineHeight: 1.3,
};

function getMeasureEl(sampleEl) {
  const stack = sampleEl?.closest(".story-text-stack");
  const width = sampleEl?.clientWidth || stack?.clientWidth || DEFAULT_TEXT_WIDTH;
  let el = document.getElementById("story-text-measure");

  if (!el) {
    el = document.createElement("p");
    el.id = "story-text-measure";
    el.className = "story-text";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;margin:0;padding:0;";
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
  let lastTop = null;

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

      if (lastTop === null || Math.abs(rect.top - lastTop) > 2) {
        lastTop = rect.top;
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
    textWidth: sampleEl.clientWidth || textWidth,
  };
}

export function renderBeatToFixedCanvas(canvas, html, sampleEl, metrics) {
  const measureEl = getMeasureEl(sampleEl);
  measureEl.innerHTML = html;
  measureEl.className = "story-text";

  const textWidth = metrics.textWidth;
  const blockH = Math.ceil(measureEl.offsetHeight);

  canvas.width = Math.floor(textWidth * DPR);
  canvas.height = Math.floor(blockH * DPR);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, textWidth, blockH);
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
    ctx.fillText(run.text, run.x, run.y);
  }

  return { aspect: textWidth / blockH, blockH };
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
uniform vec2 u_resolution;
uniform float u_fromAspect;
uniform float u_toAspect;
varying vec2 v_uv;

vec2 containUV(vec2 uv, float texAspect) {
  float viewAspect = u_resolution.x / u_resolution.y;
  vec2 scale = vec2(1.0);
  if (texAspect > viewAspect) {
    scale.y = viewAspect / texAspect;
  } else {
    scale.x = texAspect / viewAspect;
  }
  return clamp((uv - 0.5) / scale + 0.5, 0.002, 0.998);
}

void main() {
  float t = u_progress;
  float warp = sin(t * 3.14159265) * 0.2;
  float edge = max(abs(v_uv.x - 0.5), abs(v_uv.y - 0.5)) * 2.0;
  float innerLimit = mix(0.86, 0.58, smoothstep(0.0, 1.0, t));
  float edgeMask = smoothstep(max(innerLimit - 0.14, 0.0), 1.0, edge);
  edgeMask = edgeMask * edgeMask * (3.0 - 2.0 * edgeMask);
  float distort = warp * edgeMask * 0.75;
  vec2 c = v_uv - 0.5;
  float radial = pow(dot(c, c) * 3.2, 2.4);
  float scale = 1.0 + distort * radial;
  vec2 warped = c / scale + 0.5;
  vec4 fromCol = texture2D(u_from, containUV(warped, u_fromAspect));
  vec4 toCol = texture2D(u_to, containUV(warped, u_toAspect));
  float mixAmt = smoothstep(0.12, 0.88, t);
  vec4 col = mix(fromCol, toCol, mixAmt);
  col.rgb *= 1.0 - edgeMask * warp * 0.05;
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
      resolution: gl.getUniformLocation(prog, "u_resolution"),
      fromAspect: gl.getUniformLocation(prog, "u_fromAspect"),
      toAspect: gl.getUniformLocation(prog, "u_toAspect"),
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
    this.textures = beats.map((beat) => {
      const c = document.createElement("canvas");
      const { aspect, blockH } = renderBeatToFixedCanvas(
        c,
        beat.html,
        this.sampleEl,
        this.metrics
      );
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      return { tex, aspect, blockH };
    });
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

  resize() {
    this.metrics = readTextMetrics(this.sampleEl);
    this.displayWidth = this.metrics.textWidth;
    if (this.displayHeight > 0) {
      this._setDisplaySize(this.displayWidth, this.displayHeight);
    }
  }

  blend(from, to, progress) {
    const gl = this.gl;
    const t = Math.max(0, Math.min(1, progress));
    const fromIdx = Math.max(0, Math.min(from, this.textures.length - 1));
    const toIdx = Math.max(0, Math.min(to, this.textures.length - 1));
    const fromMeta = this.textures[fromIdx];
    const toMeta = this.textures[toIdx];
    if (!fromMeta || !toMeta) return;

    const blendH = fromMeta.blockH + (toMeta.blockH - fromMeta.blockH) * t;
    this._setDisplaySize(this.metrics.textWidth, blendH);

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fromMeta.tex);
    gl.uniform1i(this.u.from, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, toMeta.tex);
    gl.uniform1i(this.u.to, 1);
    gl.uniform1f(this.u.progress, t);
    gl.uniform2f(this.u.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.fromAspect, fromMeta.aspect);
    gl.uniform1f(this.u.toAspect, toMeta.aspect);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
