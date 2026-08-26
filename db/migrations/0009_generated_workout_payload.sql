PRAGMA foreign_keys = ON;

ALTER TABLE workout_plans ADD COLUMN generated_json TEXT;

CREATE INDEX idx_workout_plans_reuse
  ON workout_plans(user_id, planned_for, focus, status, created_at);

