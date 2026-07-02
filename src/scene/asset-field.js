import * as THREE from "three";
import {
  SIZE_CLASS_PRESETS,
  SAFE_ZONE,
  ASSET_FIELD,
  ASSET_FIELD_INTRO,
} from "../config.js";
import { assetUrl } from "../utils/asset-url.js";

const DEFAULT_INSTANCES_PER_ASSET = 2;

const BLEND_MAP = {
  normal: () => ({ blending: THREE.NormalBlending, transparent: true }),
  screen: () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  lighten: () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  "color-dodge": () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  "plus-lighter": () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  exclusion: () => ({ blending: THREE.NormalBlending, transparent: true }),
  multiply: () => ({ blending: THREE.MultiplyBlending, transparent: true }),
};

const LANE_BOUNDS = {
  "top-left": { x: [-10, -4], y: [1.5, 5] },
  "top-right": { x: [4, 10], y: [1.5, 5] },
  "bottom-left": { x: [-10, -4], y: [-5, -1.5] },
  "bottom-right": { x: [4, 10], y: [-5, -1.5] },
  left: { x: [-11, -6], y: [-3, 3] },
  right: { x: [6, 11], y: [-3, 3] },
  top: { x: [-4, 4], y: [3.5, 6] },
  bottom: { x: [-4, 4], y: [-6, -3.5] },
  free: { x: [-11, 11], y: [-6, 6] },
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randIn([min, max]) {
  return min + Math.random() * (max - min);
}

function hash01(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function fadeOpacity(traveled, distance, target) {
  const t = Math.max(0, Math.min(1, traveled / distance));
  const eased = t * t * (3 - 2 * t);
  return target * eased;
}

function smoothstep(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutPower(t, power) {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, power);
}

function spreadAlongPath(z, spawnZ, spreadEndZ, power = 1) {
  const range = Math.max(0.5, spreadEndZ - spawnZ);
  const t = smoothstep((z - spawnZ) / range);
  return power <= 1 ? t : Math.pow(t, power);
}

function resolveDepthScale(entry, manifest) {
  const depth = entry.size?.depthScale ?? entry.depthScale ?? {};
  const defaults = manifest.settings?.depthScale ?? ASSET_FIELD.depthScale;
  return {
    spawn: depth.spawn ?? defaults.spawn ?? 0.1,
    front: depth.front ?? defaults.front ?? 1.35,
  };
}

function depthScaleAlongPath(z, spawnZ, scaleSpawn, scaleFront, zBounds) {
  const despawn = zBounds?.despawn ?? ASSET_FIELD.zDespawn;
  const range = Math.max(1, despawn - spawnZ - 2);
  const t = Math.max(0, Math.min(1, (z - spawnZ) / range));
  const eased = t * t * (3 - 2 * t);
  return lerp(scaleSpawn, scaleFront, eased);
}

function resolveFloatRotation(motion, instanceIndex) {
  const rotBase = motion.rotSpeed ?? 0.04;
  const sign = (seed) => (hash01(seed) > 0.5 ? 1 : -1);
  const vary = (seed, lo = 0.65, hi = 1.35) => lerp(lo, hi, hash01(seed));

  return {
    rotVelX: sign(instanceIndex * 3.31) * rotBase * 0.32 * vary(instanceIndex * 4.17),
    rotVelY: sign(instanceIndex * 5.73) * rotBase * 0.26 * vary(instanceIndex * 6.29),
    rotVelZ: sign(instanceIndex * 1.13) * rotBase * vary(instanceIndex * 2.71),
    wobbleAmp: 0.018 + hash01(instanceIndex * 8.37) * 0.022,
    wobbleFreq: 0.07 + hash01(instanceIndex * 9.19) * 0.09,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
  };
}

function applyFloatRotation(mesh, m, t, speedMul, dt) {
  m.rotX += m.rotVelX * speedMul * dt;
  m.rotY += m.rotVelY * speedMul * dt;
  m.rotZ += m.rotVelZ * speedMul * dt;

  const wobbleX = Math.sin(t * m.wobbleFreq * 0.83 + m.phase) * m.wobbleAmp;
  const wobbleY = Math.cos(t * m.wobbleFreq * 1.07 + m.phase) * m.wobbleAmp;
  const wobbleZ = Math.sin(t * m.wobbleFreq + m.phase) * m.wobbleAmp * 0.55;

  mesh.rotation.x = m.rotX + wobbleX;
  mesh.rotation.y = m.rotY + wobbleY;
  mesh.rotation.z = m.rotZ + wobbleZ;
}

function resolveSize(entry, texW, texH, isMobile, instanceIndex = 0) {
  const size = { ...(entry.size || {}) };
  if (entry.sizeClass && SIZE_CLASS_PRESETS[entry.sizeClass]) {
    Object.assign(size, SIZE_CLASS_PRESETS[entry.sizeClass]);
  }
  if (isMobile && entry.sizeMobile) {
    Object.assign(size, entry.sizeMobile);
  }

  let scale = size.scale ?? 1;
  const jitter = size.scaleJitter ?? entry.scaleJitter ?? 0;

  if (size.scaleMin != null && size.scaleMax != null) {
    scale = lerp(size.scaleMin, size.scaleMax, hash01(instanceIndex + 1.7));
  } else if (jitter > 0) {
    scale *= 1 + (hash01(instanceIndex + 2.3) * 2 - 1) * jitter;
  }

  let w = size.width ?? null;
  let h = size.height ?? null;
  const aspect = texW / texH;

  if (w == null && h == null) {
    w = size.maxWidth ?? 360;
    h = w / aspect;
  } else if (w == null) {
    w = h * aspect;
  } else if (h == null) {
    h = w / aspect;
  }

  if (size.maxWidth && w > size.maxWidth) {
    w = size.maxWidth;
    h = w / aspect;
  }
  if (size.maxHeight && h > size.maxHeight) {
    h = size.maxHeight;
    w = h * aspect;
  }

  const pxToWorld = 0.0045;
  return { width: w * scale * pxToWorld, height: h * scale * pxToWorld };
}

function anchorToWorld(anchor, lane) {
  let x = (anchor?.x ?? 0.5) * 2 - 1;
  let y = -((anchor?.y ?? 0.5) * 2 - 1);

  const laneNudge = {
    "top-left": { x: -0.15, y: 0.2 },
    "top-right": { x: 0.15, y: 0.2 },
    "bottom-left": { x: -0.15, y: -0.2 },
    "bottom-right": { x: 0.15, y: -0.2 },
    left: { x: -0.25, y: 0 },
    right: { x: 0.25, y: 0 },
    top: { x: 0, y: 0.25 },
    bottom: { x: 0, y: -0.25 },
  };

  const n = laneNudge[lane];
  if (n) {
    x += n.x;
    y += n.y;
  }

  return { x: x * 9, y: y * 5.5 };
}

function pickHomeXY(lane, anchor) {
  const bounds = LANE_BOUNDS[lane] ?? LANE_BOUNDS.free;
  let x = randIn(bounds.x);
  let y = randIn(bounds.y);

  if (anchor) {
    const hint = anchorToWorld(anchor, lane);
    x = lerp(x, hint.x, 0.35);
    y = lerp(y, hint.y, 0.35);
  }

  const inward = ASSET_FIELD.homeInward ?? 0.9;
  return { x: x * inward, y: y * inward };
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

export class AssetField {
  constructor(container, manifest) {
    this.container = container;
    this.manifest = manifest;
    this.items = [];
    this.clock = new THREE.Clock();
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.loadErrors = [];
    this.introElapsed = 0;
    this.introComplete = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
    const intro = this.introSettings();
    this.camera.position.set(0, 0, intro.enabled && !this.reducedMotion ? intro.cameraZStart : intro.cameraZEnd);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1d1c1a, 1);
    this.renderer.sortObjects = true;
    container.appendChild(this.renderer.domElement);

    this._onResize = () => this.resize();

    window.addEventListener("resize", this._onResize);

    this.resize();
    this.loadPromise = this.load();
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const isMobile = window.innerWidth < 768;
    const assets = (this.manifest.assets || []).filter((a) => a.enabled !== false);
    const defaultInstances =
      this.manifest.settings?.instancesPerAsset ?? DEFAULT_INSTANCES_PER_ASSET;
    const priorityCount = Math.min(
      this.priorityLoadCount(),
      assets.length
    );

    const loadOne = async (entry) => {
      try {
        const tex = await loader.loadAsync(assetUrl(entry.src));
        tex.colorSpace = THREE.SRGBColorSpace;

        const instanceCount = entry.instances ?? defaultInstances;
        for (let i = 0; i < instanceCount; i++) {
          this.spawnInstance(entry, tex, isMobile, i, instanceCount);
        }
      } catch (err) {
        console.error(`[AssetField] Failed to load: ${entry.id} (${entry.src})`, err);
        this.loadErrors.push(entry.id);
      }
    };

    const priority = assets.slice(0, priorityCount);
    const rest = assets.slice(priorityCount);

    await Promise.all(priority.map(loadOne));
    await Promise.all(rest.map(loadOne));

    if (this.loadErrors.length) {
      console.warn("[AssetField] Missing assets:", this.loadErrors.join(", "));
    }
  }

  spawnInstance(entry, tex, isMobile, instanceIndex, instanceCount) {
    const { width, height } = resolveSize(
      entry,
      tex.image.width,
      tex.image.height,
      isMobile,
      instanceIndex
    );
    const geo = new THREE.PlaneGeometry(width, height);
    const blend = BLEND_MAP[entry.blendMode]?.() ?? BLEND_MAP.normal();
    const useNormalBlend = entry.blendMode === "exclusion" || entry.blendMode === "normal";
    const targetOpacity = entry.opacity ?? (useNormalBlend ? 1 : 0.92);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: blend.blending,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    const motion = entry.motion || {};
    const lane = entry.layout?.lane ?? "free";
    const tunnel = this.tunnelSettings();
    const zBounds = this.zBounds();
    const streamDepth = zBounds.despawn - zBounds.spawn;
    const stagger = (instanceIndex / Math.max(1, instanceCount)) * streamDepth;
    const spawnZ = zBounds.spawn + stagger + Math.random() * 3;
    const depthAdvance =
      hash01(instanceIndex * 7.31 + 2.17) *
      this.initialDepthSpread() *
      this.spawnFadeDistance();
    const z = this.resolveSeparatedZ(entry.id, spawnZ + depthAdvance);

    const home = this.resolveHomePosition(entry, lane, width, height);
    const origin = this.originJitter(instanceIndex, tunnel);
    const baseRot = THREE.MathUtils.degToRad(entry.layout?.rotation ?? 0);
    const depthScale = resolveDepthScale(entry, this.manifest);
    const spawnScale = depthScaleAlongPath(z, spawnZ, depthScale.spawn, depthScale.front, zBounds);
    const start = this.positionAlongTunnel(
      {
        spawnZ,
        spreadEndZ: tunnel.spreadEndZ,
        originX: origin.x,
        originY: origin.y,
        homeX: home.x,
        homeY: home.y,
      },
      z
    );

    mesh.position.set(start.x, start.y, z);
    const floatRot = resolveFloatRotation(motion, instanceIndex);
    mesh.rotation.z = baseRot;
    mesh.scale.setScalar(spawnScale);
    mesh.renderOrder = 0;

    const traveled = Math.max(0, z - spawnZ);
    mat.opacity = fadeOpacity(traveled, this.spawnFadeDistance(), targetOpacity);

    mesh.userData.entry = entry;
    mesh.userData.motion = {
      speed: motion.speed ?? 0.28,
      sway: motion.sway ?? { amp: 0.04, freq: 0.2 },
      rotSpeed: motion.rotSpeed ?? 0.04,
      lane,
      anchor: entry.layout?.anchor,
      baseRot,
      originX: origin.x,
      originY: origin.y,
      homeX: home.x,
      homeY: home.y,
      spreadEndZ: tunnel.spreadEndZ,
      spreadPower: tunnel.spreadPower,
      z,
      spawnZ,
      scaleSpawn: depthScale.spawn,
      scaleFront: depthScale.front,
      targetOpacity,
      phase: Math.random() * Math.PI * 2,
      lag: 0.06 + Math.random() * 0.05,
      ...floatRot,
      rotZ: baseRot,
    };
    mesh.userData.display = { x: start.x, y: start.y, z };

    this.scene.add(mesh);
    this.items.push(mesh);
  }

  respawnStream(mesh) {
    const m = mesh.userData.motion;
    const d = mesh.userData.display;
    const entry = mesh.userData.entry;
    const width = mesh.geometry.parameters.width;
    const height = mesh.geometry.parameters.height;

    const home = this.resolveHomePosition(entry, m.lane, width, height);
    const zBounds = this.zBounds();
    m.homeX = home.x;
    m.homeY = home.y;
    m.z = this.pickRespawnZ(entry.id, mesh);
    m.spawnZ = m.z;
    m.baseRot = m.baseRot + (Math.random() - 0.5) * 0.08;
    m.phase = Math.random() * Math.PI * 2;
    Object.assign(m, resolveFloatRotation({ rotSpeed: m.rotSpeed }, Math.random() * 1000));
    m.rotZ = m.baseRot;
    m.rotX = 0;
    m.rotY = 0;

    const start = this.positionAlongTunnel(m, m.z);
    d.x = start.x;
    d.y = start.y;
    d.z = m.z;

    mesh.rotation.set(0, 0, m.baseRot);

    mesh.position.set(d.x, d.y, d.z);
    mesh.material.opacity = 0;
    mesh.scale.setScalar(m.scaleSpawn);
  }

  spawnFadeDistance() {
    return this.manifest.settings?.spawnFadeDistance ?? ASSET_FIELD.spawnFadeDistance;
  }

  initialDepthSpread() {
    return this.manifest.settings?.initialDepthSpread ?? ASSET_FIELD.initialDepthSpread;
  }

  priorityLoadCount() {
    return this.manifest.settings?.priorityLoadCount ?? ASSET_FIELD.priorityLoadCount;
  }

  zBounds() {
    const settings = this.manifest.settings ?? {};
    return {
      spawn: settings.zSpawn ?? ASSET_FIELD.zSpawn,
      despawn: settings.zDespawn ?? ASSET_FIELD.zDespawn,
    };
  }

  separationGroups() {
    return this.manifest.settings?.separationGroups ?? [];
  }

  separationGroupFor(assetId) {
    for (const group of this.separationGroups()) {
      if (group.ids?.includes(assetId)) return group;
    }
    return null;
  }

  otherZsInSeparationGroup(assetId, excludeMesh = null) {
    const group = this.separationGroupFor(assetId);
    if (!group) return [];

    const otherIds = new Set(group.ids.filter((id) => id !== assetId));
    return this.items
      .filter((mesh) => mesh !== excludeMesh && otherIds.has(mesh.userData.entry.id))
      .map((mesh) => mesh.userData.motion.z);
  }

  resolveSeparatedZ(assetId, z, excludeMesh = null) {
    const group = this.separationGroupFor(assetId);
    if (!group) return z;

    const minSep = group.minZ ?? 10;
    const zBounds = this.zBounds();
    const otherZs = this.otherZsInSeparationGroup(assetId, excludeMesh);
    if (!otherZs.length) return z;

    for (let attempt = 0; attempt < 24; attempt++) {
      const tooClose = otherZs.some((otherZ) => Math.abs(z - otherZ) < minSep);
      if (!tooClose) return z;

      const nearest = otherZs.reduce(
        (closest, otherZ) => (Math.abs(z - otherZ) < Math.abs(z - closest) ? otherZ : closest),
        otherZs[0]
      );
      const dir = z <= nearest ? -1 : 1;
      z = nearest + dir * minSep;

      if (z > zBounds.despawn - 3) z = nearest - minSep;
      if (z < zBounds.spawn - 5) z = nearest + minSep;
    }

    return z;
  }

  pickRespawnZ(assetId, excludeMesh = null) {
    const zBounds = this.zBounds();
    const z = zBounds.spawn - Math.random() * 4;
    return this.resolveSeparatedZ(assetId, z, excludeMesh);
  }

  tunnelSettings() {
    const settings = this.manifest.settings ?? {};
    return {
      vanishX: settings.vanishingPoint?.x ?? ASSET_FIELD.vanishingPoint.x,
      vanishY: settings.vanishingPoint?.y ?? ASSET_FIELD.vanishingPoint.y,
      vanishJitter: settings.vanishJitter ?? ASSET_FIELD.vanishJitter,
      spreadEndZ: settings.spreadEndZ ?? ASSET_FIELD.spreadEndZ,
      spreadPower: settings.spreadPower ?? ASSET_FIELD.spreadPower,
    };
  }

  introSettings() {
    const manifest = this.manifest.settings?.intro ?? {};
    const defaults = ASSET_FIELD_INTRO;
    return {
      enabled: manifest.enabled ?? defaults.enabled,
      durationMs: manifest.durationMs ?? defaults.durationMs,
      reducedDurationMs: manifest.reducedDurationMs ?? defaults.reducedDurationMs,
      depthSpeedStart: manifest.depthSpeedStart ?? defaults.depthSpeedStart,
      reducedDepthSpeedStart:
        manifest.reducedDepthSpeedStart ?? defaults.reducedDepthSpeedStart,
      easePower: manifest.easePower ?? defaults.easePower,
      cameraZStart: manifest.cameraZStart ?? defaults.cameraZStart,
      cameraZEnd: manifest.cameraZEnd ?? defaults.cameraZEnd,
      spreadCompression: manifest.spreadCompression ?? defaults.spreadCompression,
      scaleBoostStart: manifest.scaleBoostStart ?? defaults.scaleBoostStart,
      opacityBoostStart: manifest.opacityBoostStart ?? defaults.opacityBoostStart,
    };
  }

  /** 0→1 progress through first-load warp exit; null when intro disabled or finished. */
  introProgress() {
    if (this.introComplete) return null;
    const intro = this.introSettings();
    if (!intro.enabled) {
      this.introComplete = true;
      return null;
    }

    const duration = this.reducedMotion ? intro.reducedDurationMs : intro.durationMs;
    if (duration <= 0) {
      this.introComplete = true;
      return null;
    }

    const t = Math.min(1, this.introElapsed / (duration / 1000));
    if (t >= 1) {
      this.introComplete = true;
      this.camera.position.z = intro.cameraZEnd;
      return null;
    }

    return easeOutPower(t, intro.easePower);
  }

  updateIntro(dt) {
    if (this.introComplete) return;
    const intro = this.introSettings();
    if (!intro.enabled) {
      this.introComplete = true;
      return;
    }
    this.introElapsed += dt;
    const eased = this.introProgress();
    if (eased == null) return;

    const introCfg = this.introSettings();
    this.camera.position.z = lerp(introCfg.cameraZStart, introCfg.cameraZEnd, eased);
  }

  introMotionFactors() {
    const eased = this.introProgress();
    if (eased == null) {
      return { depthMul: 1, spreadMul: 1, scaleMul: 1, opacityMul: 1 };
    }

    const intro = this.introSettings();
    const depthStart = this.reducedMotion ? intro.reducedDepthSpeedStart : intro.depthSpeedStart;
    const rush = 1 - eased;

    return {
      depthMul: lerp(1, depthStart, rush),
      spreadMul: lerp(1, intro.spreadCompression, rush),
      scaleMul: lerp(1, intro.scaleBoostStart, rush),
      opacityMul: lerp(1, intro.opacityBoostStart, rush),
    };
  }

  resolveHomePosition(entry, lane, width, height) {
    let { x, y } = pickHomeXY(lane, entry.layout?.anchor);
    const halfW = width / 18;
    const halfH = height / 11;
    const nudged = nudgeFromSafeZone(
      x,
      y,
      halfW,
      halfH,
      this.camera,
      this.container.clientWidth,
      this.container.clientHeight
    );
    return nudged;
  }

  originJitter(instanceIndex, tunnel) {
    const jitter = tunnel.vanishJitter;
    return {
      x: tunnel.vanishX + (hash01(instanceIndex * 3.17) - 0.5) * jitter,
      y: tunnel.vanishY + (hash01(instanceIndex * 5.91) - 0.5) * jitter * 0.75,
    };
  }

  positionAlongTunnel(m, z) {
    return this.positionAlongTunnelWithSpread(m, z, 1);
  }

  positionAlongTunnelWithSpread(m, z, spreadMul = 1) {
    const spread =
      spreadAlongPath(z, m.spawnZ, m.spreadEndZ, m.spreadPower ?? 1) * spreadMul;
    const swayMul = lerp(0.12, 0.88, spread);
    return {
      spread,
      swayMul,
      x: lerp(m.originX, m.homeX, spread),
      y: lerp(m.originY, m.homeY, spread),
    };
  }

  updateMotion(dt) {
    const t = this.clock.getElapsedTime();
    const speedMul = this.reducedMotion ? 0.35 : 1;
    const fadeDistance = this.spawnFadeDistance();
    const zBounds = this.zBounds();
    const intro = this.introMotionFactors();
    const streamRange = Math.max(1, zBounds.despawn - zBounds.spawn - 2);

    for (const mesh of this.items) {
      const m = mesh.userData.motion;
      const d = mesh.userData.display;
      const streamT = Math.max(0, Math.min(1, (m.z - m.spawnZ) / streamRange));
      const frontBoost = 1 + streamT * 0.32;
      const rate = m.speed * speedMul * intro.depthMul * frontBoost * dt;

      m.z += rate * 2.4;

      if (m.z > zBounds.despawn) {
        this.respawnStream(mesh);
        continue;
      }

      const tunnelPos = this.positionAlongTunnelWithSpread(m, m.z, intro.spreadMul);
      const targetX =
        tunnelPos.x + Math.sin(t * m.sway.freq + m.phase) * m.sway.amp * 6 * tunnelPos.swayMul;
      const targetY =
        tunnelPos.y + Math.cos(t * m.sway.freq * 0.85 + m.phase) * m.sway.amp * 4.5 * tunnelPos.swayMul;
      const targetZ = m.z;

      const f = m.lag;
      d.x = lerp(d.x, targetX, f);
      d.y = lerp(d.y, targetY, f);
      d.z = targetZ;

      mesh.position.set(d.x, d.y, d.z);
      applyFloatRotation(mesh, m, t, speedMul, dt);
      mesh.renderOrder = -d.z;
      const depthScale =
        depthScaleAlongPath(m.z, m.spawnZ, m.scaleSpawn, m.scaleFront, zBounds) *
        intro.scaleMul *
        lerp(1, 1.14, streamT);
      mesh.scale.setScalar(depthScale);

      const traveled = Math.max(0, m.z - m.spawnZ);
      const baseOpacity = fadeOpacity(traveled, fadeDistance, m.targetOpacity);
      const frontOpacity = lerp(1, 1.08, streamT);
      mesh.material.opacity = Math.min(1, baseOpacity * intro.opacityMul * frontOpacity);
    }
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.updateIntro(dt);
    this.updateMotion(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    for (const mesh of this.items) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
    this.renderer.dispose();
  }
}
