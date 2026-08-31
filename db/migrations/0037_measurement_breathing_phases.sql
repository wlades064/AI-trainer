PRAGMA foreign_keys = ON;

DROP INDEX idx_measurement_conversations_pending;
ALTER TABLE measurement_conversations RENAME TO measurement_conversations_legacy;

CREATE TABLE measurement_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  step INTEGER NOT NULL DEFAULT 1 CHECK(step BETWEEN 1 AND 7),
  values_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

INSERT INTO measurement_conversations(
  id,user_id,step,values_json,status,expires_at,created_at,updated_at,completed_at
)
SELECT
  id,user_id,step,values_json,
  CASE WHEN status='pending' THEN 'expired' ELSE status END,
  expires_at,created_at,updated_at,completed_at
FROM measurement_conversations_legacy;

DROP TABLE measurement_conversations_legacy;

CREATE INDEX idx_measurement_conversations_pending
  ON measurement_conversations(user_id,status,expires_at);
