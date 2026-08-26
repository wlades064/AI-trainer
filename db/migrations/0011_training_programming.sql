ALTER TABLE workout_plans ADD COLUMN emphasis TEXT;
ALTER TABLE workout_plans ADD COLUMN programming_rationale_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE workout_sessions ADD COLUMN emphasis TEXT;

CREATE INDEX idx_workout_sessions_focus_emphasis_completed
  ON workout_sessions(user_id, focus, emphasis, completed_at);

CREATE TABLE training_program_state (
  user_id INTEGER NOT NULL REFERENCES users(id),
  focus TEXT NOT NULL CHECK (focus IN ('chest', 'back', 'legs')),
  next_emphasis TEXT NOT NULL,
  last_completed_session_id INTEGER REFERENCES workout_sessions(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, focus)
);
