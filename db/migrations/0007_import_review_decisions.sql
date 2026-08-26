PRAGMA foreign_keys = ON;

ALTER TABLE imported_workout_lines ADD COLUMN review_note TEXT;
ALTER TABLE imported_workout_lines ADD COLUMN reviewed_at TEXT;

