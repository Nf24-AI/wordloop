# WordLoop — Staging / UAT

**Current status:** deployed and protected by Cloudflare Access. Public HTTPS hostname is enabled, but **authenticated access is required** before any application response or API access. Automated unauthenticated-access checks passed; an authenticated mobile UAT is still pending.

## Environment inventory

| Component | Production | Staging |
|---|---|---|
| Git branch | `main` | `staging` |
| Worker | `wordloop-local-first` | `wordloop-staging` |
| Push D1 | `wordloop-push` | `wordloop-push-staging` |
| User vocabulary | Local IndexedDB | Local IndexedDB on distinct origin |
| VAPID | Production secrets | Staging-specific `VAPID_SUBJECT` configured; `VAPID_PRIVATE_KEY` **pending secure setup** |
| Public route | Enabled | Enabled **behind Cloudflare Access** |
| Scheduled check | 20:00 Asia/Riyadh | 20:00 Asia/Riyadh (safe no-op until VAPID configured) |
| Workflow | GitHub main build | GitHub branch staging build |

**Staging URL (Access sign-in required):** https://wordloop-staging.nf24-wordloop.workers.dev/

**Access policy:** `WordLoop Staging - Owner UAT` protects the entire Worker; only the Cloudflare account owner's email is allowed. No anonymous or Everyone access. [Automated protection test](https://github.com/Nf24-AI/wordloop/actions/runs/43273787938) validates unauthenticated denial for `/`, `/api/health`, and `/sw.js`.

### What has been configured
- [x] Cloudflare D1 test database with schema from `worker/schema.sql`
- [x] Separate Worker with distinct D1 binding and Worker environment flag
- [x] Separate Vite build and Workers Builds trigger restricted to the `staging` branch
- [x] Production still follows `main` only
- [x] Staging builds with `npm run build -- --mode staging` to display the “نسخة اختبار” badge
- [x] Staging-only CI validates no production D1 ID is used and runs typecheck, tests, and build
- [x] Worker-level Cloudflare Access is active before enabling public `workers.dev`; Preview URLs remain off
- [x] Access login/deny protects UI, health API and Service Worker according to GitHub Actions test
- [x] Staging-only `VAPID_SUBJECT` secret configured.

### Remaining Web Push setup and authenticated UAT

1. Generate a **new** P-256 VAPID key for the staging Worker. **Do not paste private keys into GitHub, conversations, issue comments, or committed files.**
2. An operator with Wrangler access to the Cloudflare account can set the private key directly from a local generator using:
   ```bash
   npx -p @codefusion-cc/web-push codefusion-vapid | npx wrangler secret put VAPID_PRIVATE_KEY --name wordloop-staging
   ```
   Keep the generated key exclusive to Staging and leave Production untouched. This project already has a staging-only `VAPID_SUBJECT` secret.
3. After setting the private key, verify `/api/push/key` works **when signed in** through Access. Test one Staging subscription on an authorized phone; never reuse a Production subscription or copy its private key.
4. Verify the installed iPhone PWA and Android Chrome accept the authenticated Access session and the push permission flow. Record results and exceptions.
5. The GitHub Actions negative test verifies only **unauthenticated denial**, not successful login. Authorized interaction and real device push tests remain pending.

### UAT checklist
- [x] Verified unauthorized visitors cannot access Staging UI, API or SW via CI.
- [ ] Verify an authorized tester can successfully sign in and access Staging.
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
5. Production builds on `main` use `wrangler versions upload` **without deploying traffic**, verified on 12 November 2026. After UAT approval, release the uploaded version manually using `wrangler versions deploy` or the Cloudflare dashboard. Do not promote without approval.
6. Keep versioned backups; code rollbacks do **not** undo data changes made to D1.

> Note: branch-specific Wrangler configs differ for isolation, so an identical git SHA is not guaranteed in both environments. Compare application source/build outputs and explicit environment differences when approving a release.
