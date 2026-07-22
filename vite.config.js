import fs from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";

const LAYOUTS_REL = "src/data/beat-layouts.json";

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Dev-only: let the asset layout tuner write beat-layouts.json without a full reload. */
function outlandSaveBeatLayoutPlugin() {
  return {
    name: "outland-save-beat-layout",
    configureServer(server) {
      server.middlewares.use("/__outland/save-beat-layout", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const raw = await readRequestBody(req);
          const payload = JSON.parse(raw || "{}");
          const layoutId = payload.id;
          if (!layoutId || typeof layoutId !== "string") {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: "Missing layout id" }));
            return;
          }
          if (!Array.isArray(payload.items) && !Array.isArray(payload.itemsMobile)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: "Missing items or itemsMobile" }));
            return;
          }

          const filePath = path.resolve(server.config.root, LAYOUTS_REL);
          const current = JSON.parse(await fs.readFile(filePath, "utf8"));
          const layouts = current.layouts || current.beats;
          const layout = layouts?.find((entry) => entry.id === layoutId);
          if (!layout) {
            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false, error: `Unknown layout: ${layoutId}` }));
            return;
          }

          if (Array.isArray(payload.items)) {
            if (payload.items.length === 0) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: "Refusing to save empty items[]" }));
              return;
            }
            layout.items = payload.items;
          }
          if (Array.isArray(payload.itemsMobile)) {
            if (payload.itemsMobile.length === 0) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: "Refusing to save empty itemsMobile[]" }));
              return;
            }
            layout.itemsMobile = payload.itemsMobile;
          }

          // Avoid Vite HMR wiping the live tuner mid-edit.
          server.watcher.unwatch(filePath);
          await fs.writeFile(filePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
          setTimeout(() => {
            try {
              server.watcher.add(filePath);
            } catch {
              // ignore
            }
          }, 750);

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, id: layoutId }));
        } catch (err) {
          console.error("[outland-save-beat-layout]", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [outlandSaveBeatLayoutPlugin()],
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
