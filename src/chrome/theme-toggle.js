const STORAGE_KEY = "outland-theme";
const LIGHT = "light";
const DARK = "dark";

function normalizeTheme(value) {
  return value === DARK ? DARK : LIGHT;
}

export function initThemeToggle() {
  const button = document.getElementById("theme-toggle");
  const metaTheme = document.querySelector('meta[name="theme-color"]');

  const sync = (theme) => {
    const current = normalizeTheme(theme);
    const isDark = current === DARK;
    document.documentElement.dataset.theme = current;
    button?.setAttribute("aria-checked", isDark ? "true" : "false");
    button?.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} theme`);
    metaTheme?.setAttribute("content", isDark ? "#1d1c1a" : "#fcfcf5");
  };

  const initial = normalizeTheme(document.documentElement.dataset.theme);
  sync(initial);

  button?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === DARK ? LIGHT : DARK;
    sync(next);
    window.dispatchEvent(new CustomEvent("outland:themechange", { detail: { theme: next } }));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Storage can be unavailable in privacy modes. */
    }
  });
}
