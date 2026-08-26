PRAGMA foreign_keys = ON;

CREATE TABLE injury_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  step INTEGER NOT NULL DEFAULT 1 CHECK(step BETWEEN 1 AND 4),
  body_area TEXT,
  injury_status TEXT CHECK(injury_status IN ('active','recovering')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX idx_injury_conversations_pending ON injury_conversations(user_id,status,expires_at);
