# WordLoop — Staging / UAT

**Current status:** deployed, isolated, and intentionally **not publicly accessible** until an access-control policy is enabled.

## Environment inventory

| Component | Production | Staging |
|---|---|---|
| Git branch | `main` | `staging` |
| Worker | `wordloop-local-first` | `wordloop-staging` |
| Push D1 | `wordloop-push` | `wordloop-push-staging` |
| User vocabulary | Local IndexedDB | Local IndexedDB on distinct origin |
| VAPID | Production secrets | Independent test secrets **pending configuration** |
| Public route | Enabled | Disabled intentionally |
| Scheduled check | 20:00 Asia/Riyadh | 20:00 Asia/Riyadh (safe no-op until VAPID configured) |
| Workflow | GitHub main build | GitHub branch staging build |

**Staging endpoint after access protection is enabled:** `https://wordloop-staging.nf24-wordloop.workers.dev`. This URL is **not active yet**.

### What has been configured
- [x] Cloudflare D1 test database with schema from `worker/schema.sql`
- [x] Separate Worker with distinct D1 binding and Worker environment flag
- [x] Separate Vite build and Workers Builds trigger restricted to the `staging` branch
- [x] Production still follows `main` only
- [x] Staging builds with `npm run build -- --mode staging` to display the “نسخة اختبار” badge
- [x] Staging-only CI validates no production D1 ID is used and runs typecheck, tests, and build
- [x] Public `workers.dev` and preview URLs disabled until protected

### Remaining access and push setup
Cloudflare Access is **not yet enabled in the Cloudflare account** (API returns `access.api.error.not_enabled`). To activate access securely:
1. Enable Zero Trust / Access from the Cloudflare dashboard (this may involve an account setup step).
2. Protect **the entire `wordloop-staging` Worker** in Workers & Pages → Worker → Access. Configure an Allow policy for the approved tester identity or identities; avoid an Everyone policy.
3. Verify unauthorized requests to the Worker or its assets are denied before enabling `workers.dev`.
4. Set **new staging-only** secrets `VAPID_PRIVATE_KEY` (P-256 JWK JSON string) and `VAPID_SUBJECT` on `wordloop-staging`, not on production. Do not copy production private keys.
5. Enable the `workers.dev` URL only after the Worker-level Access policy is active. Then perform a signed-in smoke test of `/`, `/api/health`, `/api/push/key`, PWA files, and a test push notification on an authorized device.

### UAT checklist
- [ ] Verify authorized testers can access Staging; unauthorized users cannot.
- [ ] Add a vocabulary item and confirm it appears on the library page after refresh.
- [ ] Add multiple items; confirm IndexedDB, due review, and sorting remain correct.
- [ ] Review one item with each FSRS grade; check next due and counts.
- [ ] Export a valid JSON backup, import it, and verify the same words and reviews.
- [ ] Reject a corrupted backup without altering saved data.
- [ ] Open Staging offline after installing its PWA; re-enable network and verify service worker updates.
- [ ] Verify staging push subscriptions and test notifications use the **staging** D1 database.
- [ ] Test Safari installed PWA on iPhone and Chrome PWA on Android.
- [ ] Confirm Staging and Production are different origins, separate browser storage, and cannot send notifications across environments.
- [ ] Record product-owner approval before promoting application changes to Production.

### Safe release workflow
1. Build a feature on `feature/*`.
2. Send a PR into `staging` and run staging CI; test the deployed staging Worker.
3. Resolve problems and obtain explicit approval.
4. Promote approved **application changes** into `main` using a separate reviewed PR. **Do not merge staging-only Wrangler config, .env.staging, or staging-only workflows into production.**
5. Because Production currently deploys automatically on `main`, do not merge to `main` until approval is given.
6. Keep versioned backups; code rollbacks do **not** undo data changes made to D1.

> Note: branch-specific Wrangler configs differ for isolation, so an identical git SHA is not guaranteed in both environments. Compare application source/build outputs and explicit environment differences when approving a release.
