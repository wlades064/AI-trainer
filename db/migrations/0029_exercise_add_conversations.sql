PRAGMA foreign_keys = ON;
CREATE TABLE exercise_add_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  catalog_group TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 1 CHECK(step BETWEEN 1 AND 8),
  exercise_name TEXT,
  muscle_group TEXT,
  equipment_category TEXT,
  equipment_label TEXT,
  instructions TEXT,
  workout_role TEXT,
  risk_tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX idx_exercise_add_conversations_pending ON exercise_add_conversations(user_id,status,expires_at);
