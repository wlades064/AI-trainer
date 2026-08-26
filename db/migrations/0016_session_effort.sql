ALTER TABLE workout_sessions ADD COLUMN session_effort INTEGER
  CHECK (session_effort BETWEEN 1 AND 10);
ALTER TABLE workout_sessions ADD COLUMN last_set_rir INTEGER
  CHECK (last_set_rir BETWEEN 0 AND 10);
ALTER TABLE workout_sessions ADD COLUMN recovery_checkin_at TEXT;
