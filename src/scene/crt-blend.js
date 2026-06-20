import { STYLE_PRESETS } from "../config.js";

const TEXT_WIDTH = 530;
const TEXT_HEIGHT = 300;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

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

  const lines = [];
  let current = [];
  let currentW = 0;

  const measure = (text, italic) => {
    ctx.font = italic
      ? `italic ${fontSize}px ${fontFamily}`
      : `${fontSize}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };

  const flush = () => {
    if (current.length) lines.push([...current]);
    current = [];
    currentW = 0;
  };

  for (const seg of segments) {
    for (const word of seg.text.split(/(\s+)/)) {
      if (!word) continue;
      const w = measure(word, seg.italic);
      if (currentW + w > maxWidth && current.length) flush();
      current.push({ text: word, italic: seg.italic });
      currentW += w;
    }
  }
  flush();

  return { lines, fontSize, lineHeight, fontFamily };
}

export function renderBeatToFixedCanvas(canvas, html, style) {
  const pad = 16;
  const maxLineW = TEXT_WIDTH - pad * 2;

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  const { lines, fontSize, lineHeight, fontFamily } = parseHtmlToLines(
    html,
    maxLineW,
    mctx,
    style
  );

  canvas.width = Math.floor(TEXT_WIDTH * DPR);
  canvas.height = Math.floor(TEXT_HEIGHT * DPR);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, TEXT_WIDTH, TEXT_HEIGHT);
  ctx.fillStyle = "#fcfcf5";
  ctx.textBaseline = "top";

  const blockH = lines.length * lineHeight;
  let y = (TEXT_HEIGHT - blockH) / 2;
  const cx = TEXT_WIDTH / 2;

  for (const line of lines) {
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
    y += lineHeight;
  }

  return TEXT_WIDTH / TEXT_HEIGHT;
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
uniform float u_frameAspect;
varying vec2 v_uv;

vec2 containUV(vec2 uv, float frameAspect) {
  float viewAspect = u_resolution.x / u_resolution.y;
  vec2 scale = vec2(1.0);
  if (frameAspect > viewAspect) {
    scale.y = viewAspect / frameAspect;
  } else {
    scale.x = frameAspect / viewAspect;
  }
  return clamp((uv - 0.5) / scale + 0.5, 0.002, 0.998);
}

void main() {
  float t = u_progress;
  vec2 uv = containUV(v_uv, u_frameAspect);
  float warp = sin(t * 3.14159265) * (0.5 + t * 0.55);
  float edge = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;
  float innerLimit = mix(0.92, 0.28, smoothstep(0.0, 1.0, t));
  float edgeMask = smoothstep(max(innerLimit - 0.24, 0.0), 1.0, edge);
  edgeMask = edgeMask * edgeMask * (3.0 - 2.0 * edgeMask);
  float distort = warp * edgeMask * 3.0;
  vec2 c = uv - 0.5;
  float radial = pow(dot(c, c) * 4.0, 1.9);
  float scale = 1.0 + distort * radial;
  vec2 sampleUV = c / scale + 0.5;
  sampleUV = containUV(sampleUV, u_frameAspect);
  vec4 fromCol = texture2D(u_from, sampleUV);
  vec4 toCol = texture2D(u_to, sampleUV);
  float mixAmt = smoothstep(0.08, 0.92, t);
  vec4 col = mix(fromCol, toCol, mixAmt);
  col.rgb *= 1.0 - edgeMask * warp * 0.18;
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
  constructor(canvas) {
    this.canvas = canvas;
    this.gl =
      canvas.getContext("webgl", { alpha: true, antialias: false }) ||
      canvas.getContext("experimental-webgl");
    this.textures = [];
    this.frameAspect = TEXT_WIDTH / TEXT_HEIGHT;
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
      frameAspect: gl.getUniformLocation(prog, "u_frameAspect"),
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
    this.textures = beats.map((beat) => {
      const c = document.createElement("canvas");
      renderBeatToFixedCanvas(c, beat.html, beat.style);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      return tex;
    });
  }

  resize() {
    const w = Math.floor(TEXT_WIDTH * DPR);
    const h = Math.floor(TEXT_HEIGHT * DPR);
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${TEXT_WIDTH}px`;
    this.canvas.style.height = `${TEXT_HEIGHT}px`;
    this.gl.viewport(0, 0, w, h);
  }

  blend(from, to, progress) {
    const gl = this.gl;
    const t = Math.max(0, Math.min(1, progress));
    const fromIdx = Math.max(0, Math.min(from, this.textures.length - 1));
    const toIdx = Math.max(0, Math.min(to, this.textures.length - 1));

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[fromIdx]);
    gl.uniform1i(this.u.from, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[toIdx]);
    gl.uniform1i(this.u.to, 1);
    gl.uniform1f(this.u.progress, t);
    gl.uniform2f(this.u.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.frameAspect, this.frameAspect);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
