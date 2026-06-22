# Deployment & custom domain

## Current public URL

**https://evan-place.github.io/outland-world/**

Pushes to `main` auto-deploy via GitHub Actions. Builds use `/outland-world/` asset paths so fonts, images, audio, and WebGL all resolve correctly on that URL.

## How it works

| Mode | When | Asset base | CNAME in deploy |
|------|------|------------|-----------------|
| **GitHub Pages** (default) | Now | `/outland-world/` | No |
| **Custom domain** | After cutover | `/` | `enteroutland.com` |

All asset URLs go through `assetUrl()` and Vite `import.meta.env.BASE_URL` — nothing is hardcoded to a host. The contact form (FormSubmit) works from either URL.

## Test a production build locally

Match the live GitHub Pages URL:

```bash
npm run build:pages
npm run preview
```

Or in one step:

```bash
npm run preview:pages
```

Test custom-domain paths locally:

```bash
npm run build
npm run preview
```

## Cutover to enteroutland.com

Do these in order when DNS and domain are ready.

### 1. GitHub repository variable

1. Open **Settings → Secrets and variables → Actions → Variables**
2. Add variable: `CUSTOM_DOMAIN` = `true`

The next deploy will build with root paths (`/`) and include `enteroutland.com` in the Pages artifact.

### 2. GitHub Pages custom domain

1. **Settings → Pages → Custom domain** → enter `enteroutland.com`
2. Wait for DNS check, then enable **Enforce HTTPS**

### 3. DNS (at your registrar)

**Apex** `enteroutland.com`:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

**www** (optional):

| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `evan-place.github.io` |

### 4. Update HTML meta (optional, SEO)

In `index.html`, set canonical and `og:url` to `https://enteroutland.com/` if not already.

### 5. Verify

- [ ] https://enteroutland.com — assets, scroll, audio, contact form
- [ ] HTTPS, no mixed content
- [ ] Mobile layout

### Rollback

Set `CUSTOM_DOMAIN` to `false` (or delete the variable) and push — deploys return to the `github.io/outland-world/` build.

## Files reference

| File | Purpose |
|------|---------|
| `vite.config.js` | Reads `SITE_SUBPATH` for asset base |
| `.github/workflows/deploy.yml` | Switches build mode from `CUSTOM_DOMAIN` |
| `docs/enteroutland.com.CNAME` | Copied into `dist/` only on domain cutover |
| `src/config.js` → `SITE.url` | Reflects build base at compile time |
| `src/utils/asset-url.js` | Resolves `/assets/...` for any base |

## Contact form

FormSubmit → `team@enteroutland.com`. First submission after go-live may require a one-time inbox activation email.
