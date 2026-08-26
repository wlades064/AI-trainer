PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Europe/Samara',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE goal_periods (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  goal_type TEXT NOT NULL,
  description TEXT,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schedule_rules (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  focus TEXT NOT NULL CHECK (focus IN ('chest', 'back', 'legs', 'rest')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (user_id, weekday)
);

CREATE TABLE exercises (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  muscle_group TEXT NOT NULL,
  equipment TEXT,
  instructions TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE injury_episodes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body_area TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'recovering', 'resolved')),
  description TEXT,
  avoid_json TEXT NOT NULL DEFAULT '[]',
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workout_plans (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  planned_for TEXT NOT NULL,
  focus TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'completed', 'skipped')),
  source TEXT NOT NULL DEFAULT 'system',
  model_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workout_plan_items (
  id INTEGER PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  exercise_id INTEGER REFERENCES exercises(id),
  position INTEGER NOT NULL,
  target_sets INTEGER,
  target_reps TEXT,
  target_weight_kg REAL,
  target_rpe REAL,
  rest_seconds INTEGER,
  notes TEXT,
  UNIQUE (plan_id, position)
);

CREATE TABLE workout_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER REFERENCES workout_plans(id),
  started_at TEXT,
  completed_at TEXT,
  duration_minutes INTEGER,
  readiness INTEGER CHECK (readiness BETWEEN 1 AND 10),
  pain_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  confirmed_at TEXT
);

CREATE TABLE set_logs (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id INTEGER REFERENCES exercises(id),
  set_number INTEGER NOT NULL,
  reps INTEGER,
  weight_kg REAL,
  rpe REAL,
  pain INTEGER CHECK (pain BETWEEN 0 AND 10),
  notes TEXT
);

CREATE TABLE nutrition_days (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  local_date TEXT NOT NULL,
  calories_kcal REAL,
  protein_g REAL,
  fat_g REAL,
  carbohydrate_g REAL,
  completeness TEXT NOT NULL CHECK (completeness IN ('detailed', 'aggregate_only')),
  source TEXT NOT NULL,
  source_reference TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, local_date, source)
);

CREATE TABLE body_measurements (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  measured_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL,
  UNIQUE (user_id, measured_at, kind, source)
);

CREATE TABLE external_connections (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  external_user_id TEXT,
  token_reference TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, provider)
);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY,
  connection_id INTEGER REFERENCES external_connections(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  cursor TEXT,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE system_events (
  id INTEGER PRIMARY KEY,
  event_type TEXT NOT NULL,
  scheduled_for TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  purpose TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plans_user_date ON workout_plans(user_id, planned_for);
CREATE INDEX idx_sessions_user_completed ON workout_sessions(user_id, completed_at);
CREATE INDEX idx_nutrition_user_date ON nutrition_days(user_id, local_date);
CREATE INDEX idx_measurements_user_kind_date ON body_measurements(user_id, kind, measured_at);
CREATE INDEX idx_injuries_user_status ON injury_episodes(user_id, status);
CREATE INDEX idx_events_unprocessed ON system_events(processed_at, scheduled_for);
