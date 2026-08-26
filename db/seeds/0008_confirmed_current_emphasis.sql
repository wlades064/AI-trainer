-- Confirmed by the owner: 2026-08-24 chest emphasized upper chest.
UPDATE workout_sessions
SET emphasis = 'upper_chest'
WHERE user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
  AND local_date = '2026-08-24'
  AND focus = 'chest';

-- Confirmed by the owner: the planned 2026-08-26 back workout emphasizes lats.
UPDATE workout_plans
SET emphasis = 'lats', load_mode = 'normal'
WHERE user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
  AND planned_for = '2026-08-26'
  AND focus = 'back';
