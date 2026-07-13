/** Shared canvas/CSS face for story body copy (matches Figma Ivory LL). */
export const STORY_SERIF_FAMILY = '"Ivory LL"';

/**
 * Ensure Ivory Regular + Italic are available before canvas rasterizes story text.
 * Without this, canvas often paints a synthetic oblique / Georgia italic fallback.
 */
export async function ensureStoryFonts(sizePx = 40) {
  if (!document.fonts?.load) return;

  const size = `${Math.round(sizePx)}px`;
  try {
    await Promise.all([
      document.fonts.load(`400 ${size} ${STORY_SERIF_FAMILY}`),
      document.fonts.load(`italic 400 ${size} ${STORY_SERIF_FAMILY}`),
    ]);
  } catch {
    // Fall through to fonts.ready — missing faces still fail soft.
  }

  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
}

export function storyCanvasFont(fontSizePx, italic = false) {
  const size = `${fontSizePx}px`;
  return italic
    ? `italic 400 ${size} ${STORY_SERIF_FAMILY}`
    : `400 ${size} ${STORY_SERIF_FAMILY}`;
}
