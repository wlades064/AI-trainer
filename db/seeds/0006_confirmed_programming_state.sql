-- Confirmed by the owner on 2026-08-25. This seed contains no assumed leg emphasis.
INSERT INTO training_program_state(user_id, focus, next_emphasis)
SELECT id, 'chest', 'lower_chest' FROM users ORDER BY id LIMIT 1
ON CONFLICT(user_id, focus) DO UPDATE SET
  next_emphasis = excluded.next_emphasis,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO training_program_state(user_id, focus, next_emphasis)
SELECT id, 'back', 'lats' FROM users ORDER BY id LIMIT 1
ON CONFLICT(user_id, focus) DO UPDATE SET
  next_emphasis = excluded.next_emphasis,
  updated_at = CURRENT_TIMESTAMP;
