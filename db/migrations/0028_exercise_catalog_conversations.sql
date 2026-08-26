PRAGMA foreign_keys = ON;
CREATE TABLE exercise_catalog_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  step INTEGER NOT NULL DEFAULT 1 CHECK(step IN (1,2)),
  selected_group TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_exercise_catalog_conversations_pending ON exercise_catalog_conversations(user_id,status,expires_at);
