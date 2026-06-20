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
  transitionDuration: 0.55,
  transitionMinDuration: 0.28,
  transitionKick: 0.22,
  stepCooldown: 380,
  swipeThreshold: 48,
};

/** Reserved for future CRT / warp transitions */
export const STORY_TRANSITION = {
  easePower: 1.35,
  mixEdgeLow: 0.08,
  mixEdgeHigh: 0.92,
};

export const HOVER = {
  slowSpeed: 0.2,
  normalSpeed: 1,
  tweenMs: 600,
  dwellMs: 100,
};

export const SAFE_ZONE = {
  width: 514,
  heightRatio: 0.4,
};

export const ASSET_FIELD = {
  spawnFadeDistance: 7,
  depthScale: {
    spawn: 0.1,
    front: 1.35,
  },
};
