ALTER TABLE workout_sessions ADD COLUMN post_workout_wellbeing INTEGER
  CHECK (post_workout_wellbeing BETWEEN 1 AND 5);

CREATE TABLE post_workout_checkins (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id INTEGER NOT NULL REFERENCES workout_sessions(id) UNIQUE,
  step INTEGER NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 4),
  session_effort INTEGER CHECK (session_effort BETWEEN 1 AND 10),
  last_set_rir INTEGER CHECK (last_set_rir BETWEEN 0 AND 10),
  pain_json TEXT,
  wellbeing INTEGER CHECK (wellbeing BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled', 'superseded')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX idx_post_workout_checkins_pending
  ON post_workout_checkins(user_id, status, expires_at, updated_at);
