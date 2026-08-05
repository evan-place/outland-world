# AGENTS.md

## Cursor Cloud specific instructions

Outland World is a single, static, scroll-driven narrative frontend built with Vite 8 + Three.js (WebGL) + GSAP. There is no backend server to run for local development — the whole product is served by the Vite dev server.

### Services / how to run

- Dev server (the product): `npm run dev` (alias `npm start`) serves on `http://localhost:5173/`. This is the development command to use; `npm run build` + `npm run preview` is only for testing the production bundle.
- Core interaction: one scroll gesture advances one story beat (text crossfades, floating assets rearrange). Beats auto-advance after dwelling. Content lives in `src/data/story.json`, `src/data/assets.json`, and `src/data/beat-layouts.json`.

### Lint / test / build

- There is no linter and no automated test suite configured in this repo.
- The closest thing to a test is `npm run validate:assets`, which checks that every enabled asset in `src/data/assets.json` has a matching file under `public/`. Run it after editing assets.
- Build: `npm run build` (outputs to `dist/`). The Three.js chunk (~512 kB) exceeds Vite's 500 kB warning threshold; this warning is expected and not an error.

### Non-obvious caveats

- Node 22 is required (Vite 8 needs Node 20.19+ / 22.12+); the environment ships Node 22.
- `vite.config.js` deliberately excludes `src/data/beat-layouts.json` from the file watcher (the hidden dev asset-layout tuner writes it via a `/__outland/save-beat-layout` dev middleware). Because of this, manual edits to `beat-layouts.json` do NOT hot-reload — refresh the page to pick them up.
- `api/contact.js` is a Vercel serverless function (contact form email via Resend). It is NOT executed by the Vite dev server, so the contact form's send path only works when deployed to Vercel (or run under `vercel dev`). It requires the `RESEND_API_KEY` (and optional `RESEND_FROM`) environment variable. This is optional and not needed to run/develop the site locally.
