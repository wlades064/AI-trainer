PRAGMA foreign_keys = ON;

ALTER TABLE workout_sessions ADD COLUMN local_date TEXT;
ALTER TABLE workout_sessions ADD COLUMN focus TEXT;
ALTER TABLE workout_sessions ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'telegram';
ALTER TABLE workout_sessions ADD COLUMN source_ref TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX idx_workout_sessions_source
  ON workout_sessions(user_id, local_date, source_kind, source_ref);

CREATE TABLE workout_session_exercises (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL,
  source_position INTEGER,
  superset_group TEXT,
  raw_text TEXT,
  match_confidence REAL CHECK (match_confidence BETWEEN 0 AND 1),
  match_status TEXT NOT NULL DEFAULT 'manual'
    CHECK (match_status IN ('manual', 'auto_matched', 'owner_reviewed')),
  notes TEXT,
  UNIQUE (session_id, position)
);

ALTER TABLE set_logs ADD COLUMN session_exercise_id INTEGER
  REFERENCES workout_session_exercises(id) ON DELETE CASCADE;
ALTER TABLE set_logs ADD COLUMN set_type TEXT NOT NULL DEFAULT 'working'
  CHECK (set_type IN ('warmup', 'working', 'drop', 'backoff', 'failure', 'other'));
ALTER TABLE set_logs ADD COLUMN load_basis TEXT NOT NULL DEFAULT 'unknown'
  CHECK (load_basis IN ('total', 'per_side', 'per_dumbbell', 'machine_display', 'bodyweight', 'unknown'));
ALTER TABLE set_logs ADD COLUMN superset_round INTEGER;
ALTER TABLE set_logs ADD COLUMN parent_set_number INTEGER;
ALTER TABLE set_logs ADD COLUMN performed_order INTEGER;

CREATE TABLE cardio_logs (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  activity TEXT NOT NULL,
  duration_minutes REAL,
  speed_value REAL,
  speed_unit TEXT,
  incline_value REAL,
  incline_unit TEXT,
  distance_km REAL,
  average_heart_rate INTEGER,
  notes TEXT,
  UNIQUE (session_id, position)
);

CREATE INDEX idx_session_exercises_session
  ON workout_session_exercises(session_id, position);

CREATE INDEX idx_set_logs_session_exercise
  ON set_logs(session_exercise_id, set_number);

CREATE INDEX idx_cardio_logs_session
  ON cardio_logs(session_id, position);

