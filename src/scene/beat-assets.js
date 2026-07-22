import * as THREE from "three";
import { BEAT_ASSETS, SAFE_ZONE } from "../config.js";
import { assetUrl } from "../utils/asset-url.js";
import { AssetFx } from "./asset-fx.js";

const BLEND_MAP = {
  normal: () => ({ blending: THREE.NormalBlending, transparent: true }),
  screen: () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  lighten: () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  "color-dodge": () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  "plus-lighter": () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  exclusion: () => ({ blending: THREE.NormalBlending, transparent: true }),
  multiply: () => ({ blending: THREE.MultiplyBlending, transparent: true }),
};

/** Canonical modes the tuner exposes — aliases collapse to these. */
function canonicalizeBlendMode(mode) {
  if (mode === "multiply") return "multiply";
  if (
    mode === "plus-lighter" ||
    mode === "screen" ||
    mode === "lighten" ||
    mode === "color-dodge"
  ) {
    return "plus-lighter";
  }
  return "normal";
}

function resolveItemVisual(item) {
  return {
    blendMode: canonicalizeBlendMode(item.blendMode ?? "normal"),
    opacity: item.opacity ?? 1,
  };
}

function applyBlendToMaterial(material, blendMode, opacity = 1) {
  const blend = BLEND_MAP[blendMode]?.() ?? BLEND_MAP.normal();
  const isNormal = blend.blending === THREE.NormalBlending;
  const isMultiply = blend.blending === THREE.MultiplyBlending;
  const isAdditive = blend.blending === THREE.AdditiveBlending;
  const fullyOpaque = opacity >= 0.99;

  material.blending = blend.blending;
  material.transparent = true;
  material.premultipliedAlpha = isMultiply;
  material.alphaTest = 0;
  material.depthWrite = isNormal && fullyOpaque && !isAdditive;
  material.depthTest = true;
}

function shouldBakeOpaqueAlpha(entry) {
  return entry?.ignoreAlpha === true || entry?.id?.startsWith("block-");
}

function bakeOpaqueAlpha(tex) {
  const image = tex.image;
  if (!image?.width || !image?.height || image.__outlandOpaqueAlpha) return;

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  canvas.__outlandOpaqueAlpha = true;
  tex.image = canvas;
  tex.needsUpdate = true;
}

function configureLoadedTexture(tex, entry) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (shouldBakeOpaqueAlpha(entry)) {
    bakeOpaqueAlpha(tex);
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function hash01(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function resolveFloatMotion(itemIndex, beatIndex) {
  const seed = beatIndex * 17.3 + itemIndex * 9.1;

  return {
    phase: hash01(seed) * Math.PI * 2,
    phaseY: hash01(seed * 2.17) * Math.PI * 2,
    freq: 0.32 + hash01(seed * 3.31) * 0.22,
    freqY: 0.26 + hash01(seed * 4.07) * 0.18,
    ampX: 0.05 + hash01(seed * 5.19) * 0.065,
    ampY: 0.04 + hash01(seed * 6.23) * 0.055,
    ampZ: 0.022 + hash01(seed * 6.91) * 0.034,
    rotAmp: 0.012 + hash01(seed * 7.29) * 0.02,
    rotFreq: 0.28 + hash01(seed * 8.31) * 0.18,
  };
}

function easeIncoming(t) {
  const x = clamp01(t);
  const warp = BEAT_ASSETS.incomingTimePower ?? 1;
  const warped = 1 - Math.pow(1 - x, warp);
  const k = BEAT_ASSETS.incomingWarpRate;
  if (k <= 0.01) return warped;
  const denom = 1 - Math.exp(-k);
  return denom < 1e-6 ? warped : (1 - Math.exp(-k * warped)) / denom;
}

function easeScrollProgress(linearP) {
  const p = clamp01(linearP);
  return 1 - Math.pow(1 - p, BEAT_ASSETS.scrollEasePower);
}

function assetScrollProgress(linearP) {
  const kick = BEAT_ASSETS.transitionKick;
  return kick + (1 - kick) * easeScrollProgress(linearP);
}

function progressFromMs(elapsedMs, durationMs) {
  return clamp01(elapsedMs / durationMs);
}

function renderOrderForZ(z) {
  return z;
}

function depthScaleAtProgress(motion, homeScale) {
  const cfg = BEAT_ASSETS;
  return lerp(cfg.depthScaleFar * homeScale, cfg.depthScaleNear * homeScale, motion);
}

/** Desktop-authored framing spans; X scales with aspect so mobile stays on-screen. */
const ANCHOR_REF_ASPECT = 16 / 9;
const ANCHOR_X_SPAN = 9;
const ANCHOR_Y_SPAN = 5.5;

function getAnchorSpans(aspect) {
  const a = aspect > 0.05 ? aspect : ANCHOR_REF_ASPECT;
  return {
    xSpan: ANCHOR_X_SPAN * (a / ANCHOR_REF_ASPECT),
    ySpan: ANCHOR_Y_SPAN,
  };
}

function anchorToWorld(anchor, aspect = ANCHOR_REF_ASPECT) {
  const x = (anchor.x ?? 0.5) * 2 - 1;
  const y = -((anchor.y ?? 0.5) * 2 - 1);
  const { xSpan, ySpan } = getAnchorSpans(aspect);
  return { x: x * xSpan, y: y * ySpan };
}

function resolveEnterOrigin(homePos) {
  const spread = BEAT_ASSETS.enterLateralSpread ?? 0;
  return {
    x: homePos.x * spread,
    y: homePos.y * spread,
    z: homePos.z + BEAT_ASSETS.enterZOffset,
  };
}

function isInsideViewport(x, y, z, camera, width, height, pad = 0.12) {
  const v = new THREE.Vector3(x, y, z);
  v.project(camera);
  return (
    v.x >= -1 - pad &&
    v.x <= 1 + pad &&
    v.y >= -1 - pad &&
    v.y <= 1 + pad
  );
}

function resolveExitTarget(home, anchor, camera, width, height) {
  let dirX = home.x;
  let dirY = home.y;
  const len = Math.hypot(dirX, dirY);

  if (len < 0.35) {
    const ax = (anchor?.x ?? 0.5) - 0.5;
    const ay = (anchor?.y ?? 0.5) - 0.5;
    dirX = ax * 18;
    dirY = -ay * 11;
  }

  const dirLen = Math.hypot(dirX, dirY) || 1;
  const nx = dirX / dirLen;
  const ny = dirY / dirLen;
  const pad = BEAT_ASSETS.exitViewportPad ?? 0.28;
  let dist = BEAT_ASSETS.exitEdgeDistance;
  let ex = home.x + nx * dist;
  let ey = home.y + ny * dist;
  const ez = home.z + BEAT_ASSETS.exitZPush;

  while (
    camera &&
    width &&
    height &&
    isInsideViewport(ex, ey, ez, camera, width, height, pad) &&
    dist < 28
  ) {
    dist += 1.4;
    ex = home.x + nx * dist;
    ey = home.y + ny * dist;
  }

  return { x: ex, y: ey, z: ez };
}

function resolveSize(entry, texW, texH, _isMobile, layoutScale = 1) {
  const size = { ...(entry.size || {}) };
  // Beat layouts own mobile sizing via item.scale / itemsMobile — ignore
  // legacy sizeMobile from the streaming asset field.

  const scale = (size.scale ?? 1) * layoutScale;
  let w = size.maxWidth ?? 360;
  let h = w / (texW / texH);

  if (size.maxHeight && h > size.maxHeight) {
    h = size.maxHeight;
    w = h * (texW / texH);
  }

  const pxToWorld = 0.0045;
  return { width: w * scale * pxToWorld, height: h * scale * pxToWorld };
}

function getSafeZoneWidth(viewportWidth) {
  return viewportWidth < 768 ? SAFE_ZONE.mobileWidth : SAFE_ZONE.width;
}

function overlapsSafeZone(x, y, halfW, halfH, camera, width, height) {
  const v = new THREE.Vector3(x, y, 0);
  v.project(camera);
  const sx = (v.x * 0.5 + 0.5) * width;
  const sy = (-v.y * 0.5 + 0.5) * height;
  const safeW = getSafeZoneWidth(width);
  const safeH = height * SAFE_ZONE.heightRatio;
  const cx = width / 2;
  const cy = height / 2;
  const pad = 40;
  return (
    sx + halfW * width > cx - safeW / 2 - pad &&
    sx - halfW * width < cx + safeW / 2 + pad &&
    sy + halfH * height > cy - safeH / 2 - pad &&
    sy - halfH * height < cy + safeH / 2 + pad
  );
}

function nudgeFromSafeZone(x, y, halfW, halfH, camera, width, height) {
  let px = x;
  let py = y;
  let guard = 0;
  while (overlapsSafeZone(px, py, halfW, halfH, camera, width, height) && guard < 16) {
    px += px > 0 ? 0.55 : -0.55;
    py += py > 0 ? 0.45 : -0.45;
    guard++;
  }
  return { x: px, y: py };
}

export class BeatAssets {
  constructor(container, assetsManifest, beatLayouts, beatCount = 15) {
    this.container = container;
    this.manifest = assetsManifest;
    this.layoutManifest = beatLayouts;
    this.beatCount = beatCount;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.loadErrors = [];
    this.textureById = new Map();
    this.entryById = new Map();
    this.beatMeshes = new Map();
    this.settledBeat = -1;
    this.fromBeat = 0;
    this.toBeat = 0;
    this.transitionDirection = 1;
    this.introPlayed = false;
    this.introStartTime = null;
    this.assetTransition = null;
    this.pointerTarget = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0 };
    this.isMobile = window.innerWidth < 768;
    /** @type {null | "mobile" | "desktop"} Force layout in the asset tuner. */
    this.layoutViewportOverride = null;
    this.layoutTuning = false;
    this.layoutTuningLivePreview = false;
    this.tuningPreviewCycleStart = 0;
    this.tuningPreviewOnProgress = null;
    this.tuningBeat = 0;
    this.skipSafeZoneNudge = false;
    this._layoutSnapshots = new Map();
    this._raycaster = new THREE.Raycaster();
    this._pickNdc = new THREE.Vector2();
    this._dragHit = new THREE.Vector3();
    this._dragPlane = new THREE.Plane();
    this._dragPlaneNormal = new THREE.Vector3(0, 0, 1);
    this.tuningSelection = null;
    this.selectionOutline = null;

    for (const entry of assetsManifest.assets || []) {
      this.entryById.set(entry.id, entry);
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
    this.camera.position.set(0, 0, BEAT_ASSETS.cameraZ);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobile,
      alpha: true,
      powerPreference: "high-performance",
    });
    const initialBackground =
      document.documentElement.dataset.theme === "dark" ? 0x1d1c1a : 0xfcfcf5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(initialBackground, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.sortObjects = true;
    container.appendChild(this.renderer.domElement);
    this.fx = new AssetFx(this.renderer, this.scene, this.camera, {
      reducedMotion: this.reducedMotion,
      backgroundColor: initialBackground,
    });

    this._onResize = () => this.resize();
    this._onPointerMove = (event) => this.setPointerTarget(event.clientX, event.clientY);
    this._onPointerLeave = () => {
      this.pointerTarget.x = 0;
      this.pointerTarget.y = 0;
    };
    this._onThemeChange = (event) => {
      const color = event.detail?.theme === "dark" ? 0x1d1c1a : 0xfcfcf5;
      this.renderer.setClearColor(color, 1);
      this.fx.setBackgroundColor(color);
      this.syncSelectionOutlineColor();
    };
    window.addEventListener("resize", this._onResize);
    window.addEventListener("pointermove", this._onPointerMove, { passive: true });
    window.addEventListener("pointerleave", this._onPointerLeave);
    window.addEventListener("outland:themechange", this._onThemeChange);
    this.resize();

    this.loadPromise = this.load();
  }

  setPointerTarget(clientX, clientY) {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.pointerTarget.x = (clientX / w) * 2 - 1;
    this.pointerTarget.y = -((clientY / h) * 2 - 1);
  }

  parallaxStrength(z) {
    const cfg = BEAT_ASSETS.parallax;
    if (!cfg?.enabled) return 0;
    const span = Math.max(0.001, cfg.zMax - cfg.zMin);
    const depthMix = clamp01((z - cfg.zMin) / span);
    return lerp(cfg.strengthFar, cfg.strengthNear, depthMix);
  }

  storeBasePosition(mesh) {
    if (!mesh.userData.basePosition) {
      mesh.userData.basePosition = new THREE.Vector3();
    }
    mesh.userData.basePosition.copy(mesh.position);
  }

  smoothPointer() {
    const cfg = BEAT_ASSETS.parallax;
    const smooth = cfg?.smooth ?? 0.1;
    this.pointer.x += (this.pointerTarget.x - this.pointer.x) * smooth;
    this.pointer.y += (this.pointerTarget.y - this.pointer.y) * smooth;
  }

  floatScale() {
    const cfg = BEAT_ASSETS.float;
    if (this.reducedMotion || !cfg?.enabled) return 0;
    return (this.isMobile ? cfg.mobileScale : 1) * (cfg.intensity ?? 1);
  }

  getFloatDrift(mesh) {
    const motion = mesh.userData.float;
    const scale = this.floatScale();
    if (!motion || scale <= 0) {
      return { x: 0, y: 0, z: 0, rotZ: 0 };
    }

    const t = performance.now() * 0.001;

    return {
      x: Math.sin(t * motion.freq + motion.phase) * motion.ampX * scale,
      y: Math.cos(t * motion.freqY + motion.phaseY) * motion.ampY * scale,
      z: Math.sin(t * motion.freq * 0.74 + motion.phaseY) * motion.ampZ * scale,
      rotZ: Math.sin(t * motion.rotFreq + motion.phase) * motion.rotAmp * scale,
    };
  }

  addFloatDrift(mesh) {
    if (this.layoutTuning && !this.layoutTuningLivePreview) return;
    const drift = this.getFloatDrift(mesh);
    mesh.position.x += drift.x;
    mesh.position.y += drift.y;
    mesh.position.z += drift.z;
    mesh.rotation.z += drift.rotZ;
  }

  applyParallax() {
    const cfg = BEAT_ASSETS.parallax;
    if ((this.layoutTuning && !this.layoutTuningLivePreview) || this.reducedMotion || !cfg?.enabled) return;

    this.smoothPointer();
    const scale = this.isMobile ? cfg.mobileScale : 1;

    for (const meshes of this.beatMeshes.values()) {
      for (const mesh of meshes) {
        if (!mesh.visible || !mesh.userData.basePosition) continue;

        const base = mesh.userData.basePosition;
        const strength = this.parallaxStrength(mesh.userData.layout.home.z);
        mesh.position.set(
          base.x + this.pointer.x * cfg.maxX * strength * scale,
          base.y + this.pointer.y * cfg.maxY * strength * scale,
          base.z
        );
      }
    }
  }

  resolveBeatLayout(beatIndex) {
    const layouts = this.layoutManifest.layouts || this.layoutManifest.beats || [];
    if (!layouts.length) return { items: [] };

    const byId = new Map(layouts.map((layout) => [layout.id, layout]));
    const assignments = this.layoutManifest.assignments;
    if (assignments?.length) {
      const layoutId =
        assignments[Math.max(0, Math.min(beatIndex, assignments.length - 1))];
      return byId.get(layoutId) ?? layouts[0];
    }

    return layouts[beatIndex] ?? layouts[0];
  }

  getActiveItems(layout = null, beatIndex = 0) {
    const resolved = layout ?? this.resolveBeatLayout(beatIndex);
    if (this.isMobile && resolved?.itemsMobile?.length) {
      return resolved.itemsMobile;
    }
    return resolved?.items ?? [];
  }

  getLayoutIdForBeat(beatIndex) {
    const assignments = this.layoutManifest.assignments;
    if (assignments?.length) {
      return assignments[Math.max(0, Math.min(beatIndex, assignments.length - 1))];
    }
    return this.resolveBeatLayout(beatIndex)?.id ?? `beat-${beatIndex + 1}`;
  }

  worldToAnchor(x, y) {
    // Inverse of anchorToWorld: world ∈ [-span, span] ↔ anchor ∈ [0, 1]
    const { xSpan, ySpan } = getAnchorSpans(this.camera.aspect);
    return {
      x: clamp01(x / (2 * xSpan) + 0.5),
      y: clamp01(-y / (2 * ySpan) + 0.5),
    };
  }

  snapshotLayoutForBeat(beatIndex) {
    const layoutId = this.getLayoutIdForBeat(beatIndex);
    const snapshotKey = this.isMobile ? `${layoutId}::mobile` : layoutId;
    if (this._layoutSnapshots.has(snapshotKey)) return;
    const items = this.getActiveItems(null, beatIndex);
    this._layoutSnapshots.set(snapshotKey, JSON.parse(JSON.stringify(items)));
  }

  freezeForTuning(beatIndex) {
    this.layoutTuning = true;
    this.layoutTuningLivePreview = false;
    this.tuningBeat = beatIndex;
    this.introPlayed = true;
    this.assetTransition = null;
    this.snapshotLayoutForBeat(beatIndex);
    this.fx?.clearTrailBuffers();
    this.showSettled(beatIndex);
  }

  setTuningLivePreview(enabled, { onProgress } = {}) {
    if (!this.layoutTuning) return;

    this.layoutTuningLivePreview = enabled;
    this.tuningPreviewOnProgress = onProgress ?? null;

    if (enabled) {
      this.tuningPreviewCycleStart = performance.now();
      this.clearTuningSelection();
      this.fx?.clearTrailBuffers();
      return;
    }

    this.assetTransition = null;
    this.introPlayed = true;
    this.fx?.clearTrailBuffers();
    this.showSettled(this.tuningBeat);
  }

  updateTuningLivePreview() {
    if (!this.layoutTuningLivePreview) return;

    const incomingMs = BEAT_ASSETS.incomingDurationMs;
    const introMs = BEAT_ASSETS.introDurationMs;
    const holdMs = 700;
    const beat = this.tuningBeat;
    const cycleMs = beat === 0 ? introMs + holdMs : incomingMs + holdMs;
    const elapsed = (performance.now() - this.tuningPreviewCycleStart) % cycleMs;

    if (beat === 0) {
      this.assetTransition = null;
      if (elapsed < introMs) {
        this.introPlayed = false;
        this.introStartTime = performance.now() - elapsed;
        this.settledBeat = 0;
        this.tuningPreviewOnProgress?.({ from: 0, progress: elapsed / introMs, phase: "intro" });
      } else {
        this.introPlayed = true;
        this.showSettled(0);
        this.tuningPreviewOnProgress?.({ from: 0, progress: 0, phase: "settled" });
      }
      return;
    }

    const from = beat - 1;
    if (elapsed < incomingMs) {
      const progress = 0.04 + 0.96 * (elapsed / incomingMs);
      this.setBeatState(from, progress, 1);
      this.tuningPreviewOnProgress?.({ from, progress, phase: "incoming" });
      return;
    }

    this.assetTransition = null;
    this.showSettled(beat);
    this.tuningPreviewOnProgress?.({ from: beat, progress: 0, phase: "settled" });
  }

  endLayoutTuning() {
    if (!this.layoutTuning) return;
    this.setTuningLivePreview(false);
    this.layoutTuning = false;
    this.tuningPreviewOnProgress = null;
    this.fx?.clearTrailBuffers();
    this.clearTuningSelection();
  }

  setTuningSelection(beatIndex, itemIndex) {
    this.tuningSelection = { beatIndex, itemIndex };
    this.syncSelectionOutline();
  }

  clearTuningSelection() {
    this.tuningSelection = null;
    if (!this.selectionOutline) return;
    this.selectionOutline.visible = false;
  }

  selectionOutlineColor() {
    return document.documentElement.dataset.theme === "dark" ? 0xfcfcf5 : 0x1d1c1a;
  }

  syncSelectionOutlineColor() {
    if (!this.selectionOutline?.material?.color) return;
    this.selectionOutline.material.color.setHex(this.selectionOutlineColor());
  }

  syncSelectionOutline() {
    const selection = this.tuningSelection;
    if (!this.layoutTuning || this.layoutTuningLivePreview) {
      if (this.selectionOutline) this.selectionOutline.visible = false;
      return;
    }

    if (!selection) return;

    const mesh = this.getMeshesForBeat(selection.beatIndex)[selection.itemIndex];
    if (!mesh?.visible) {
      if (this.selectionOutline) this.selectionOutline.visible = false;
      return;
    }

    const { width, height } = mesh.geometry.parameters ?? {};
    if (!width || !height) return;

    const pad = 1.05;
    if (!this.selectionOutline) {
      const outlineGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
      const outlineMat = new THREE.LineBasicMaterial({
        color: this.selectionOutlineColor(),
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      });
      this.selectionOutline = new THREE.LineSegments(outlineGeo, outlineMat);
      this.selectionOutline.frustumCulled = false;
      this.selectionOutline.renderOrder = 2000;
      this.scene.add(this.selectionOutline);
    } else {
      this.syncSelectionOutlineColor();
    }

    this.selectionOutline.position.copy(mesh.position);
    this.selectionOutline.position.z = mesh.position.z + 0.02;
    this.selectionOutline.rotation.z = mesh.rotation.z;
    this.selectionOutline.scale.set(mesh.scale.x * width * pad, mesh.scale.y * height * pad, 1);
    this.selectionOutline.visible = true;
  }

  setLayoutTuningOptions({ skipSafeZoneNudge = false } = {}) {
    this.skipSafeZoneNudge = skipSafeZoneNudge;
    for (const meshes of this.beatMeshes.values()) {
      for (const mesh of meshes) {
        this.rebuildMeshLayout(mesh);
      }
    }
    this.updateAllMeshes();
  }

  resolveViewportMobile() {
    if (this.layoutViewportOverride === "mobile") return true;
    if (this.layoutViewportOverride === "desktop") return false;
    return (this.container.clientWidth || window.innerWidth) < 768;
  }

  /**
   * Force desktop/mobile layouts while the asset tuner is open.
   * Pass null to follow the real viewport width again.
   */
  setLayoutViewportOverride(mode) {
    const next =
      mode === "mobile" || mode === "desktop" ? mode : null;
    if (this.layoutViewportOverride === next) return this.isMobile;
    this.layoutViewportOverride = next;
    document.documentElement.classList.toggle(
      "asset-layout-tuner-mobile",
      next === "mobile"
    );
    document.documentElement.style.removeProperty("--tuner-mobile-scale");

    let badge = document.getElementById("asset-layout-tuner-mobile-badge");
    if (next === "mobile") {
      if (!badge) {
        badge = document.createElement("div");
        badge.id = "asset-layout-tuner-mobile-badge";
        badge.className = "asset-layout-tuner-mobile-badge";
        document.body.appendChild(badge);
      }
      badge.textContent = "390 × 844 · 1× Figma mobile";
    } else {
      badge?.remove();
    }

    // Frame size applies on next layout; resize twice so WebGL picks it up.
    this.resize();
    requestAnimationFrame(() => {
      this.resize();
      if (this.layoutTuning) this.showSettled(this.tuningBeat);
    });
    return this.isMobile;
  }

  getMeshesForBeat(beatIndex) {
    return this.beatMeshes.get(beatIndex) ?? [];
  }

  pickMeshAt(clientX, clientY, beatIndex = this.tuningBeat) {
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    this._pickNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._pickNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pickNdc, this.camera);

    const meshes = this.getMeshesForBeat(beatIndex).filter((mesh) => mesh.visible);
    const hits = this._raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;

    hits.sort((a, b) => {
      const order = b.object.renderOrder - a.object.renderOrder;
      return order !== 0 ? order : a.distance - b.distance;
    });
    return hits[0]?.object ?? null;
  }

  /** Screen point → world XY on a plane at z (facing the camera). */
  clientToWorldXY(clientX, clientY, z = 0) {
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    this._pickNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._pickNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pickNdc, this.camera);
    this._dragPlane.set(this._dragPlaneNormal, -z);
    if (!this._raycaster.ray.intersectPlane(this._dragPlane, this._dragHit)) return null;
    return { x: this._dragHit.x, y: this._dragHit.y, z };
  }

  applyItemPatch(beatIndex, itemIndex, patch) {
    const meshes = this.getMeshesForBeat(beatIndex);
    const mesh = meshes[itemIndex];
    if (!mesh) return;

    const item = mesh.userData.layout.item;
    const prevBlend = item.blendMode;
    const prevAssetId = item.assetId;
    if (patch.anchor) {
      item.anchor = { ...(item.anchor ?? { x: 0.5, y: 0.5 }), ...patch.anchor };
    }
    for (const [key, value] of Object.entries(patch)) {
      if (key === "anchor") continue;
      if (key === "blendMode") {
        item.blendMode = canonicalizeBlendMode(value);
        continue;
      }
      item[key] = value;
    }

    const layoutId = this.getLayoutIdForBeat(beatIndex);
    for (let beat = 0; beat < this.beatCount; beat++) {
      if (this.getLayoutIdForBeat(beat) !== layoutId) continue;
      const beatMeshes = this.getMeshesForBeat(beat);
      const beatMesh = beatMeshes[itemIndex];
      if (!beatMesh) continue;
      beatMesh.userData.layout.item = item;
      this.rebuildMeshLayout(beatMesh);
    }

    this.updateAllMeshes();

    if (
      !this.layoutTuning &&
      (patch.blendMode != null || patch.opacity != null || patch.assetId != null) &&
      (patch.blendMode !== prevBlend || patch.assetId !== prevAssetId)
    ) {
      this.fx?.clearTrailBuffers();
    }
  }

  moveItemByWorldDelta(beatIndex, itemIndex, dx, dy) {
    const mesh = this.getMeshesForBeat(beatIndex)[itemIndex];
    if (!mesh) return;

    const home = mesh.userData.layout.home;
    const next = this.worldToAnchor(home.x + dx, home.y + dy);
    this.applyItemPatch(beatIndex, itemIndex, { anchor: next });
  }

  /** Lightweight drag update — keeps the mesh under the cursor without geometry rebuilds. */
  dragItemToWorld(beatIndex, itemIndex, x, y) {
    const mesh = this.getMeshesForBeat(beatIndex)[itemIndex];
    if (!mesh) return;

    const item = mesh.userData.layout.item;
    const home = mesh.userData.layout.home;
    const anchor = this.worldToAnchor(x, y);
    item.anchor = { x: anchor.x, y: anchor.y };
    home.x = x;
    home.y = y;
    mesh.position.x = x;
    mesh.position.y = y;
    this.storeBasePosition(mesh);

    const layoutId = this.getLayoutIdForBeat(beatIndex);
    for (let beat = 0; beat < this.beatCount; beat++) {
      if (beat === beatIndex) continue;
      if (this.getLayoutIdForBeat(beat) !== layoutId) continue;
      const other = this.getMeshesForBeat(beat)[itemIndex];
      if (!other) continue;
      other.userData.layout.item = item;
      other.userData.layout.home.x = x;
      other.userData.layout.home.y = y;
    }

    this.syncSelectionOutline();
  }

  /** Finalize a drag so shared layout meshes fully rebuild from the new anchor. */
  commitItemDrag(beatIndex, itemIndex) {
    const mesh = this.getMeshesForBeat(beatIndex)[itemIndex];
    if (!mesh) return;
    const item = mesh.userData.layout.item;
    this.applyItemPatch(beatIndex, itemIndex, {
      anchor: { x: item.anchor?.x ?? 0.5, y: item.anchor?.y ?? 0.5 },
    });
  }

  rebuildMeshLayout(mesh) {
    const { item, entry } = mesh.userData.layout;
    const tex = mesh.material.map;
    if (!tex?.image) return;

    const { width, height } = resolveSize(
      entry,
      tex.image.width,
      tex.image.height,
      this.isMobile,
      item.scale ?? 1
    );

    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(width, height);

    const visual = resolveItemVisual(item);
    applyBlendToMaterial(mesh.material, visual.blendMode, visual.opacity);
    mesh.userData.layout.targetOpacity = visual.opacity;
    mesh.userData.layout.home = this.resolveHome(item, width, height);
  }

  /**
   * Bake the live on-screen pose (and explicit visual fields) back onto each
   * layout item so Save/Copy persist what the tuner is actually showing.
   */
  flushLayoutEdits(beatIndex) {
    const meshes = this.getMeshesForBeat(beatIndex);
    for (const mesh of meshes) {
      const layout = mesh?.userData?.layout;
      const item = layout?.item;
      if (!item) continue;

      const home = layout.home;
      const x = Number.isFinite(mesh.position?.x) ? mesh.position.x : home?.x;
      const y = Number.isFinite(mesh.position?.y) ? mesh.position.y : home?.y;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const anchor = this.worldToAnchor(x, y);
        item.anchor = { x: anchor.x, y: anchor.y };
        if (home) {
          home.x = x;
          home.y = y;
        }
      }

      if (item.blendMode == null) {
        item.blendMode = "normal";
      } else {
        item.blendMode = canonicalizeBlendMode(item.blendMode);
      }
      if (item.opacity == null) {
        item.opacity = layout.targetOpacity ?? 1;
      }
      if (item.rotation == null) item.rotation = 0;
      if (item.scale == null) item.scale = 1;
      if (item.z == null) item.z = 0;
    }
  }

  exportLayoutItems(beatIndex) {
    this.flushLayoutEdits(beatIndex);

    const items = this.getActiveItems(null, beatIndex);
    const round = (value) => Math.round(value * 1000) / 1000;

    return items.map((item) => {
      const visual = resolveItemVisual(item);
      return {
        assetId: item.assetId,
        anchor: {
          x: round(item.anchor?.x ?? 0.5),
          y: round(item.anchor?.y ?? 0.5),
        },
        rotation: round(item.rotation ?? 0),
        z: round(item.z ?? 0),
        scale: round(item.scale ?? 1),
        blendMode: visual.blendMode,
        opacity: round(visual.opacity),
      };
    });
  }

  resetLayoutForBeat(beatIndex) {
    const layoutId = this.getLayoutIdForBeat(beatIndex);
    const snapshotKey = this.isMobile ? `${layoutId}::mobile` : layoutId;
    const snapshot = this._layoutSnapshots.get(snapshotKey);
    if (!snapshot) return;

    this.applyLayoutItems(beatIndex, snapshot);
  }

  /** Replace active layout items and rebuild meshes (used by undo / reset). */
  applyLayoutItems(beatIndex, items) {
    if (!Array.isArray(items)) return;

    const layoutId = this.getLayoutIdForBeat(beatIndex);
    const layout = this.resolveBeatLayout(beatIndex);
    const target = this.getActiveItems(layout, beatIndex);
    if (this.isMobile && !layout.itemsMobile) {
      layout.itemsMobile = target;
    }
    target.splice(0, target.length, ...JSON.parse(JSON.stringify(items)));

    for (const beat of this.getBeatsForLayout(layoutId)) {
      this.rebuildBeatMeshes(beat);
    }

    this.updateAllMeshes();
    if (this.layoutTuning && this.tuningBeat === beatIndex) {
      this.showSettled(beatIndex);
    }
  }

  /** Treat the current in-memory layout as the Reset baseline (e.g. after Save). */
  commitLayoutSnapshot(beatIndex) {
    const layoutId = this.getLayoutIdForBeat(beatIndex);
    this.updateLayoutSnapshot(layoutId);
  }

  getManifestAssetIds() {
    return (this.manifest.assets || [])
      .filter((entry) => entry.enabled !== false)
      .map((entry) => entry.id);
  }

  getBeatsForLayout(layoutId) {
    const beats = [];
    for (let beat = 0; beat < this.beatCount; beat++) {
      if (this.getLayoutIdForBeat(beat) === layoutId) beats.push(beat);
    }
    return beats;
  }

  updateLayoutSnapshot(layoutId) {
    const layout = (this.layoutManifest.layouts || []).find((entry) => entry.id === layoutId);
    if (!layout) return;
    const snapshotKey = this.isMobile ? `${layoutId}::mobile` : layoutId;
    const items = this.isMobile && layout.itemsMobile?.length ? layout.itemsMobile : layout.items;
    this._layoutSnapshots.set(snapshotKey, JSON.parse(JSON.stringify(items ?? [])));
  }

  async ensureTexture(assetId) {
    if (this.textureById.has(assetId)) return true;

    const entry = this.entryById.get(assetId);
    if (!entry) return false;

    try {
      const loader = new THREE.TextureLoader();
      const tex = await loader.loadAsync(assetUrl(entry.src));
      configureLoadedTexture(tex, entry);
      this.textureById.set(assetId, tex);
      return true;
    } catch (err) {
      console.error(`[BeatAssets] Failed to load: ${assetId}`, err);
      return false;
    }
  }

  disposeMesh(mesh) {
    this.scene.remove(mesh);
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }

  createMeshForItem(beatIndex, itemIndex, item, isMobile = this.isMobile) {
    const entry = this.entryById.get(item.assetId);
    const tex = this.textureById.get(item.assetId);
    if (!entry || !tex) return null;

    const { width, height } = resolveSize(
      entry,
      tex.image.width,
      tex.image.height,
      isMobile,
      item.scale ?? 1
    );
    const visual = resolveItemVisual(item);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    applyBlendToMaterial(mat, visual.blendMode, visual.opacity);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.visible = false;
    mesh.userData.layout = {
      beatIndex,
      itemIndex,
      item,
      entry,
      targetOpacity: visual.opacity,
      home: this.resolveHome(item, width, height),
    };
    mesh.userData.float = resolveFloatMotion(itemIndex, beatIndex);
    this.scene.add(mesh);
    return mesh;
  }

  rebuildBeatMeshes(beatIndex) {
    const meshes = this.getMeshesForBeat(beatIndex);
    for (const mesh of meshes) {
      this.disposeMesh(mesh);
    }

    const layout = this.resolveBeatLayout(beatIndex);
    const items = this.getActiveItems(layout, beatIndex);
    const nextMeshes = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const mesh = this.createMeshForItem(beatIndex, itemIndex, item);
      if (mesh) nextMeshes.push(mesh);
    }

    this.beatMeshes.set(beatIndex, nextMeshes);
  }

  async addLayoutItem(beatIndex, assetId) {
    if (!this.entryById.has(assetId)) return false;
    if (!(await this.ensureTexture(assetId))) return false;

    const layoutId = this.getLayoutIdForBeat(beatIndex);
    const layout = this.resolveBeatLayout(beatIndex);
    const items = this.getActiveItems(layout, beatIndex);
    if (this.isMobile && !layout.itemsMobile) {
      layout.itemsMobile = items;
    }
    const newItem = {
      assetId,
      anchor: { x: 0.5, y: 0.5 },
      rotation: 0,
      z: 0,
      scale: 1,
    };
    items.push(newItem);

    for (const beat of this.getBeatsForLayout(layoutId)) {
      const meshes = this.getMeshesForBeat(beat);
      const itemIndex = items.length - 1;
      const mesh = this.createMeshForItem(beat, itemIndex, newItem);
      if (mesh) meshes.push(mesh);
      this.beatMeshes.set(beat, meshes);
    }

    if (this.layoutTuning) this.updateLayoutSnapshot(layoutId);
    this.updateAllMeshes();
    if (this.layoutTuning) this.showSettled(beatIndex);
    return true;
  }

  removeLayoutItem(beatIndex, itemIndex) {
    const layoutId = this.getLayoutIdForBeat(beatIndex);
    const layout = this.resolveBeatLayout(beatIndex);
    const items = this.getActiveItems(layout, beatIndex);
    if (itemIndex < 0 || itemIndex >= items.length) return false;

    items.splice(itemIndex, 1);

    for (const beat of this.getBeatsForLayout(layoutId)) {
      const meshes = this.getMeshesForBeat(beat);
      const mesh = meshes[itemIndex];
      if (mesh) this.disposeMesh(mesh);
      meshes.splice(itemIndex, 1);
      meshes.forEach((entry, index) => {
        entry.userData.layout.itemIndex = index;
        entry.userData.layout.item = items[index];
      });
      this.beatMeshes.set(beat, meshes);
    }

    if (this.layoutTuning) this.updateLayoutSnapshot(layoutId);
    this.updateAllMeshes();
    if (this.layoutTuning) this.showSettled(beatIndex);
    return true;
  }

  async swapLayoutItemAsset(beatIndex, itemIndex, assetId) {
    if (!this.entryById.has(assetId)) return false;
    if (!(await this.ensureTexture(assetId))) return false;

    const layoutId = this.getLayoutIdForBeat(beatIndex);
    const layout = this.resolveBeatLayout(beatIndex);
    const items = this.getActiveItems(layout, beatIndex);
    const item = items[itemIndex];
    if (!item) return false;

    item.assetId = assetId;
    const entry = this.entryById.get(assetId);
    const tex = this.textureById.get(assetId);

    for (const beat of this.getBeatsForLayout(layoutId)) {
      const mesh = this.getMeshesForBeat(beat)[itemIndex];
      if (!mesh) continue;
      mesh.userData.layout.item = item;
      mesh.userData.layout.entry = entry;
      mesh.material.map = tex;
      this.rebuildMeshLayout(mesh);
    }

    this.updateAllMeshes();
    return true;
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const isMobile = this.resolveViewportMobile();
    const usedIds = new Set();

    const layouts = this.layoutManifest.layouts || this.layoutManifest.beats || [];
    for (const layout of layouts) {
      for (const item of layout.items || []) {
        usedIds.add(item.assetId);
      }
      for (const item of layout.itemsMobile || []) {
        usedIds.add(item.assetId);
      }
    }

    const loadTexture = async (assetId) => {
      if (this.textureById.has(assetId)) return;
      const entry = this.entryById.get(assetId);
      if (!entry) {
        this.loadErrors.push(assetId);
        return;
      }
      try {
        const tex = await loader.loadAsync(assetUrl(entry.src));
        configureLoadedTexture(tex, entry);
        this.textureById.set(assetId, tex);
      } catch (err) {
        console.error(`[BeatAssets] Failed to load: ${assetId}`, err);
        this.loadErrors.push(assetId);
      }
    };

    await Promise.all([...usedIds].map(loadTexture));
    this.buildBeatMeshes(isMobile);

    if (this.loadErrors.length) {
      console.warn("[BeatAssets] Missing assets:", this.loadErrors.join(", "));
    }

    this.startIntro();
  }

  buildBeatMeshes(isMobile) {
    for (let beatIndex = 0; beatIndex < this.beatCount; beatIndex++) {
      this.isMobile = isMobile;
      this.rebuildBeatMeshes(beatIndex);
    }
  }

  resolveHome(item, width, height) {
    const world = anchorToWorld(item.anchor, this.camera.aspect);
    const halfW = width / (this.container.clientWidth || 1);
    const halfH = height / (this.container.clientHeight || 1);
    // Mobile layouts are hand-authored for a narrow viewport. Safe-zone
    // nudging pushes edge pieces off-screen on phones.
    const nudged =
      this.skipSafeZoneNudge || this.isMobile
        ? { x: world.x, y: world.y }
        : nudgeFromSafeZone(
            world.x,
            world.y,
            halfW,
            halfH,
            this.camera,
            this.container.clientWidth,
            this.container.clientHeight
          );

    const homePos = {
      x: nudged.x,
      y: nudged.y,
      z: item.z ?? 0,
    };

    return {
      x: homePos.x,
      y: homePos.y,
      z: homePos.z,
      rotZ: THREE.MathUtils.degToRad(item.rotation ?? 0),
      scale: 1,
      enter: resolveEnterOrigin(homePos),
      exit: resolveExitTarget(
        homePos,
        item.anchor,
        this.camera,
        this.container.clientWidth,
        this.container.clientHeight
      ),
    };
  }

  startIntro() {
    this.settledBeat = 0;
    this.fromBeat = 0;
    this.toBeat = 0;
    this.introPlayed = false;
    this.introStartTime = performance.now();
    this.assetTransition = null;
    this.updateAllMeshes();
  }

  restartFromBeginning() {
    this.assetTransition = null;
    this.startIntro();
  }

  getIntroProgress() {
    if (this.introPlayed || this.introStartTime == null) return 1;
    const elapsed = performance.now() - this.introStartTime;
    return progressFromMs(elapsed, BEAT_ASSETS.introDurationMs);
  }

  beginAssetTransition(from, to, forward) {
    const incomingBeat = forward ? to : from;
    const leavingBeat = forward ? from : to;
    const incomingRole =
      incomingBeat === 0 ? "incoming" : forward ? "incoming" : "return";
    const sharedLayout =
      this.getLayoutIdForBeat(incomingBeat) === this.getLayoutIdForBeat(leavingBeat);

    this.assetTransition = {
      startTime: performance.now(),
      incomingBeat,
      leavingBeat,
      incomingRole,
      leavingRole: forward ? "outgoing" : "retreat",
      sharedLayout,
    };
  }

  getTransitionElapsed() {
    if (!this.assetTransition) return 0;
    return performance.now() - this.assetTransition.startTime;
  }

  getIncomingProgress() {
    if (!this.assetTransition || this.reducedMotion) return 1;
    return progressFromMs(this.getTransitionElapsed(), BEAT_ASSETS.incomingDurationMs);
  }

  getLeavingProgress() {
    if (!this.assetTransition || this.reducedMotion) return 1;
    return progressFromMs(this.getTransitionElapsed(), BEAT_ASSETS.incomingDurationMs);
  }

  getMotionIntensity() {
    if (this.reducedMotion) return 0;
    if (this.layoutTuning && !this.layoutTuningLivePreview) return 0;

    let intensity = 0;
    const k = BEAT_ASSETS.incomingWarpRate;

    if (!this.introPlayed && this.settledBeat === 0) {
      intensity = Math.max(intensity, Math.exp(-k * this.getIntroProgress()));
    }

    if (this.assetTransition) {
      intensity = Math.max(intensity, Math.exp(-k * this.getIncomingProgress()));
      intensity = Math.max(intensity, Math.exp(-k * this.getLeavingProgress()));
    }

    return intensity;
  }

  applyMeshState(mesh, role, { incomingT = 1, leavingT = 1 } = {}) {
    const { home, targetOpacity } = mesh.userData.layout;

    if (role === "hidden") {
      mesh.visible = false;
      mesh.userData.basePosition = null;
      return;
    }

    mesh.visible = true;

    if (this.reducedMotion) {
      mesh.position.set(home.x, home.y, home.z);
      mesh.rotation.z = home.rotZ;
      mesh.scale.setScalar(home.scale);
      mesh.material.opacity =
        role === "outgoing" || role === "retreat"
          ? targetOpacity * (1 - easeIncoming(leavingT))
          : targetOpacity * easeIncoming(incomingT);
      mesh.renderOrder = renderOrderForZ(home.z);
      this.addFloatDrift(mesh);
      this.storeBasePosition(mesh);
      return;
    }

    if (role === "settled") {
      mesh.position.set(home.x, home.y, home.z);
      mesh.rotation.z = home.rotZ;
      mesh.scale.setScalar(home.scale);
      mesh.material.opacity = targetOpacity;
      mesh.renderOrder = renderOrderForZ(home.z);
      this.addFloatDrift(mesh);
      this.storeBasePosition(mesh);
      return;
    }

    if (role === "incoming" || role === "return") {
      const motion = easeIncoming(incomingT);

      if (role === "return") {
        mesh.position.set(
          lerp(home.exit.x, home.x, motion),
          lerp(home.exit.y, home.y, motion),
          lerp(home.exit.z, home.z, motion)
        );
        mesh.rotation.z = lerp(home.rotZ * 1.06, home.rotZ, motion);
        mesh.scale.setScalar(lerp(BEAT_ASSETS.exitScale, home.scale, motion));
      } else {
        const origin = home.enter;
        mesh.position.set(
          lerp(origin.x, home.x, motion),
          lerp(origin.y, home.y, motion),
          lerp(origin.z, home.z, motion)
        );
        mesh.rotation.z = lerp(home.rotZ * 0.4, home.rotZ, motion);
        mesh.scale.setScalar(depthScaleAtProgress(motion, home.scale));
      }

      mesh.material.opacity = targetOpacity * motion;
      mesh.renderOrder = renderOrderForZ(home.z);
      this.addFloatDrift(mesh);
      this.storeBasePosition(mesh);
      return;
    }

    if (role === "outgoing") {
      const motion = easeIncoming(leavingT);
      const target = home.exit;

      mesh.position.set(
        lerp(home.x, target.x, motion),
        lerp(home.y, target.y, motion),
        lerp(home.z, target.z, motion)
      );
      mesh.rotation.z = lerp(home.rotZ, home.rotZ * 1.06, motion);
      mesh.scale.setScalar(lerp(home.scale, BEAT_ASSETS.exitScale, motion));
      mesh.material.opacity = targetOpacity * (1 - motion);
      mesh.renderOrder = renderOrderForZ(home.z);
      this.addFloatDrift(mesh);
      this.storeBasePosition(mesh);
      return;
    }

    if (role === "retreat") {
      const motion = easeIncoming(leavingT);
      const target = home.enter;

      mesh.position.set(
        lerp(home.x, target.x, motion),
        lerp(home.y, target.y, motion),
        lerp(home.z, target.z, motion)
      );
      mesh.rotation.z = lerp(home.rotZ, home.rotZ * 0.4, motion);
      mesh.scale.setScalar(depthScaleAtProgress(1 - motion, home.scale));
      mesh.material.opacity = targetOpacity * (1 - motion);
      mesh.renderOrder = renderOrderForZ(home.z);
      this.addFloatDrift(mesh);
      this.storeBasePosition(mesh);
    }
  }

  updateAllMeshes() {
    if (this.layoutTuning && !this.layoutTuningLivePreview) {
      for (const [beatIndex, meshes] of this.beatMeshes) {
        for (const mesh of meshes) {
          const role = beatIndex === this.tuningBeat ? "settled" : "hidden";
          this.applyMeshState(mesh, role, { incomingT: 1, leavingT: 1 });
        }
      }
      return;
    }

    const introActive = !this.introPlayed && this.settledBeat === 0;
    const introT = introActive ? this.getIntroProgress() : 1;
    const incomingT = this.assetTransition ? this.getIncomingProgress() : 1;
    const leavingT = this.assetTransition ? this.getLeavingProgress() : 1;

    for (const [beatIndex, meshes] of this.beatMeshes) {
      for (const mesh of meshes) {
        let role = "hidden";

        if (introActive) {
          if (beatIndex === 0) role = "incoming";
        } else if (this.assetTransition) {
          const { incomingBeat, leavingBeat, incomingRole, leavingRole, sharedLayout } =
            this.assetTransition;

          if (sharedLayout) {
            if (beatIndex === incomingBeat) {
              role = incomingRole;
            }
          } else if (beatIndex === leavingBeat && leavingT < 1) {
            role = leavingRole;
          } else if (beatIndex === incomingBeat) {
            role = incomingRole;
          }
        } else if (this.settledBeat >= 0 && beatIndex === this.settledBeat) {
          role = "settled";
        }

        this.applyMeshState(mesh, role, { incomingT: introActive ? introT : incomingT, leavingT });
      }
    }
  }

  getSettleRemainingMs() {
    if (!this.assetTransition || this.reducedMotion) return 0;
    const elapsed = this.getTransitionElapsed();
    return Math.max(0, Math.ceil(BEAT_ASSETS.incomingDurationMs - elapsed));
  }

  isSettlingIn() {
    return this.getSettleRemainingMs() > 0;
  }

  finishAssetTransition() {
    if (!this.assetTransition) return;
    const beatIndex = this.assetTransition.incomingBeat;
    this.assetTransition = null;
    this.showSettled(beatIndex);
  }

  finishIntro() {
    this.introPlayed = true;
    this.introStartTime = null;
    this.showSettled(0);
  }

  showSettled(beatIndex) {
    this.settledBeat = beatIndex;
    this.fromBeat = beatIndex;
    this.toBeat = beatIndex;
    this.updateAllMeshes();
  }

  setBeatState(fromIndex, progress, direction = 1) {
    const beatCount = this.beatCount;
    const from = Math.max(0, Math.min(beatCount - 1, fromIndex));
    const to = Math.min(beatCount - 1, from + 1);
    const t = clamp01(progress);
    const forward = direction >= 0;
    this.transitionDirection = direction;

    if (!this.introPlayed && from === 0 && t > 0.02) {
      this.finishIntro();
    }

    if (from >= beatCount - 1 || t < 0.02) {
      const settleBeat = from;
      if (this.assetTransition && this.getIncomingProgress() < 1 && !this.reducedMotion) {
        this.settledBeat = settleBeat;
        this.fromBeat = settleBeat;
        this.toBeat = settleBeat;
        return;
      }
      this.assetTransition = null;
      this.showSettled(settleBeat);
      return;
    }

    const incomingBeat = forward ? to : from;
    if (
      !this.assetTransition ||
      this.assetTransition.incomingBeat !== incomingBeat ||
      this.assetTransition.leavingBeat !== (forward ? from : to)
    ) {
      this.beginAssetTransition(from, to, forward);
    }

    this.settledBeat = -1;
    this.fromBeat = from;
    this.toBeat = to;
    this.updateAllMeshes();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const nextMobile = this.resolveViewportMobile();
    const layoutChanged = nextMobile !== this.isMobile;
    this.isMobile = nextMobile;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.fx?.setSize(w, h);

    if (layoutChanged) {
      this.buildBeatMeshes(nextMobile);
    } else {
      for (const meshes of this.beatMeshes.values()) {
        for (const mesh of meshes) {
          const { item, entry } = mesh.userData.layout;
          const tex = mesh.material.map;
          if (!tex?.image) continue;
          const { width, height } = resolveSize(
            entry,
            tex.image.width,
            tex.image.height,
            nextMobile,
            item.scale ?? 1
          );
          mesh.geometry.dispose();
          mesh.geometry = new THREE.PlaneGeometry(width, height);
          mesh.userData.layout.home = this.resolveHome(item, width, height);
        }
      }
    }
    this.updateAllMeshes();
  }

  render() {
    if (this.layoutTuningLivePreview) {
      this.updateTuningLivePreview();
    } else if (!this.layoutTuning) {
      if (!this.introPlayed && this.settledBeat === 0 && this.getIntroProgress() >= 1) {
        this.finishIntro();
      } else if (this.assetTransition && this.getIncomingProgress() >= 1) {
        this.finishAssetTransition();
      }
    }

    this.updateAllMeshes();
    this.syncSelectionOutline();
    this.applyParallax();
    this.fx?.setMotionIntensity(this.getMotionIntensity());
    this.fx?.render();
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerleave", this._onPointerLeave);
    window.removeEventListener("outland:themechange", this._onThemeChange);
    this.fx?.dispose();
    if (this.selectionOutline) {
      this.scene.remove(this.selectionOutline);
      this.selectionOutline.geometry.dispose();
      this.selectionOutline.material.dispose();
      this.selectionOutline = null;
    }
    for (const meshes of this.beatMeshes.values()) {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.map?.dispose();
        mesh.material.dispose();
      }
    }
    this.renderer.dispose();
  }
}
