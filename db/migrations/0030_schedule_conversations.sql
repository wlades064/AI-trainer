PRAGMA foreign_keys = ON;
CREATE TABLE schedule_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  step INTEGER NOT NULL DEFAULT 1 CHECK(step BETWEEN 1 AND 3),
  mode TEXT CHECK(mode IN ('move','cancel','add','reset')),
  source_date TEXT,
  source_focus TEXT CHECK(source_focus IN ('chest','back','legs')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX idx_schedule_conversations_pending ON schedule_conversations(user_id,status,expires_at);
