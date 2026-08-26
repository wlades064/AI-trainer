CREATE TABLE workout_report_drafts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL REFERENCES workout_plans(id),
  source_update_id INTEGER,
  raw_text TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  UNIQUE (user_id, source_update_id)
);

CREATE INDEX idx_workout_report_drafts_pending
  ON workout_report_drafts(user_id, status, created_at);
