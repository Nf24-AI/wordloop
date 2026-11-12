# WordLoop — Local-first PWA

> **Product feedback / To do:** [WordLoop Project Board](PROJECT_BOARD.md) · [Open tasks](https://github.com/Nf24-AI/wordloop/issues?q=is%3Aissue+is%3Aopen) · [Add a note](https://github.com/Nf24-AI/wordloop/issues/new/choose)

Arabic-first English vocabulary review app. One person's words stay in that browser/device. No user account, no cloud word database. Reference artwork is in `docs/identity-reference.png`.

## What is implemented
- React/Vite frontend with RTL dashboard, add, review, search/library, settings; cohesive verbal identity.
- IndexedDB vocabulary + review log storage, atomic review commits.
- FSRS-7 (`ts-fsrs` v6) at desired retention 0.90, with four ratings.
- Human-readable manual JSON backup and guarded full restore (replaces current local data).
- Browser storage persistence request and PWA offline caching of HTML, generated CSS/JS assets and icons during service-worker installation.
- Optional Cloudflare Web Push notifications: D1 holds **only** anonymous device token hash, web-push endpoint/keys and earliest due timestamp. No word text, meanings, or review history is ever uploaded.
- Daily Cloudflare Cron schedule `0 17 * * *` = 20:00 in Riyadh. When due, server sends a neutral reminder. Uses the most recently synced timestamp, which can get stale if the user studies offline.

## Run locally
1. Node 24 or newer is recommended for `ts-fsrs` v6 (other dependencies may have requirements as well).
2. `npm install`
3. `npm run dev`
4. `npm run typecheck` and `npm run build`

The vocabulary experience can be used without setting up Cloudflare or D1. `Enable notifications` will show a setup error until the Worker and keys are provisioned.

## Optional push setup (Cloudflare)
1. In Cloudflare, create a D1 database `wordloop-push` and add this binding to `wrangler.jsonc`: `"d1_databases": [{"binding":"PUSH_DB","database_name":"wordloop-push","database_id":"<your-id>"}]` (ensure valid JSONC syntax).
2. Initialize D1 from `worker/schema.sql`. Use your installed Cloudflare CLI help (Wrangler for this existing `wrangler.jsonc` project); e.g. `npx wrangler d1 execute wordloop-push --file=worker/schema.sql --remote`.
3. Generate a new VAPID P-256 key pair with a trusted Web Push-compatible tool (never commit private keys). Configure `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` as Worker secrets. `VAPID_PUBLIC_KEY` is derived by the Worker library from the private key.
4. `npm run deploy`, verify `GET /api/health`, `GET /api/push/key` and test from a real mobile phone.
5. On iPhone: iOS 16.4+ and add PWA to Home Screen before enabling push. On other devices, allow notifications as prompted. Requires HTTPS.

**Limitations**: Web Push availability and delivery vary by platform/network/browser, and Cron is not an exact to-the-second guarantee. No cloud sync and no push without an active internet connection. On offline review, the previously scheduled push can be stale until the next successful sync. Browser storage may be evicted or cleared, and installed iOS PWA storage can be separate from Safari tab storage. Back up manually and save file outside the site/browser. Import/restore always asks for confirmation.

## Frontend update (Claude, 2026-11-12)
- Redesigned all screens in `src/App.tsx` / `src/style.css` (RTL, mobile-first, colour-wash identity, Saudi conversational copy). New «تقدّمك» progress page built only from local data.
- Hash routes (`#/review`, `#/words`, `#/add`, `#/stats`, `#/settings`) so the phone back button works.
- Fonts are self-hosted in `src/fonts/` (no request to Google, cached for offline use).
- Approved fixes outside the UI: `vite` 7.3.8 → 8.3.5 (plugin-react 6 needs Vite 8), a type-only fix of the FSRS rating map in `src/data.ts`, and offline caching in `public/sw.js` (cache `wordloop-shell-v4`; push handlers unchanged).
- Deployment: see `docs/DEPLOY_CLOUDFLARE.md`.

## Architecture/ownership
- `src/data.ts` — vocabulary model, IndexedDB, FSRS, exports/imports (ChatGPT-owned).
- `src/push.ts`, `worker/*` — push state/registration/delivery (ChatGPT-owned).
- `src/App.tsx`, `src/style.css`, `src/fonts/` — UI, copy and fonts (Claude).
- `public/sw.js` — offline shell + push (ChatGPT-owned).

## Security notes
No login: only the owner of a device/browser profile can access its local words, subject to normal browser/device security. The push endpoint uses a random per-device secret stored locally; the server keeps its SHA-256 digest and subscription metadata. Token-based auth is a pragmatic lightweight MVP, not a replacement for full user accounts. Do not put credentials in client bundle. Avoid sharing backups publicly, as they contain all vocabulary and study history. Production needs device testing, abuse/rate-limit review, and monitoring.
