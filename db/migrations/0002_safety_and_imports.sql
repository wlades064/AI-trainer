PRAGMA foreign_keys = ON;

CREATE TABLE exercise_risk_tags (
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  risk_tag TEXT NOT NULL,
  PRIMARY KEY (exercise_id, risk_tag)
);

CREATE TABLE schedule_exceptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  local_date TEXT NOT NULL,
  focus TEXT NOT NULL CHECK (focus IN ('chest', 'back', 'legs', 'rest')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, local_date)
);

CREATE TABLE readiness_checkins (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  local_date TEXT NOT NULL,
  sleep_minutes INTEGER,
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),
  energy INTEGER CHECK (energy BETWEEN 1 AND 10),
  pain INTEGER CHECK (pain BETWEEN 0 AND 10),
  has_new_swelling INTEGER NOT NULL DEFAULT 0 CHECK (has_new_swelling IN (0, 1)),
  has_instability INTEGER NOT NULL DEFAULT 0 CHECK (has_instability IN (0, 1)),
  feels_unwell INTEGER NOT NULL DEFAULT 0 CHECK (feels_unwell IN (0, 1)),
  source TEXT NOT NULL DEFAULT 'telegram',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, local_date, source)
);

CREATE TABLE imported_documents (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('needs_review', 'confirmed', 'rejected')),
  draft_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  UNIQUE (user_id, sha256)
);

CREATE INDEX idx_readiness_user_date ON readiness_checkins(user_id, local_date);
CREATE INDEX idx_imported_documents_user_status ON imported_documents(user_id, status);
