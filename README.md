# WordLoop — Local-first PWA

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

## Next handoff to Claude
Give Claude `docs/CLAUDE_FRONTEND_BRIEF.md` plus this project folder and visual reference. Claude should improve visual responsiveness, micro-interactions and all microcopy only. See `docs/VOICE_AND_DESIGN_SYSTEM.md`.

## Architecture/ownership
- `src/data.ts` — vocabulary model, IndexedDB, FSRS, exports/imports (ChatGPT-owned).
- `src/push.ts`, `worker/*` — push state/registration/delivery (ChatGPT-owned).
- `src/App.tsx`, `src/style.css` — starter UI and copy (Claude can refine).
- `public/sw.js` — offline shell + push (ChatGPT-owned).

## Security notes
No login: only the owner of a device/browser profile can access its local words, subject to normal browser/device security. The push endpoint uses a random per-device secret stored locally; the server keeps its SHA-256 digest and subscription metadata. Token-based auth is a pragmatic lightweight MVP, not a replacement for full user accounts. Do not put credentials in client bundle. Avoid sharing backups publicly, as they contain all vocabulary and study history. Production needs device testing, abuse/rate-limit review, and monitoring.
