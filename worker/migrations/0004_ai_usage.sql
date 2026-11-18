-- #64 Practice 2.0: daily AI generation counters for the STAGING database only. NOT APPLIED — needs owner approval.
-- Holds no vocabulary, no stories, no IP addresses and no emails: `who` is SHA-256("wordloop-ai|<day>|<identity>"),
-- so it changes every day and cannot be joined across days. Rows older than a few days can be deleted freely.
CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT NOT NULL,
  who TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, who)
);
