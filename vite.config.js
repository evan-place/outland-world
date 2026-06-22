import { defineConfig } from "vite";

/**
 * Asset base path:
 * - `/outland-world/` — GitHub Pages project URL (current public link)
 * - `/` — custom domain enteroutland.com (enable via CUSTOM_DOMAIN repo variable)
 */
const base = process.env.SITE_SUBPATH || "/";

export default defineConfig({
  base,
});
