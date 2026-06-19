# Outland World

Scroll-driven narrative site for Outland — ambient document collage with WebGL drift, hybrid snap-scroll story beats, and warp text transitions.

## Local testing

From the project folder:

```bash
cd "/Users/evanplace/Documents/Cursor Projects/outland-world"
npm install
npm start
```

Then open **http://localhost:5173/** in your browser.

- **Scroll** to move through the 15 story beats (warp transitions between them).
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
  "blendMode": "screen",
  "hoverable": true,
  "size": { "maxWidth": 360, "scale": 1 },
  "layout": { "lane": "bottom-right", "anchor": { "x": 0.8, "y": 0.85 }, "rotation": 5 },
  "motion": { "path": "drift", "speed": 0.3, "zRange": [-12, 6], "sway": { "amp": 0.04, "freq": 0.2 }, "rotSpeed": 0.05 }
}
```

**Lanes:** `top-left`, `top-right`, `bottom-left`, `bottom-right`, `left`, `right`, `top`, `bottom`, `free`.

**Blend modes:** `screen`, `exclusion`, `lighten`, `color-dodge`, `plus-lighter`, `normal`.

Set `"enabled": false` to hide without deleting.

## Interaction

- Assets drift automatically through 3D space.
- Hover any asset to slow all motion (time thickens).
- Scroll to advance story beats with warp transitions between them.

## Fonts

Licensed Outland fonts live in `public/fonts/`.

## Build

```bash
npm run build
npm run preview
```

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
