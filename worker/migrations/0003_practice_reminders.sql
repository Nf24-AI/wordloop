-- #30 practice nudges. Additive only, like 0002: the current Worker ignores these columns and the new Worker falls back to
-- due-only reminders until they exist, so this can be applied before or after deploying. Nothing is deleted.
--   wrangler d1 execute wordloop-push-staging --remote --file=worker/migrations/0003_practice_reminders.sql
-- Still no learning data: a yes/no opt-in and the last local DAY the device practised (no content, scores or history).
ALTER TABLE push_devices ADD COLUMN practice_ok INTEGER NOT NULL DEFAULT 0;  -- 1 = practice nudges allowed and something to practise
ALTER TABLE push_devices ADD COLUMN last_practice_day TEXT;                  -- device-local YYYY-MM-DD of the last practice session
ALTER TABLE push_devices ADD COLUMN practice_sent_day TEXT;                  -- device-local day a practice nudge was sent (max 1/day)
-- Rollback: these columns are ignored by older Workers; leave them in place (SQLite DROP COLUMN is not needed to roll back).
