const SESSION_FLAG = "outland-asset-tuner-open";

/**
 * Hidden launch gate for the asset layout tuner.
 * Works in local DEV and on Vercel previews — remove before public launch.
 *
 * Open / close:
 * - Right-click the Outland logo
 * - Shift-click the Outland logo
 * - ⌘/Ctrl+Shift+L
 * - ?tuner=1 in the URL
 */
export function mountAssetLayoutTunerGate({
  beatAssets,
  storyText,
  storyScroll,
  beats,
  assets,
}) {
  if (!beatAssets) return { open() {}, close() {}, toggle() {} };

  let tuner = null;
  let loading = null;

  const close = () => {
    tuner?.destroy?.();
    tuner = null;
    loading = null;
    try {
      sessionStorage.removeItem(SESSION_FLAG);
    } catch {
      // ignore
    }
  };

  const open = async () => {
    if (tuner) return tuner;
    await beatAssets.loadPromise;

    if (!loading) {
      loading = import("./asset-layout-tuner.js")
        .then(({ initAssetLayoutTuner }) => {
          tuner = initAssetLayoutTuner({
            beatAssets,
            storyText,
            storyScroll,
            beats,
            assets,
            onClose: close,
          });
          return tuner;
        })
        .catch((err) => {
          loading = null;
          console.error("[asset-layout-tuner] failed to load", err);
          throw err;
        });
    }

    await loading;
    try {
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // ignore
    }
    return tuner;
  };

  const toggle = () => {
    if (tuner) close();
    else void open();
  };

  const logo = document.querySelector(".chrome-logo__link, .chrome-logo");
  logo?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    toggle();
  });

  logo?.addEventListener("click", (event) => {
    if (!event.shiftKey) return;
    event.preventDefault();
    toggle();
  });

  window.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
    if (event.key.toLowerCase() !== "l") return;
    event.preventDefault();
    toggle();
  });

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("tuner") || sessionStorage.getItem(SESSION_FLAG) === "1") {
      void open();
    }
  } catch {
    // ignore
  }

  return { open, close, toggle };
}
