import { STYLE_PRESETS, STORY_TRANSITION } from "../config.js";

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
uniform float u_fromTravel;
uniform float u_toTravel;
uniform float u_motionSmear;
uniform float u_viewHeight;
uniform vec2 u_lensCenter;
uniform vec2 u_lensRadius;
uniform float u_lensStrength;
uniform float u_safeInnerY;
uniform float u_safeOuterY;
uniform float u_warpBandPower;
uniform float u_safeInnerX;
uniform float u_safeOuterX;
uniform float u_smearLength;
uniform float u_mixLow;
uniform float u_mixHigh;
varying vec2 v_uv;

float lensWarpAmount(vec2 screenUv) {
  vec2 n = (screenUv - u_lensCenter) / u_lensRadius;
  float yDist = abs(n.y);

  float yWarp = smoothstep(u_safeInnerY, u_safeOuterY, yDist);
  yWarp = pow(yWarp, u_warpBandPower);

  float xDist = abs(n.x);
  float xWarp = smoothstep(u_safeInnerX, u_safeOuterX, xDist) * yWarp;

  return clamp(max(yWarp, xWarp * 0.72), 0.0, 1.0);
}

vec2 lensDistort(vec2 screenUv) {
  vec2 n = (screenUv - u_lensCenter) / u_lensRadius;
  float warp = lensWarpAmount(screenUv);
  if (warp <= 0.0001) return screenUv;

  float k = u_lensStrength * warp;

  vec2 bulge;
  bulge.x = n.x * k * (1.1 + abs(n.y) * 0.72);
  bulge.x *= 1.24;
  bulge.y = n.y * k * 0.52;

  return clamp(screenUv + bulge * u_lensRadius, vec2(0.003), vec2(0.997));
}

vec2 screenToTexture(vec2 screenUv, float travel) {
  float viewH = u_viewHeight;
  float viewBottom = 0.5 - viewH * 0.5 + travel;
  return vec2(screenUv.x, viewBottom + screenUv.y * viewH);
}

vec4 sampleMotionSmear(sampler2D tex, vec2 texUv, float amount) {
  if (amount <= 0.001) {
    return texture2D(tex, clamp(texUv, vec2(0.003), vec2(0.997)));
  }

  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  const int TAPS = 12;

  for (int i = 0; i < TAPS; i++) {
    float fi = float(i) / float(TAPS - 1);
    float w = exp(-fi * 2.4);
    vec2 suv = vec2(texUv.x, texUv.y - fi * amount * u_smearLength);
    acc += texture2D(tex, clamp(suv, vec2(0.003), vec2(0.997))) * w;
    wsum += w;
  }

  return acc / max(wsum, 0.0001);
}

vec4 sampleLayer(sampler2D tex, vec2 screenUv, float travel, float smearAmt) {
  float warp = lensWarpAmount(screenUv);
  vec2 lensUv = lensDistort(screenUv);
  vec2 texUv = screenToTexture(lensUv, travel);
  return sampleMotionSmear(tex, texUv, smearAmt * warp);
}

void main() {
  float t = clamp(u_progress, 0.0, 1.0);
  float warp = lensWarpAmount(v_uv);
  float smearAmt = u_motionSmear * warp;

  vec4 fromCol = sampleLayer(u_from, v_uv, u_fromTravel, smearAmt);
  vec4 toCol = sampleLayer(u_to, v_uv, u_toTravel, smearAmt);

  float mixAmt = smoothstep(u_mixLow, u_mixHigh, t);
  gl_FragColor = mix(fromCol, toCol, mixAmt);
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
    this.contentHeight = 0;
    this.stageHeight = 0;
    this.viewHeight = 1;
    this.travelDistance = 0.3;
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
      fromTravel: gl.getUniformLocation(prog, "u_fromTravel"),
      toTravel: gl.getUniformLocation(prog, "u_toTravel"),
      motionSmear: gl.getUniformLocation(prog, "u_motionSmear"),
      viewHeight: gl.getUniformLocation(prog, "u_viewHeight"),
      lensCenter: gl.getUniformLocation(prog, "u_lensCenter"),
      lensRadius: gl.getUniformLocation(prog, "u_lensRadius"),
      lensStrength: gl.getUniformLocation(prog, "u_lensStrength"),
      safeInnerY: gl.getUniformLocation(prog, "u_safeInnerY"),
      safeOuterY: gl.getUniformLocation(prog, "u_safeOuterY"),
      warpBandPower: gl.getUniformLocation(prog, "u_warpBandPower"),
      safeInnerX: gl.getUniformLocation(prog, "u_safeInnerX"),
      safeOuterX: gl.getUniformLocation(prog, "u_safeOuterX"),
      smearLength: gl.getUniformLocation(prog, "u_smearLength"),
      mixLow: gl.getUniformLocation(prog, "u_mixLow"),
      mixHigh: gl.getUniformLocation(prog, "u_mixHigh"),
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
    const maxBlockH = Math.max(...blockHeights, 1);
    this.contentHeight = maxBlockH;

    const margin = STORY_TRANSITION.travelMargin;
    let travelPad = Math.ceil(maxBlockH * STORY_TRANSITION.travelPadRatio);
    let stageH = maxBlockH + travelPad * 2;

    const minTravelForTraverse = () => {
      const viewH = maxBlockH / stageH;
      const blockNorm = maxBlockH / stageH;
      return viewH * 0.5 + blockNorm * 0.5 + margin;
    };

    let travelDistance = travelPad / stageH;
    let minTravel = minTravelForTraverse();
    let guard = 0;
    while (travelDistance < minTravel && guard < 24) {
      travelPad += Math.ceil(maxBlockH * 0.12);
      stageH = maxBlockH + travelPad * 2;
      travelDistance = travelPad / stageH;
      minTravel = minTravelForTraverse();
      guard += 1;
    }

    this.stageHeight = stageH;
    this.viewHeight = maxBlockH / stageH;
    this.travelDistance = travelDistance;

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

    this.setContentHeight(this.contentHeight);
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

  setContentHeight(height) {
    this.contentHeight = Math.max(1, Math.ceil(height));
    if (this.metrics.textWidth > 0) {
      this._setDisplaySize(this.metrics.textWidth, this.contentHeight);
    }
  }

  setStageHeight(height) {
    this.setContentHeight(height);
  }

  resize() {
    this.metrics = readTextMetrics(this.sampleEl);
    this.displayWidth = this.metrics.textWidth;
    if (this.contentHeight > 0) {
      this._setDisplaySize(this.displayWidth, this.contentHeight);
    } else if (this.displayHeight > 0) {
      this._setDisplaySize(this.displayWidth, this.displayHeight);
    }
  }

  _travelEase(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - x, STORY_TRANSITION.travelEasePower);
  }

  _computeTravel(progress, direction = 1) {
    const enter = this.travelDistance;
    const e = this._travelEase(progress);
    const forward = direction >= 0;
    const fromTravel = e * enter;
    const toTravel = forward ? -(1 - e) * enter : (e - 1) * enter;
    const motionSmear =
      Math.max(Math.abs(fromTravel), Math.abs(toTravel)) * STORY_TRANSITION.motionSmear;

    return { fromTravel, toTravel, motionSmear };
  }

  _bindWarpUniforms() {
    const gl = this.gl;
    const cfg = STORY_TRANSITION;
    const safeHalf = (cfg.safeZoneViewportRatio * 0.5) / cfg.lensRadiusY;
    const safeInnerY = Math.min(0.88, safeHalf);
    const screenEdgeY = 0.5 / cfg.lensRadiusY;
    const safeOuterY = screenEdgeY;

    gl.uniform1f(this.u.viewHeight, this.viewHeight);
    gl.uniform2f(this.u.lensCenter, cfg.lensCenterX, cfg.lensCenterY);
    gl.uniform2f(this.u.lensRadius, cfg.lensRadiusX, cfg.lensRadiusY);
    gl.uniform1f(this.u.lensStrength, cfg.lensStrength);
    gl.uniform1f(this.u.safeInnerY, safeInnerY);
    gl.uniform1f(this.u.safeOuterY, safeOuterY);
    gl.uniform1f(this.u.warpBandPower, cfg.warpBandPower);
    gl.uniform1f(this.u.safeInnerX, cfg.safeInnerX);
    gl.uniform1f(this.u.safeOuterX, cfg.safeOuterX);
    gl.uniform1f(this.u.smearLength, cfg.smearLength);
    gl.uniform1f(this.u.mixLow, cfg.mixEdgeLow);
    gl.uniform1f(this.u.mixHigh, cfg.mixEdgeHigh);
  }

  travelEase(t) {
    return this._travelEase(t);
  }

  riseIntoPlace(beatIndex, progress) {
    const idx = Math.max(0, Math.min(beatIndex, this.textures.length - 1));
    const e = this._travelEase(progress);
    const enter = this.travelDistance;
    this._renderBlend({
      fromIdx: idx,
      toIdx: idx,
      // Mix toward the incoming layer so toTravel is visible (same as beat enter).
      progress: 1,
      fromTravel: 0,
      toTravel: -(1 - e) * enter,
      motionSmear: (1 - e) * enter * STORY_TRANSITION.motionSmear,
    });
  }

  _renderBlend({
    fromIdx,
    toIdx,
    progress = 0,
    direction = 1,
    travelProgress = null,
    fromTravel = null,
    toTravel = null,
    motionSmear = null,
  }) {
    const gl = this.gl;
    const fromMeta = this.textures[fromIdx];
    const toMeta = this.textures[toIdx];
    if (!fromMeta || !toMeta) return;

    if (this.contentHeight > 0 && this.metrics.textWidth > 0) {
      this._setDisplaySize(this.metrics.textWidth, this.contentHeight);
    }

    const travel =
      fromTravel != null
        ? { fromTravel, toTravel, motionSmear }
        : this._computeTravel(travelProgress ?? progress, direction);

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fromMeta.tex);
    gl.uniform1i(this.u.from, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, toMeta.tex);
    gl.uniform1i(this.u.to, 1);
    gl.uniform1f(this.u.progress, Math.max(0, Math.min(1, progress)));
    gl.uniform1f(this.u.fromTravel, travel.fromTravel);
    gl.uniform1f(this.u.toTravel, travel.toTravel);
    gl.uniform1f(this.u.motionSmear, travel.motionSmear);
    this._bindWarpUniforms();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _draw(beatIndex) {
    const idx = Math.max(0, Math.min(beatIndex, this.textures.length - 1));
    this.riseIntoPlace(idx, 1);
  }

  showSettledBeat(beatIndex) {
    this._draw(beatIndex);
  }

  introSettleBeat(beatIndex, settle) {
    this.riseIntoPlace(beatIndex, settle);
  }

  blend(from, to, scrollProgress, direction = 1) {
    const animT = Math.max(0, Math.min(1, scrollProgress));
    const fromIdx = Math.max(0, Math.min(from, this.textures.length - 1));
    const toIdx = Math.max(0, Math.min(to, this.textures.length - 1));
    if (fromIdx === toIdx) {
      const e = this._travelEase(animT);
      const enter = this.travelDistance;
      const sign = direction >= 0 ? -1 : 1;
      this._renderBlend({
        fromIdx,
        toIdx: fromIdx,
        progress: 1,
        fromTravel: 0,
        toTravel: sign * (1 - e) * enter,
        motionSmear: (1 - e) * enter * STORY_TRANSITION.motionSmear,
      });
      return;
    }

    const motionT = this._travelEase(animT);
    const travel = this._computeTravel(animT, 1);

    if (direction >= 0) {
      this._renderBlend({
        fromIdx,
        toIdx,
        progress: motionT,
        travelProgress: animT,
        direction: 1,
      });
      return;
    }

    // Exact forward motion, flipped vertically: outgoing exits down, incoming descends from above.
    this._renderBlend({
      fromIdx: toIdx,
      toIdx: fromIdx,
      progress: motionT,
      fromTravel: -travel.fromTravel,
      toTravel: -travel.toTravel,
      motionSmear: travel.motionSmear,
    });
  }
}
