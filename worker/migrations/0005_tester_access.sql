-- #70 Staging tester access with a personal 8-digit PIN. STAGING database only. NOT APPLIED — needs owner approval.
-- No PIN, session token, IP address or email is stored in clear:
--   testers.pin_hash      = HMAC-SHA256(PIN_PEPPER secret, "wordloop-pin-v1|" + PIN)   (the secret is NOT in D1)
--   tester_sessions.token_hash = SHA-256(random 256-bit cookie value)
--   auth_failures.bucket  = "ip:" + SHA-256("wl-auth|<15-min window>|<IP>")  or  "all:<hour>"; rows expire with the window.
-- `label` is a short owner note (e.g. "tester-1"); avoid real names. `profile` keeps a renewed PIN on the same local data.
CREATE TABLE IF NOT EXISTS testers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  profile TEXT NOT NULL,
  pin_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS tester_sessions (
  token_hash TEXT PRIMARY KEY,
  tester_id TEXT NOT NULL REFERENCES testers(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tester_sessions_by_tester ON tester_sessions (tester_id);
CREATE TABLE IF NOT EXISTS auth_failures (
  bucket TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  window_end INTEGER NOT NULL
);
