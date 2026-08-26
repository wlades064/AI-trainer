CREATE UNIQUE INDEX idx_set_logs_session_exercise_set_number
  ON set_logs(session_exercise_id, set_number)
  WHERE session_exercise_id IS NOT NULL;
