PRAGMA foreign_keys = ON;

CREATE TABLE user_exercise_settings (
  user_id INTEGER NOT NULL REFERENCES users(id),
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  availability TEXT NOT NULL DEFAULT 'active'
    CHECK (availability IN ('active', 'paused', 'rare', 'unknown')),
  workout_role TEXT NOT NULL DEFAULT 'either'
    CHECK (workout_role IN ('main', 'accessory', 'either')),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN -2 AND 2),
  safety_notes TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'telegram',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, exercise_id)
);

CREATE TABLE training_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id),
  preference_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, preference_key)
);

CREATE INDEX idx_user_exercise_settings_selection
  ON user_exercise_settings(user_id, availability, workout_role, priority);

