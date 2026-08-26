CREATE TABLE training_load_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  current_block_started_on TEXT NOT NULL,
  completed_hard_weeks INTEGER NOT NULL DEFAULT 0 CHECK (completed_hard_weeks >= 0),
  last_deload_ended_on TEXT,
  baseline_reason TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
