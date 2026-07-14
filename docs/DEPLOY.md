# Deployment

## Hosting

Deployed on **Vercel** with automatic deploys on push to `main`.

- **URL**: https://enteroutland.com
- **Framework**: Vite (auto-detected)
- **Serverless functions**: `api/` directory (Node.js)

## Environment variables (Vercel dashboard)

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes | Resend API key for the contact form |
| `RESEND_FROM` | No | Sender address, e.g. `Outland <hello@enteroutland.com>`. Defaults to `Outland <onboarding@resend.dev>` |

## Contact form

The contact form submits to `/api/contact`, a Vercel serverless function that calls the Resend API. Emails are delivered to `team@enteroutland.com`.

To send from a custom address (instead of `onboarding@resend.dev`), verify `enteroutland.com` in your Resend dashboard and set the `RESEND_FROM` environment variable.

## Local development

```bash
npm run dev
```

The contact form won't send emails locally (no `RESEND_API_KEY`), but the UI and validation will work. To test the full flow locally, install the Vercel CLI:

```bash
npx vercel dev
```

This runs the serverless functions alongside Vite. Set `RESEND_API_KEY` in a `.env` file (already in `.gitignore`).

## Production build

```bash
npm run build
npm run preview
```

## Files reference

| File | Purpose |
|------|---------|
| `vercel.json` | Vercel framework and build config |
| `api/contact.js` | Serverless function — validates input, calls Resend |
| `src/config.js` → `CONTACT` | Client-side form config (submit URL) |
| `src/contact/contact-modal.js` | Contact form UI and submission logic |
