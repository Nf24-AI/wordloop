-- WordLoop stores ZERO vocabulary data in the cloud. Only anonymous push metadata.
CREATE TABLE IF NOT EXISTS push_devices (
  token_hash TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  next_due_at TEXT,
  updated_at TEXT NOT NULL,
  last_sent_day TEXT,
  last_test_at INTEGER
);
CREATE INDEX IF NOT EXISTS push_devices_due ON push_devices(next_due_at,last_sent_day);
