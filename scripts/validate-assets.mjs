import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const manifestPath = join(root, "src/data/assets.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const assets = manifest.assets || [];
let errors = 0;

for (const asset of assets) {
  if (asset.enabled === false) continue;
  const rel = asset.src.replace(/^\//, "");
  const full = join(root, "public", rel);
  if (!existsSync(full)) {
    console.error(`Missing asset file: ${asset.src} (id: ${asset.id})`);
    errors++;
  }
}

if (errors) {
  process.exit(1);
}

console.log(`Validated ${assets.length} assets.`);
