-- The owner does not remember the last deload. Start prospective tracking without inventing history.
INSERT INTO training_load_state(
  user_id,
  current_block_started_on,
  completed_hard_weeks,
  last_deload_ended_on,
  baseline_reason
)
SELECT
  id,
  '2026-08-24',
  0,
  NULL,
  'owner_does_not_remember_last_deload_new_tracking_baseline'
FROM users
ORDER BY id
LIMIT 1
ON CONFLICT(user_id) DO UPDATE SET
  current_block_started_on = excluded.current_block_started_on,
  completed_hard_weeks = excluded.completed_hard_weeks,
  last_deload_ended_on = excluded.last_deload_ended_on,
  baseline_reason = excluded.baseline_reason,
  updated_at = CURRENT_TIMESTAMP;
