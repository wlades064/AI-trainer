-- Owner report for the confirmed 2026-08-26 session: effort 8/10, last working sets RIR 0, no pain.
UPDATE workout_sessions
SET
  session_effort = 8,
  last_set_rir = 0,
  pain_json = '{"reported":true,"anyPain":false}',
  recovery_checkin_at = CURRENT_TIMESTAMP
WHERE user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
  AND local_date = '2026-08-26'
  AND source_kind = 'telegram'
  AND confirmed_at IS NOT NULL;

-- The last leg session was balanced, so a new alternating cycle starts conservatively with posterior chain.
INSERT INTO training_program_state(user_id, focus, next_emphasis, updated_at)
SELECT id, 'legs', 'posterior_chain', CURRENT_TIMESTAMP
FROM users
ORDER BY id
LIMIT 1
ON CONFLICT(user_id, focus) DO UPDATE SET
  next_emphasis = excluded.next_emphasis,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO audit_log(user_id, action, entity_type, entity_id, payload_json)
SELECT
  id,
  'set_initial_leg_emphasis',
  'training_program_state',
  'legs',
  '{"previous_session":"balanced","next_emphasis":"posterior_chain","reason":"conservative_start_due_to_knee_history"}'
FROM users
ORDER BY id
LIMIT 1;
