export const SIZE_CLASS_PRESETS = {
  xs: { maxWidth: 120, maxHeight: 120 },
  sm: { maxWidth: 220, maxHeight: 220 },
  md: { maxWidth: 360, maxHeight: 360 },
  lg: { maxWidth: 480, maxHeight: 520 },
  xl: { maxWidth: 640, maxHeight: 680 },
};

export const STYLE_PRESETS = {
  "serif-xl": { fontSize: 44, lineHeight: 1.25, letterSpacing: "-0.04em" },
  "serif-lg": { fontSize: 40, lineHeight: 1.3, letterSpacing: "-0.04em" },
  "serif-md": { fontSize: 32, lineHeight: 1.35, letterSpacing: "-0.03em" },
};

export const SCROLL = {
  /** Scroll kick — full transition wall time comes from STORY_TRANSITION.beatDurationMs. */
  transitionKick: 0.2,
  wheelThreshold: 14,
  reverseWheelThreshold: 8,
  /** Single wheel tick above this fires immediately (trackpad flicks). */
  wheelInstantDelta: 42,
  /** Lower bar when reversing mid-transition so back-scroll registers immediately. */
  interruptWheelThreshold: 4,
  wheelAccumDecayMs: 110,
  momentumGuardMs: 90,
  reverseMomentumGuardMs: 0,
  swipeThreshold: 36,
};

/** Auto-advance story beats with continuous progress-bar playback. */
export const AUTO_PLAY = {
  enabled: true,
  /** Dwell on beat 0 before first auto-advance (covers text intro). */
  introDwellMs: 3200,
  beatDwellMs: 3400,
  beatDwellLastMs: 4200,
  /** Matches STORY_TRANSITION.beatDurationMs for auto-advance progress bar. */
  transitionMs: 1600,
  reducedIntroDwellMs: 1400,
  reducedBeatDwellMs: 2000,
  reducedBeatDwellLastMs: 2800,
  reducedTransitionMs: 280,
};

/** Lens viewport text transition — vertical travel + rim distortion. */
export const STORY_TRANSITION = {
  /** Base padding; auto-expanded so text clears below/above the viewport. */
  travelPadRatio: 1.2,
  travelMargin: 0.08,
  /** Higher = text lingers in warp bands longer (assets unaffected). */
  travelEasePower: 2.75,
  /** Shared wall-clock for intro + beat-to-beat text lens travel (all directions). */
  beatDurationMs: 1600,
  mixEdgeLow: 0.32,
  mixEdgeHigh: 0.72,
  lensCenterX: 0.5,
  lensCenterY: 0.5,
  /** Match half-viewport so screen top/bottom sit on the lens rim. */
  lensRadiusX: 0.54,
  lensRadiusY: 0.5,
  lensStrength: 1.6,
  /** Undistorted band height as a fraction of the viewport. */
  safeZoneViewportRatio: 0.56,
  /** Warp ramps from safe edge to lens rim; power <1 spreads distortion across the band. */
  warpBandPower: 1.12,
  safeInnerX: 0.68,
  safeOuterX: 0.98,
  motionSmear: 0.9,
  smearLength: 0.15,
};

export function storyTravelEase(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, STORY_TRANSITION.travelEasePower);
}

export function storyTravelEaseInv(eased) {
  const y = Math.max(0, Math.min(1, eased));
  return 1 - Math.pow(1 - y, 1 / STORY_TRANSITION.travelEasePower);
}

export const SAFE_ZONE = {
  width: 600,
  mobileWidth: 274,
  heightRatio: 0.4,
};

/** Beat-scene asset transitions (warp deceleration in / accelerate out). */
export const BEAT_ASSETS = {
  cameraZ: 14,
  enterZOffset: -30,
  /** 0 = spawn at vanishing point; 1 = spawn at full home XY. */
  enterLateralSpread: 0.38,
  exitZPush: 4.5,
  exitEdgeDistance: 10.5,
  /** NDC padding when pushing exits past the viewport edge. */
  exitViewportPad: 0.28,
  exitScale: 0.38,
  depthScaleFar: 0.04,
  depthScaleNear: 1,
  /** Exponential warp-exit decel — higher = faster burst, sharper slowdown at end. */
  incomingWarpRate: 16,
  /** >1 compresses time early for a harder snap, longer settle tail. */
  incomingTimePower: 2.15,
  /** First-load intro — slower than beat transitions. */
  introDurationMs: 3000,
  /** Beat-to-beat incoming warp (wall clock, continues after text settles). */
  incomingDurationMs: 3900,
  /** Outgoing / retreat duration (wall clock, same transition clock). */
  /** Outgoing uses the same wall clock as incoming (see getLeavingProgress). */
  exitDurationMs: 3900,
  exitEasePower: 1.55,
  exitOpacityFadeStart: 0.62,
  exitFadePower: 2.4,
  scrollEasePower: 2.4,
  transitionKick: 0.2,
  /** Cursor parallax on settled / transitioning assets (closer Z moves more). */
  parallax: {
    enabled: true,
    maxX: 0.42,
    maxY: 0.28,
    zMin: -2,
    zMax: 1.5,
    strengthFar: 0.32,
    strengthNear: 1,
    smooth: 0.11,
    mobileScale: 0.6,
  },
};

/** Post-FX on the asset scene — motion-reactive trail blur. */
export const ASSET_FX = {
  motionTrail: {
    /** Lower = trails fade quickly when assets are still. */
    dampRest: 0.55,
    /** Higher = stronger streaking while assets are in motion. */
    dampPeak: 0.84,
  },
};

export const ASSET_FIELD = {
  /** Z distance over which opacity ramps from 0 → target (lower = visible sooner). */
  spawnFadeDistance: 3.5,
  /** World-space spawn / despawn Z for the asset stream. */
  zSpawn: -16,
  zDespawn: 10.5,
  /** Pre-advance new instances 0–1 along fade distance so some appear mid-stream on load. */
  initialDepthSpread: 0.6,
  /** How many manifest entries to load before the rest (first textures on screen fastest). */
  priorityLoadCount: 3,
  depthScale: {
    spawn: 0.18,
    front: 1.58,
  },
  homeInward: 0.9,
  vanishingPoint: { x: 0, y: 0 },
  vanishJitter: 0.45,
  /** Z at which lateral spread reaches full home position (higher = stay centered longer). */
  spreadEndZ: 1.8,
  /** >1 delays outward drift — assets travel toward camera before fanning out. */
  spreadPower: 1.28,
};

/** First-load only — rush from depth then settle into ambient drift (warp exit). */
export const ASSET_FIELD_INTRO = {
  enabled: true,
  /** Full deceleration arc (ms). */
  durationMs: 1600,
  /** prefers-reduced-motion: greatly shortened rush. */
  reducedDurationMs: 280,
  /** Depth Z multiplier at t=0 → eases to 1. Higher = faster initial rush. */
  depthSpeedStart: 4.6,
  /** Ease-out power for deceleration curve (higher = longer high-speed tail). */
  easePower: 2.65,
  /** Reduced-motion depth multiplier peak (near 1 = minimal rush). */
  reducedDepthSpeedStart: 1.2,
  /** Camera dolly: start further back, ease to resting Z. */
  cameraZStart: 20.5,
  cameraZEnd: 14,
  /** At rush peak, compress tunnel spread toward vanishing point (0–1). */
  spreadCompression: 0.32,
  /** Brief scale / opacity lift during rush, eases to 1. */
  scaleBoostStart: 1.1,
  opacityBoostStart: 1.12,
};

/** First-beat intro text — only on initial page load, not when revisiting beat 0. */
export const STORY_INTRO = {
  baseDelayMs: 200,
  durationMs: 1500,
  wordStaggerMs: 85,
  driftY: 12,
  scaleFrom: 0.968,
};

/** Contact modal — FormSubmit delivers to inbox (confirm address on first submission). */
export const CONTACT = {
  toEmail: "team@enteroutland.com",
  submitUrl: "https://formsubmit.co/ajax/team@enteroutland.com",
  subject: "New inquiry from Outland",
};

/** Production site — URL follows build base path (see docs/DEPLOY.md). */
const pagesBase = import.meta.env.BASE_URL;
export const SITE = {
  url:
    pagesBase === "/"
      ? "https://enteroutland.com"
      : `https://evan-place.github.io${pagesBase.replace(/\/$/, "")}`,
  domain: "enteroutland.com",
};
