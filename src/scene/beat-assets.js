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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
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
  return -z;
}

function depthScaleAtProgress(motion, homeScale) {
  const cfg = BEAT_ASSETS;
  return lerp(cfg.depthScaleFar * homeScale, cfg.depthScaleNear * homeScale, motion);
}

function anchorToWorld(anchor) {
  const x = (anchor.x ?? 0.5) * 2 - 1;
  const y = -((anchor.y ?? 0.5) * 2 - 1);
  return { x: x * 9, y: y * 5.5 };
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

function resolveSize(entry, texW, texH, isMobile, layoutScale = 1) {
  const size = { ...(entry.size || {}) };
  if (isMobile && entry.sizeMobile) {
    Object.assign(size, entry.sizeMobile);
  }

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

    for (const entry of assetsManifest.assets || []) {
      this.entryById.set(entry.id, entry);
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
    this.camera.position.set(0, 0, BEAT_ASSETS.cameraZ);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1d1c1a, 1);
    this.renderer.sortObjects = true;
    container.appendChild(this.renderer.domElement);
    this.fx = new AssetFx(this.renderer, this.scene, this.camera, {
      reducedMotion: this.reducedMotion,
      backgroundColor: 0x1d1c1a,
    });

    this._onResize = () => this.resize();
    this._onPointerMove = (event) => this.setPointerTarget(event.clientX, event.clientY);
    this._onPointerLeave = () => {
      this.pointerTarget.x = 0;
      this.pointerTarget.y = 0;
    };
    window.addEventListener("resize", this._onResize);
    window.addEventListener("pointermove", this._onPointerMove, { passive: true });
    window.addEventListener("pointerleave", this._onPointerLeave);
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

  applyParallax() {
    const cfg = BEAT_ASSETS.parallax;
    if (this.reducedMotion || !cfg?.enabled) return;

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
    const beats = this.layoutManifest.beats || [];
    const direct = beats[beatIndex];
    if (direct) return direct;

    const pattern = this.layoutManifest.fallbackPattern || ["beat-01"];
    const patternId = pattern[beatIndex % pattern.length];
    return beats.find((beat) => beat.id === patternId) ?? beats[0];
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const isMobile = window.innerWidth < 768;
    const usedIds = new Set();

    for (const beat of this.layoutManifest.beats || []) {
      for (const item of beat.items || []) {
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
        tex.colorSpace = THREE.SRGBColorSpace;
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
      const layout = this.resolveBeatLayout(beatIndex);
      const meshes = [];

      for (let itemIndex = 0; itemIndex < (layout.items || []).length; itemIndex++) {
        const item = layout.items[itemIndex];
        const entry = this.entryById.get(item.assetId);
        const tex = this.textureById.get(item.assetId);
        if (!entry || !tex) continue;

        const { width, height } = resolveSize(
          entry,
          tex.image.width,
          tex.image.height,
          isMobile,
          item.scale ?? 1
        );
        const blendMode = item.blendMode ?? entry.blendMode ?? "normal";
        const blend = BLEND_MAP[blendMode]?.() ?? BLEND_MAP.normal();
        const targetOpacity = item.opacity ?? entry.opacity ?? 1;

        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          blending: blend.blending,
          premultipliedAlpha: blend.blending === THREE.MultiplyBlending,
          opacity: 0,
          depthWrite: false,
          depthTest: blend.blending === THREE.NormalBlending,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
        mesh.visible = false;
        mesh.userData.layout = {
          beatIndex,
          itemIndex,
          item,
          entry,
          targetOpacity,
          home: this.resolveHome(item, width, height),
        };

        this.scene.add(mesh);
        meshes.push(mesh);
      }

      this.beatMeshes.set(beatIndex, meshes);
    }
  }

  resolveHome(item, width, height) {
    const world = anchorToWorld(item.anchor);
    const halfW = width / (this.container.clientWidth || 1);
    const halfH = height / (this.container.clientHeight || 1);
    const nudged = nudgeFromSafeZone(
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

  getIntroProgress() {
    if (this.introPlayed || this.introStartTime == null) return 1;
    const elapsed = performance.now() - this.introStartTime;
    return progressFromMs(elapsed, BEAT_ASSETS.introDurationMs);
  }

  beginAssetTransition(from, to, forward) {
    const incomingBeat = forward ? to : from;
    const incomingRole =
      incomingBeat === 0 ? "incoming" : forward ? "incoming" : "return";

    this.assetTransition = {
      startTime: performance.now(),
      incomingBeat,
      leavingBeat: forward ? from : to,
      incomingRole,
      leavingRole: forward ? "outgoing" : "retreat",
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
      this.storeBasePosition(mesh);
      return;
    }

    if (role === "settled") {
      mesh.position.set(home.x, home.y, home.z);
      mesh.rotation.z = home.rotZ;
      mesh.scale.setScalar(home.scale);
      mesh.material.opacity = targetOpacity;
      mesh.renderOrder = renderOrderForZ(home.z);
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
      this.storeBasePosition(mesh);
    }
  }

  updateAllMeshes() {
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
          const { incomingBeat, leavingBeat, incomingRole, leavingRole } = this.assetTransition;
          if (beatIndex === leavingBeat && leavingT < 1) {
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
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.isMobile = w < 768;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.fx?.setSize(w, h);

    const isMobile = w < 768;
    for (const meshes of this.beatMeshes.values()) {
      for (const mesh of meshes) {
        const { item, entry } = mesh.userData.layout;
        const tex = mesh.material.map;
        const { width, height } = resolveSize(
          entry,
          tex.image.width,
          tex.image.height,
          isMobile,
          item.scale ?? 1
        );
        mesh.geometry.dispose();
        mesh.geometry = new THREE.PlaneGeometry(width, height);
        mesh.userData.layout.home = this.resolveHome(item, width, height);
      }
    }
    this.updateAllMeshes();
  }

  render() {
    if (!this.introPlayed && this.settledBeat === 0) {
      if (this.getIntroProgress() >= 1) {
        this.finishIntro();
      } else {
        this.updateAllMeshes();
      }
    } else if (this.assetTransition) {
      this.updateAllMeshes();
      if (this.getIncomingProgress() >= 1) {
        this.finishAssetTransition();
      }
    }

    this.applyParallax();
    this.fx?.setMotionIntensity(this.getMotionIntensity());
    this.fx?.render();
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerleave", this._onPointerLeave);
    this.fx?.dispose();
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
