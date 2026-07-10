import { defineConfig } from "vite";

/**
 * Asset base path:
 * - `/outland-world/` — GitHub Pages project URL (current public link)
 * - `/` — custom domain enteroutland.com (enable via CUSTOM_DOMAIN repo variable)
 */
const base = process.env.SITE_SUBPATH || "/";

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/gsap")) return "gsap";
        },
      },
    },
  },
});
