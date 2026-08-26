PRAGMA foreign_keys = ON;

CREATE TABLE imported_workout_lines (
  id INTEGER PRIMARY KEY,
  imported_document_id INTEGER NOT NULL REFERENCES imported_documents(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  focus TEXT NOT NULL CHECK (focus IN ('chest', 'back', 'legs')),
  position INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  line_kind TEXT NOT NULL DEFAULT 'exercise'
    CHECK (line_kind IN ('exercise', 'header', 'continuation', 'unknown')),
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('auto_matched', 'needs_review', 'unmatched', 'confirmed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (imported_document_id, local_date, position)
);

CREATE TABLE imported_line_candidates (
  line_id INTEGER NOT NULL REFERENCES imported_workout_lines(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  match_rule TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (review_status IN ('suggested', 'confirmed', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (line_id, exercise_id)
);

CREATE INDEX idx_imported_workout_lines_review
  ON imported_workout_lines(imported_document_id, match_status, local_date);

CREATE INDEX idx_imported_line_candidates_exercise
  ON imported_line_candidates(exercise_id, review_status);
