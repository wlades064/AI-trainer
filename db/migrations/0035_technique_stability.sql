ALTER TABLE workout_sessions ADD COLUMN technique_stable INTEGER
  CHECK (technique_stable IN (0, 1));

ALTER TABLE post_workout_checkins ADD COLUMN technique_stable INTEGER
  CHECK (technique_stable IN (0, 1));
