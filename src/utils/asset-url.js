/** Resolve public asset paths for GitHub Pages (`/outland-world/`) and local dev (`/`). */
export function assetUrl(path) {
  const base = import.meta.env.BASE_URL;
  const clean = String(path).replace(/^\//, "");
  return `${base}${clean}`;
}
