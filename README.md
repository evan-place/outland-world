# Outland World

Scroll-driven narrative site for Outland — ambient document collage with WebGL drift and step-by-step story beats.

## Local testing

From the project folder:

```bash
cd "/Users/evanplace/Documents/Cursor Projects/outland-world"
npm install
npm start
```

Then open **http://localhost:5173/** in your browser.

- **Scroll once** to advance one story beat (crossfade auto-completes).
- **Hover** any drifting document asset to slow all motion.
- **Edit live**: changes to `src/data/story.json`, `src/data/assets.json`, or styles reload automatically.

To test the production build locally:

```bash
npm run build
npm run preview
```

Open the URL printed by `preview` (usually http://localhost:4173/).

## Development

```bash
npm install
npm run dev
```

(`npm start` is an alias for `npm run dev`.)

## Validate assets

```bash
npm run validate:assets
```

## Add a story beat

Edit [`src/data/story.json`](src/data/story.json):

```json
{
  "id": "beat-16",
  "html": "Your new line with <em>emphasis</em>.",
  "style": "serif-lg"
}
```

Styles: `serif-xl`, `serif-lg`, `serif-md`.

## Add a document asset

1. Place image in `public/assets/` (WebP or PNG; keep long edge ≤ 1600px when possible).
2. Append entry to [`src/data/assets.json`](src/data/assets.json):

```json
{
  "id": "my-doc",
  "src": "/assets/my-doc.webp",
  "alt": "Description",
  "blendMode": "normal",
  "hoverable": true,
  "instances": 2,
  "size": {
    "maxWidth": 360,
    "scale": 0.85,
    "scaleJitter": 0.25
  },
  "layout": { "lane": "bottom-right", "anchor": { "x": 0.8, "y": 0.85 }, "rotation": 5 },
  "motion": { "speed": 0.3, "sway": { "amp": 0.04, "freq": 0.2 }, "rotSpeed": 0.05 }
}
```

### Scale variety

Each asset can control how big it appears, and how much each floating copy varies:

| Field | Purpose |
|-------|---------|
| `size.maxWidth` | Base pixel width before world scaling |
| `size.scale` | Multiplier on that size (e.g. `0.5` = small, `1.2` = large) |
| `size.scaleJitter` | Random variance per instance (`0.25` → ±25% around `scale`) |
| `size.scaleMin` / `size.scaleMax` | Fixed random range instead of jitter (optional) |
| `sizeClass` | Preset: `xs`, `sm`, `md`, `lg`, `xl` from `src/config.js` |
| `instances` | How many copies drift through the scene (default: `2`) |

Global default instance count: `settings.instancesPerAsset` in `assets.json`.

**Tips for variety:** mix small accents (`scale: 0.4–0.6`, `instances: 3`) with large hero pieces (`scale: 1.1–1.3`). Use different `lane` values so pieces enter from different edges.

**Lanes:** `top-left`, `top-right`, `bottom-left`, `bottom-right`, `left`, `right`, `top`, `bottom`, `free`.

**Blend modes:** `screen`, `exclusion`, `lighten`, `color-dodge`, `plus-lighter`, `normal`.

Set `"enabled": false` to hide without deleting.

### Spawn fade-in

New and respawned assets fade in over the first part of their drift path (no pop-in). Tune globally in `assets.json`:

```json
"settings": {
  "spawnFadeDistance": 7
}
```

Higher = longer/slower fade (more world units traveled before full opacity). Per-asset `opacity` still sets the target once faded in.

### Depth scaling (grow toward camera)

Assets start small far back and grow as they drift forward — matching the Figma collage where hero pieces (galaxy, paper form) dominate at the front.

```json
"size": {
  "maxWidth": 822,
  "depthScale": { "spawn": 0.06, "front": 2.15 }
}
```

| Field | Purpose |
|-------|---------|
| `depthScale.spawn` | Scale when far back (e.g. `0.08`) |
| `depthScale.front` | Scale near camera (e.g. `2.0` for hero assets, `0.6` for small accents) |

Global defaults live in `settings.depthScale` inside `assets.json`.

## Interaction

- Assets drift automatically through 3D space (config-driven from `assets.json`).
- Hover any asset to slow all motion (time thickens).
- One scroll advances one story beat; the crossfade completes on its own.

## Fonts

Licensed Outland fonts live in `public/fonts/`.

## Build

```bash
npm run build
npm run preview
```

## Live site

**https://evan-place.github.io/outland-world/**

Pushes to `main` auto-deploy via GitHub Actions (`.github/workflows/deploy.yml`).

## Deploy

Static output in `dist/` — deploy to Vercel, Netlify, or GitHub Pages.

```bash
npm run build
```

For GitHub Pages, set `GITHUB_PAGES=true` when building so asset paths use `/outland-world/`:

```bash
GITHUB_PAGES=true npm run build
```

Then enable Pages from the `dist` folder or use the included `.github/workflows/deploy.yml`.

**Repo:** https://github.com/evan-place/outland-world
