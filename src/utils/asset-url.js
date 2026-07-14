/** Resolve public asset paths using Vite `base`. */
export function assetUrl(path) {
  const base = import.meta.env.BASE_URL;
  const clean = String(path).replace(/^\//, "");
  const parts = clean.split("/");
  const file = parts.pop() ?? "";
  const encoded = [...parts, encodeURIComponent(file)].join("/");
  return `${base}${encoded}`;
}
