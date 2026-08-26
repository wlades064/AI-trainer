ALTER TABLE readiness_checkins ADD COLUMN pain_details TEXT;
ALTER TABLE readiness_checkins ADD COLUMN decision TEXT
  CHECK (decision IN ('allowed', 'blocked'));
ALTER TABLE readiness_checkins ADD COLUMN reasons_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE readiness_checkins ADD COLUMN completed_at TEXT;

CREATE TABLE readiness_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  requested_date TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 5),
  sleep_minutes INTEGER CHECK (sleep_minutes BETWEEN 0 AND 1440),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  energy INTEGER CHECK (energy BETWEEN 1 AND 5),
  pain INTEGER CHECK (pain BETWEEN 0 AND 10),
  pain_details TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled', 'superseded')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE (user_id, requested_date)
);

CREATE INDEX idx_readiness_conversations_pending
  ON readiness_conversations(user_id, status, expires_at, updated_at);
