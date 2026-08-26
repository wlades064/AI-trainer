PRAGMA foreign_keys = ON;

CREATE TABLE equipment_items (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN ('machine', 'attachment', 'free_weight', 'bodyweight', 'other')),
  user_label TEXT NOT NULL,
  canonical_name TEXT,
  description TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, user_label)
);

CREATE TABLE exercise_aliases (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  UNIQUE (exercise_id, alias)
);

CREATE TABLE exercise_equipment (
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  equipment_id INTEGER NOT NULL REFERENCES equipment_items(id) ON DELETE CASCADE,
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  setup_notes TEXT,
  PRIMARY KEY (exercise_id, equipment_id)
);

ALTER TABLE imported_documents
  ADD COLUMN review_notes_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX idx_equipment_items_user_active
  ON equipment_items(user_id, active);

CREATE INDEX idx_exercise_aliases_alias
  ON exercise_aliases(alias);

