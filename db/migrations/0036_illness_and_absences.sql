PRAGMA foreign_keys = ON;

CREATE TABLE illness_episodes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  started_on TEXT NOT NULL,
  recovered_on TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','recovered')),
  source_kind TEXT NOT NULL DEFAULT 'telegram' CHECK(source_kind IN ('telegram','maintenance')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((status='active' AND recovered_on IS NULL) OR (status='recovered' AND recovered_on IS NOT NULL)),
  CHECK(recovered_on IS NULL OR recovered_on >= started_on)
);

CREATE UNIQUE INDEX idx_illness_one_active
  ON illness_episodes(user_id) WHERE status='active';
CREATE INDEX idx_illness_history
  ON illness_episodes(user_id,started_on,recovered_on);

CREATE TABLE training_absences (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  local_date TEXT NOT NULL,
  focus TEXT NOT NULL CHECK(focus IN ('chest','back','legs')),
  reason TEXT NOT NULL CHECK(reason IN ('ordinary','illness')),
  illness_episode_id INTEGER REFERENCES illness_episodes(id),
  source_kind TEXT NOT NULL DEFAULT 'telegram' CHECK(source_kind IN ('telegram','illness_backfill','maintenance')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,local_date),
  CHECK((reason='ordinary' AND illness_episode_id IS NULL) OR (reason='illness' AND illness_episode_id IS NOT NULL))
);

CREATE INDEX idx_training_absences_history
  ON training_absences(user_id,local_date,reason);

CREATE TABLE illness_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  step INTEGER NOT NULL DEFAULT 1 CHECK(step BETWEEN 1 AND 2),
  mode TEXT CHECK(mode IN ('start','recover')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX idx_illness_conversations_pending
  ON illness_conversations(user_id,status,expires_at);
