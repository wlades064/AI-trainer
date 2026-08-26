PRAGMA foreign_keys = ON;

CREATE TABLE exercise_reintroduction_plans (
  user_id INTEGER NOT NULL REFERENCES users(id),
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'testing', 'established', 'paused')),
  load_policy TEXT NOT NULL,
  monitoring_json TEXT NOT NULL DEFAULT '[]',
  started_on TEXT,
  last_tested_on TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, exercise_id)
);

CREATE INDEX idx_reintroduction_user_status
  ON exercise_reintroduction_plans(user_id, status);

