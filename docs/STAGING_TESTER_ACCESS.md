# Staging tester access with a personal PIN (#70)

**Staging only. OFF until the owner turns it on.** The PIN gate replaces Cloudflare Access for invited testers. Production has no `AUTH_MODE`, no `PIN_PEPPER` and no tester tables; there, the gate code never runs.

## How it works
- **One PIN per tester.**
  - Each PIN is 8 random digits, made with `crypto.randomInt`. Trivial patterns are rejected (11111111, 12345678, 12341234…).
  - A PIN expires after 1–30 days (7 by default).
  - The PIN is shown **once**, in the owner's terminal. It is never written to a file, GitHub, D1 or a log.
- **Storage, with no secrets in clear:**
  - D1 keeps only `HMAC-SHA256(PIN_PEPPER, PIN)`.
  - `PIN_PEPPER` is a separate Worker secret and is not in D1. A copy of the database alone cannot be brute-forced offline.
  - A session is a random 256-bit value. D1 keeps only its SHA-256.
- **The Worker checks every request:**
  - pages, scripts, `/sw.js` and every `/api/*`;
  - except `/login`, the sign-in fonts, the icons, the web manifest and `/api/health`, none of which hold data.
  - The manifest has to be public because browsers fetch it without cookies. Without it, «Add to Home Screen» breaks.
- **Session cookie:**
  - `__Host-wl_session`, set `HttpOnly; Secure; SameSite=Lax; Path=/`. Page scripts cannot read it.
  - It lasts 7 days at most, and never longer than the PIN.
  - It is checked against D1 on every request, so a revoke takes effect on the very next request.
- **Limits on wrong PINs:**
  - 10 per 15 minutes per address (the address is stored only as a hash that changes every window);
  - 200 per hour for everyone together;
  - plus the existing Cloudflare rate-limit binding.
  - Trade-off: someone hammering the sign-in page can pause sign-in for everyone for up to an hour. Existing sessions keep working.
- **Request protection:**
  - Sign-in and sign-out accept same-origin requests only. They check `Origin`, or `Sec-Fetch-Site` when the browser sends `Origin: null` because of `no-referrer`.
  - There is no open redirect after sign-in.
  - The sign-in page has no JavaScript, a strict CSP with a per-response style nonce, and `frame-ancestors 'none'`.
- **Fails closed:**
  - If `AUTH_MODE=pin` is set but the secret or the tables are missing, nothing is served (503).
  - Gated responses are `private`, with `Vary: Cookie`, so a shared cache never stores them.

## Local data (IndexedDB) and the service worker
- **Words never leave the device.** Sign-out deletes the session and clears the HTTP cache and the offline page cache. **IndexedDB is never cleared**, so signing in again shows the same words.
- **One browser profile = one tester.** The words in a browser belong to the first tester who signs in there (`accessOwner` in local meta; restoring a backup keeps it).
  - If another tester signs in on the same browser, the app does **not** open. It shows «This browser holds another tester's words» with a sign-out button.
  - Nothing is merged, read or deleted.
  - Use separate browser profiles or devices.
- **A renewed PIN keeps the same local data.** `renew` reuses the tester's profile.
- **The owner should sign in first** on their own existing Staging browser, so their current words are bound to them.
- **Service worker:**
  - Behind the gate it can't precache without a session; a sign-in redirect is never stored as the offline shell.
  - After sign-out its cache is deleted, so a later visitor on the same browser gets the sign-in page, not a cached app.
  - If a signed-in tester goes offline, the cached app still opens their own local words.
- **iPhone:** an app added to the Home Screen keeps its own cookies, separate from Safari. Sign in once inside it as well.

## Owner steps (each needs your approval; nothing here has been run)
Keep the pepper file outside the repository, e.g. `C:\Users\<you>\.wordloop\pin-pepper.txt`. Never paste a PIN or the pepper in chat, an issue or a PR.

```bash
# 0) Merge the PR. This deploys the code with the gate OFF; Cloudflare Access stays exactly as it is.
# 1) D1: create the three tester tables (staging database only)
npx wrangler d1 execute wordloop-push-staging --remote --file worker/migrations/0005_tester_access.sql
# 2) Secret pepper (created locally, sent straight to the Worker secret)
export PIN_PEPPER_FILE="$HOME/.wordloop/pin-pepper.txt"    # PowerShell: $env:PIN_PEPPER_FILE="..."
node scripts/tester-pin.mjs init-pepper
npx wrangler secret put PIN_PEPPER < "$PIN_PEPPER_FILE"
# 3) PINs: yours first, then each tester (the PIN is shown once; send it privately, not with the link)
node scripts/tester-pin.mjs create --label owner --days 30
node scripts/tester-pin.mjs create --label tester-1 --days 7
# 4) Turn the gate ON. A secret, so later deploys keep it:
echo pin | npx wrangler secret put AUTH_MODE
# 5) Check: a private window → /login; your PIN → the app; /api/push/key without a session → 401.
# 6) Only then, in the Cloudflare dashboard: remove (or bypass) the Access application for the staging hostname,
#    otherwise testers meet the Access email screen before the PIN screen.
```

**Managing testers:**

| task | command | effect |
|---|---|---|
| list | `node scripts/tester-pin.mjs list` | id, label, expiry, revoked, active sessions — no PINs |
| new PIN, same data | `node scripts/tester-pin.mjs renew <id>` | the old PIN and its sessions stop at once |
| end sessions only | `node scripts/tester-pin.mjs signout <id>` | the tester must sign in again; the PIN still works |
| revoke | `node scripts/tester-pin.mjs revoke <id>` | the PIN and all sessions stop on the next request |
| everyone out | `npx wrangler d1 execute wordloop-push-staging --remote --command "DELETE FROM tester_sessions"` | all sessions end |

**Rollback:**
- First re-enable Cloudflare Access if you removed it.
- Then run `npx wrangler secret delete AUTH_MODE`.
- With `AUTH_MODE` unset and Access removed, Staging would be public. Never leave both off.

## Tests
- `tests/auth.test.mjs` (AUTH-01…19) runs on real SQLite with migration 0005. It covers:
  - the off and fail-closed states;
  - gated pages, assets and APIs;
  - cookie flags; hashes only in D1;
  - Arabic digits; wrong, expired and revoked PINs;
  - per-address and global limits;
  - sign-out, revoke, signout and expiry;
  - cross-site requests and forged cookies; open redirect and XSS;
  - public files; the PIN tool;
  - binding local data to one tester;
  - no secrets in logs.
- `tests/e2e/auth-pin.e2e.mjs` runs Chromium and WebKit at 390×844 against the real app. It covers:
  - wrong PIN, then sign-in with Arabic digits;
  - the session cookie is HttpOnly;
  - add a word, sign out, then confirm the API is closed;
  - sign in again: the word is still there;
  - a second tester in the same browser is blocked and sees nothing;
  - revoke: the very next request gets 401, and a reload goes to sign-in.
