import * as THREE from "three";
import { SIZE_CLASS_PRESETS, HOVER, SAFE_ZONE } from "../config.js";

const BLEND_MAP = {
  normal: () => ({ blending: THREE.NormalBlending, transparent: true }),
  screen: () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  lighten: () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  "color-dodge": () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  "plus-lighter": () => ({ blending: THREE.AdditiveBlending, transparent: true }),
  exclusion: () => ({ blending: THREE.NormalBlending, transparent: true }),
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function resolveSize(entry, texW, texH, isMobile) {
  const size = { ...(entry.size || {}) };
  if (entry.sizeClass && SIZE_CLASS_PRESETS[entry.sizeClass]) {
    Object.assign(size, SIZE_CLASS_PRESETS[entry.sizeClass]);
  }
  if (isMobile && entry.sizeMobile) {
    Object.assign(size, entry.sizeMobile);
  }

  const scale = size.scale ?? 1;
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

function overlapsSafeZone(x, y, halfW, halfH, camera, width, height) {
  const v = new THREE.Vector3(x, y, 0);
  v.project(camera);
  const sx = (v.x * 0.5 + 0.5) * width;
  const sy = (-v.y * 0.5 + 0.5) * height;
  const safeW = SAFE_ZONE.width;
  const safeH = height * SAFE_ZONE.heightRatio;
  const cx = width / 2;
  const cy = height / 2;
  const pad = 24;
  return (
    sx + halfW * width > cx - safeW / 2 - pad &&
    sx - halfW * width < cx + safeW / 2 + pad &&
    sy + halfH * height > cy - safeH / 2 - pad &&
    sy - halfH * height < cy + safeH / 2 + pad
  );
}

export class AssetField {
  constructor(container, manifest) {
    this.container = container;
    this.manifest = manifest;
    this.items = [];
    this.globalSpeed = 1;
    this.targetSpeed = 1;
    this.hoverDwell = 0;
    this.isHoveringAsset = false;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 14);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1d1c1a, 1);
    container.appendChild(this.renderer.domElement);

    this._onResize = () => this.resize();
    this._onPointerMove = (e) => this.onPointerMove(e);
    this._onPointerLeave = () => this.onPointerLeave();

    window.addEventListener("resize", this._onResize);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerleave", this._onPointerLeave);

    this.resize();
    this.load();
  }

  async load() {
    const loader = new THREE.TextureLoader();
    const isMobile = window.innerWidth < 768;
    const assets = (this.manifest.assets || []).filter((a) => a.enabled !== false);

    for (const entry of assets) {
      const tex = await loader.loadAsync(entry.src);
      tex.colorSpace = THREE.SRGBColorSpace;
      const { width, height } = resolveSize(entry, tex.image.width, tex.image.height, isMobile);
      const geo = new THREE.PlaneGeometry(width, height);
      const blend = BLEND_MAP[entry.blendMode]?.() ?? BLEND_MAP.normal();
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: blend.transparent,
        blending: blend.blending,
        opacity: entry.opacity ?? 1,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const world = anchorToWorld(entry.layout?.anchor, entry.layout?.lane);
      const motion = entry.motion || {};
      const zMin = motion.zRange?.[0] ?? -12;
      const zMax = motion.zRange?.[1] ?? 6;
      const zMid = zMin + Math.random() * (zMax - zMin);

      mesh.position.set(world.x, world.y, zMid);
      mesh.rotation.z = THREE.MathUtils.degToRad(entry.layout?.rotation ?? 0);
      mesh.userData.entry = entry;
      mesh.userData.motion = {
        path: motion.path ?? "drift",
        speed: motion.speed ?? 0.3,
        zRange: motion.zRange ?? [-12, 6],
        sway: motion.sway ?? { amp: 0.04, freq: 0.2 },
        rotSpeed: motion.rotSpeed ?? 0.05,
        baseX: world.x,
        baseY: world.y,
        z: zMid,
        phase: Math.random() * Math.PI * 2,
        lag: 0.08 + Math.random() * 0.06,
      };
      mesh.userData.display = { x: world.x, y: world.y, z: zMid, rot: mesh.rotation.z };

      this.nudgeFromSafeZone(mesh);
      this.scene.add(mesh);
      this.items.push(mesh);
    }
  }

  nudgeFromSafeZone(mesh) {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const halfW = mesh.geometry.parameters.width / 18;
    const halfH = mesh.geometry.parameters.height / 11;
    let guard = 0;
    while (
      overlapsSafeZone(mesh.position.x, mesh.position.y, halfW, halfH, this.camera, w, h) &&
      guard < 12
    ) {
      mesh.position.x += mesh.position.x > 0 ? 0.4 : -0.4;
      mesh.position.y += mesh.position.y > 0 ? 0.3 : -0.3;
      mesh.userData.motion.baseX = mesh.position.x;
      mesh.userData.motion.baseY = mesh.position.y;
      guard++;
    }
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
    this.isHoveringAsset = false;
    this.hoverDwell = 0;
    this.targetSpeed = this.reducedMotion ? 0.3 : HOVER.normalSpeed;
  }

  updateHover(dt) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.items.filter((m) => m.userData.entry?.hoverable !== false)
    );
    const hovering = hits.length > 0;

    if (hovering) {
      this.hoverDwell += dt * 1000;
      if (this.hoverDwell >= HOVER.dwellMs) {
        this.isHoveringAsset = true;
        this.targetSpeed = HOVER.slowSpeed;
      }
    } else {
      this.hoverDwell = 0;
      this.isHoveringAsset = false;
      this.targetSpeed = this.reducedMotion ? 0.3 : HOVER.normalSpeed;
    }

    const lerpFactor = 1 - Math.exp(-dt / (HOVER.tweenMs / 1000));
    this.globalSpeed = lerp(this.globalSpeed, this.targetSpeed, lerpFactor);
  }

  updateMotion(dt) {
    const t = this.clock.getElapsedTime();
    const speedMul = this.reducedMotion ? 0.35 : this.globalSpeed;

    for (const mesh of this.items) {
      const m = mesh.userData.motion;
      const d = mesh.userData.display;
      const [zMin, zMax] = m.zRange;
      const span = zMax - zMin;
      const rate = m.speed * speedMul * dt;

      m.z += rate * 2.2;
      if (m.z > zMax) {
        m.z = zMin;
        m.baseX += (Math.random() - 0.5) * 0.6;
        m.baseY += (Math.random() - 0.5) * 0.4;
        this.nudgeFromSafeZone(mesh);
        m.baseX = mesh.position.x;
        m.baseY = mesh.position.y;
      }

      const targetX = m.baseX + Math.sin(t * m.sway.freq + m.phase) * m.sway.amp * 8;
      const targetY = m.baseY + Math.cos(t * m.sway.freq * 0.85 + m.phase) * m.sway.amp * 6;
      const targetZ = m.z;
      const targetRot = mesh.rotation.z + m.rotSpeed * speedMul * dt * 0.15;

      const f = m.lag;
      d.x = lerp(d.x, targetX, f);
      d.y = lerp(d.y, targetY, f);
      d.z = lerp(d.z, targetZ, f);
      d.rot = lerp(d.rot, targetRot, f * 0.5);

      mesh.position.set(d.x, d.y, d.z);
      mesh.rotation.z = d.rot;
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
