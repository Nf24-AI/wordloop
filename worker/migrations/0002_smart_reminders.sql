-- #30 Smart Reminders. Additive only: the current Worker ignores these columns, so this can (and must) be applied
-- BEFORE the new Worker is deployed. Existing subscriptions keep working; nothing is deleted.
--   wrangler d1 execute wordloop-push-staging --remote --file=worker/migrations/0002_smart_reminders.sql
-- Still no vocabulary data: only the device's time zone and notification language are added, plus send bookkeeping.
ALTER TABLE push_devices ADD COLUMN time_zone TEXT;                    -- IANA zone, e.g. Asia/Riyadh (NULL → Asia/Riyadh)
ALTER TABLE push_devices ADD COLUMN locale TEXT;                       -- notification language: 'ar' | 'en' (NULL → ar)
ALTER TABLE push_devices ADD COLUMN notified_due_at TEXT;              -- idempotency key: the due event already notified
ALTER TABLE push_devices ADD COLUMN last_sent_at INTEGER;              -- ms since epoch, for the cooldown
ALTER TABLE push_devices ADD COLUMN sent_day TEXT;                     -- device-local day of sent_count
ALTER TABLE push_devices ADD COLUMN sent_count INTEGER NOT NULL DEFAULT 0;
-- last_sent_day (old once-a-day rule) is no longer read; it stays to keep this migration additive and reversible.
