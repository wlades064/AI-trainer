ALTER TABLE workout_plans ADD COLUMN load_mode TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE workout_sessions ADD COLUMN load_mode TEXT NOT NULL DEFAULT 'normal';

CREATE TABLE deload_assessments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  assessed_on TEXT NOT NULL,
  completed_hard_weeks INTEGER NOT NULL DEFAULT 0,
  consecutive_performance_declines INTEGER NOT NULL DEFAULT 0,
  fatigue INTEGER CHECK (fatigue BETWEEN 1 AND 5),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  motivation INTEGER CHECK (motivation BETWEEN 1 AND 5),
  soreness_hours REAL,
  worsening_joint_pain INTEGER NOT NULL DEFAULT 0 CHECK (worsening_joint_pain IN (0, 1)),
  new_swelling INTEGER NOT NULL DEFAULT 0 CHECK (new_swelling IN (0, 1)),
  joint_instability INTEGER NOT NULL DEFAULT 0 CHECK (joint_instability IN (0, 1)),
  recommendation TEXT NOT NULL CHECK (recommendation IN ('normal', 'monitor', 'deload', 'stop_and_review')),
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('none', 'planned', 'reactive', 'safety', 'recovery_already_taken')),
  reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, assessed_on)
);

CREATE INDEX idx_deload_assessments_user_date
  ON deload_assessments(user_id, assessed_on DESC);
