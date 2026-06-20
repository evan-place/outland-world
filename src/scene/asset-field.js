import * as THREE from "three";
import { SIZE_CLASS_PRESETS, HOVER, SAFE_ZONE, ASSET_FIELD } from "../config.js";
import { assetUrl } from "../utils/asset-url.js";

/** Assets drift toward the camera (+Z) and respawn far behind only once off-screen. */
const Z_SPAWN = -26;
const Z_DESPAWN = 9;
const STREAM_DEPTH = Z_DESPAWN - Z_SPAWN;
const DEFAULT_INSTANCES_PER_ASSET = 2;

const BLEND_MAP = {
  normal: () => ({ blending: THREE.NormalBlending, transparent: true }),
  screen: () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  lighten: () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  "color-dodge": () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  "plus-lighter": () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  exclusion: () => ({ blending: THREE.NormalBlending, transparent: true }),
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

function spreadAlongPath(z, spawnZ, spreadEndZ) {
  const range = Math.max(0.5, spreadEndZ - spawnZ);
  return smoothstep((z - spawnZ) / range);
}

function resolveDepthScale(entry, manifest) {
  const depth = entry.size?.depthScale ?? entry.depthScale ?? {};
  const defaults = manifest.settings?.depthScale ?? ASSET_FIELD.depthScale;
  return {
    spawn: depth.spawn ?? defaults.spawn ?? 0.1,
    front: depth.front ?? defaults.front ?? 1.35,
  };
}

function depthScaleAlongPath(z, spawnZ, scaleSpawn, scaleFront) {
  const range = Math.max(1, Z_DESPAWN - spawnZ - 2);
  const t = Math.max(0, Math.min(1, (z - spawnZ) / range));
  const eased = t * t * (3 - 2 * t);
  return lerp(scaleSpawn, scaleFront, eased);
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

  return { x, y };
}

function overlapsSafeZone(x, y, halfW, halfH, camera, width, height) {
  const v = new THREE.Vector3(x, y, 0);
  v.project(camera);
  const sx = (v.x * 0.5 + 0.5) * width;
  const sy = (-v.y * 0.5 + 0.5) * height;
  const safeW = SAFE_ZONE.width;
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
    this.globalSpeed = 1;
    this.targetSpeed = 1;
    this.hoverDwell = 0;
    this.pointer = new THREE.Vector2(-9, -9);
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.loadErrors = [];

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
    this.camera.position.set(0, 0, 14);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1d1c1a, 1);
    this.renderer.sortObjects = true;
    container.appendChild(this.renderer.domElement);

    this._onResize = () => this.resize();
    this._onPointerMove = (e) => this.onPointerMove(e);
    this._onPointerLeave = () => this.onPointerLeave();

    window.addEventListener("resize", this._onResize);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerleave", this._onPointerLeave);

    this.resize();
    this.loadPromise = this.load();
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const isMobile = window.innerWidth < 768;
    const assets = (this.manifest.assets || []).filter((a) => a.enabled !== false);
    const defaultInstances =
      this.manifest.settings?.instancesPerAsset ?? DEFAULT_INSTANCES_PER_ASSET;

    await Promise.all(
      assets.map(async (entry) => {
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
      })
    );

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
    const stagger = (instanceIndex / Math.max(1, instanceCount)) * STREAM_DEPTH;
    const z = Z_SPAWN + stagger + Math.random() * 4;

    const home = this.resolveHomePosition(entry, lane, width, height);
    const origin = this.originJitter(instanceIndex, tunnel);
    const baseRot = THREE.MathUtils.degToRad(entry.layout?.rotation ?? 0);
    const depthScale = resolveDepthScale(entry, this.manifest);
    const spawnScale = depthScaleAlongPath(z, z, depthScale.spawn, depthScale.front);
    const start = this.positionAlongTunnel(
      {
        spawnZ: z,
        spreadEndZ: tunnel.spreadEndZ,
        originX: origin.x,
        originY: origin.y,
        homeX: home.x,
        homeY: home.y,
      },
      z
    );

    mesh.position.set(start.x, start.y, z);
    mesh.rotation.z = baseRot;
    mesh.scale.setScalar(spawnScale);
    mesh.renderOrder = 0;

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
      z,
      spawnZ: z,
      scaleSpawn: depthScale.spawn,
      scaleFront: depthScale.front,
      targetOpacity,
      phase: Math.random() * Math.PI * 2,
      lag: 0.06 + Math.random() * 0.05,
    };
    mesh.userData.display = { x: start.x, y: start.y, z, rot: baseRot };

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
    m.homeX = home.x;
    m.homeY = home.y;
    m.z = Z_SPAWN - Math.random() * 6;
    m.spawnZ = m.z;
    m.baseRot = m.baseRot + (Math.random() - 0.5) * 0.08;

    const start = this.positionAlongTunnel(m, m.z);
    d.x = start.x;
    d.y = start.y;
    d.z = m.z;
    d.rot = m.baseRot;

    mesh.position.set(d.x, d.y, d.z);
    mesh.rotation.z = d.rot;
    mesh.material.opacity = 0;
    mesh.scale.setScalar(m.scaleSpawn);
  }

  spawnFadeDistance() {
    return this.manifest.settings?.spawnFadeDistance ?? ASSET_FIELD.spawnFadeDistance;
  }

  tunnelSettings() {
    const settings = this.manifest.settings ?? {};
    return {
      vanishX: settings.vanishingPoint?.x ?? ASSET_FIELD.vanishingPoint.x,
      vanishY: settings.vanishingPoint?.y ?? ASSET_FIELD.vanishingPoint.y,
      vanishJitter: settings.vanishJitter ?? ASSET_FIELD.vanishJitter,
      spreadEndZ: settings.spreadEndZ ?? ASSET_FIELD.spreadEndZ,
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
    const spread = spreadAlongPath(z, m.spawnZ, m.spreadEndZ);
    const swayMul = lerp(0.12, 1, spread);
    return {
      spread,
      swayMul,
      x: lerp(m.originX, m.homeX, spread),
      y: lerp(m.originY, m.homeY, spread),
    };
  }

  onPointerMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      this.onPointerLeave();
      return;
    }
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onPointerLeave() {
    this.hoverDwell = 0;
    this.targetSpeed = this.reducedMotion ? 0.3 : HOVER.normalSpeed;
    this.pointer.set(-9, -9);
  }

  updateHover(dt) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hoverables = this.items.filter((m) => m.userData.entry?.hoverable !== false);
    const hits = this.raycaster.intersectObjects(hoverables);
    const hovering = hits.length > 0;

    if (hovering) {
      this.hoverDwell += dt * 1000;
      if (this.hoverDwell >= HOVER.dwellMs) {
        this.targetSpeed = HOVER.slowSpeed;
      }
    } else {
      this.hoverDwell = 0;
      this.targetSpeed = this.reducedMotion ? 0.3 : HOVER.normalSpeed;
    }

    const lerpFactor = 1 - Math.exp(-dt / (HOVER.tweenMs / 1000));
    this.globalSpeed = lerp(this.globalSpeed, this.targetSpeed, lerpFactor);
  }

  updateMotion(dt) {
    const t = this.clock.getElapsedTime();
    const speedMul = this.reducedMotion ? 0.35 : this.globalSpeed;
    const fadeDistance = this.spawnFadeDistance();

    for (const mesh of this.items) {
      const m = mesh.userData.motion;
      const d = mesh.userData.display;
      const rate = m.speed * speedMul * dt;

      m.z += rate * 2.4;

      if (m.z > Z_DESPAWN) {
        this.respawnStream(mesh);
        continue;
      }

      const tunnelPos = this.positionAlongTunnel(m, m.z);
      const targetX =
        tunnelPos.x + Math.sin(t * m.sway.freq + m.phase) * m.sway.amp * 6 * tunnelPos.swayMul;
      const targetY =
        tunnelPos.y + Math.cos(t * m.sway.freq * 0.85 + m.phase) * m.sway.amp * 4.5 * tunnelPos.swayMul;
      const targetZ = m.z;
      const targetRot = m.baseRot + Math.sin(t * 0.15 + m.phase) * 0.04;

      const f = m.lag;
      d.x = lerp(d.x, targetX, f);
      d.y = lerp(d.y, targetY, f);
      d.z = lerp(d.z, targetZ, f * 1.2);
      d.rot = lerp(d.rot, targetRot, f * 0.6);

      mesh.position.set(d.x, d.y, d.z);
      mesh.rotation.z = d.rot;
      mesh.renderOrder = -d.z;
      mesh.scale.setScalar(depthScaleAlongPath(m.z, m.spawnZ, m.scaleSpawn, m.scaleFront));

      const traveled = Math.max(0, m.z - m.spawnZ);
      mesh.material.opacity = fadeOpacity(traveled, fadeDistance, m.targetOpacity);
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
    this.updateHover(dt);
    this.updateMotion(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerleave", this._onPointerLeave);
    for (const mesh of this.items) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
    this.renderer.dispose();
  }
}
