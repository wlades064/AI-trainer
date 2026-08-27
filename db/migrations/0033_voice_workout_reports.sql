ALTER TABLE workout_report_drafts ADD COLUMN source_file_unique_id TEXT;

CREATE UNIQUE INDEX idx_workout_report_drafts_voice_file
  ON workout_report_drafts(user_id, source_file_unique_id)
  WHERE source_file_unique_id IS NOT NULL;
