const HAS_SELECTION = "select-fx--has-selection";

function getTargets() {
  return [...document.querySelectorAll("[data-select-fx]")].filter(
    (el) => el instanceof HTMLElement,
  );
}

function rangeHitsRoot(range, root) {
  try {
    return range.intersectsNode(root);
  } catch {
    return false;
  }
}

let initialized = false;

export function initSelectionFx() {
  if (initialized) return;
  initialized = true;

  let queued = false;
  let prev = new Set();

  const syncSelection = () => {
    if (queued) return;
    queued = true;

    requestAnimationFrame(() => {
      queued = false;

      const selection = window.getSelection();
      const next = new Set();

      if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        for (const root of getTargets()) {
          if (root.isConnected && rangeHitsRoot(range, root)) next.add(root);
        }
      }

      for (const root of prev) {
        if (!next.has(root)) root.classList.remove(HAS_SELECTION);
      }
      for (const root of next) {
        if (!prev.has(root)) root.classList.add(HAS_SELECTION);
      }

      prev = next;
    });
  };

  document.addEventListener("selectionchange", syncSelection);
}

/** Kept for callers that rewrite selectable markup. */
export function refreshSelectionFx() {
  /* no-op — effect is CSS-only on [data-select-fx] */
}
