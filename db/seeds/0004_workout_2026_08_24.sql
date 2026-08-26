PRAGMA foreign_keys = ON;

INSERT INTO training_preferences(user_id, preference_key, value_json)
SELECT id, 'new_workout_load_conventions', json_object(
  'hammer', 'per_side_unless_explicitly_total',
  'dumbbells', 'per_dumbbell',
  'preserve_historical_explicit_total', 1
)
FROM users
WHERE 1 = 1
ON CONFLICT(user_id, preference_key) DO UPDATE SET
  value_json = excluded.value_json,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO workout_sessions(
  user_id, local_date, focus, source_kind, source_ref, notes, confirmed_at
)
SELECT id, '2026-08-24', 'chest', 'telegram', 'telegram:2026-08-24:user_report',
       'Фактически выполненная тренировка: грудь, средние дельты и дорожка. Время начала и окончания не указано.',
       CURRENT_TIMESTAMP
FROM users
WHERE 1 = 1
ON CONFLICT(user_id, local_date, source_kind, source_ref) DO UPDATE SET
  focus = excluded.focus,
  notes = excluded.notes,
  confirmed_at = excluded.confirmed_at;

DELETE FROM set_logs
WHERE session_id IN (
  SELECT id FROM workout_sessions
  WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report'
);

DELETE FROM cardio_logs
WHERE session_id IN (
  SELECT id FROM workout_sessions
  WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report'
);

DELETE FROM workout_session_exercises
WHERE session_id IN (
  SELECT id FROM workout_sessions
  WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report'
);

INSERT INTO workout_session_exercises(
  session_id, exercise_id, position, source_position, raw_text, match_confidence, match_status, notes
)
SELECT session.id, exercise.id, 1, 1,
       'Верхний хаммер: разминка; затем 30×12, 35×12, 40×12, 45×3 и сразу 35×3. Вес на одну руку.',
       1.0, 'manual', 'Разминка выполнена, но вес и повторения разминки не указаны.'
FROM workout_sessions session
JOIN exercises exercise ON exercise.name = 'Жим в Хаммере на верх груди'
WHERE session.local_date = '2026-08-24' AND session.source_ref = 'telegram:2026-08-24:user_report';

INSERT INTO workout_session_exercises(
  session_id, exercise_id, position, source_position, superset_group, raw_text, match_confidence, match_status
)
SELECT session.id, exercise.id, 2, 2, 'A',
       'Нижний хаммер: 40 кг на руку, 4×12 в суперсете с жимом Свенда.', 1.0, 'manual'
FROM workout_sessions session
JOIN exercises exercise ON exercise.name = 'Жим в Хаммере на низ груди'
WHERE session.local_date = '2026-08-24' AND session.source_ref = 'telegram:2026-08-24:user_report';

INSERT INTO workout_session_exercises(
  session_id, exercise_id, position, source_position, superset_group, raw_text, match_confidence, match_status
)
SELECT session.id, exercise.id, 3, 2, 'A',
       'Жим Свенда: один блин 5 кг × 12, 4 раунда в суперсете с нижним Хаммером. Блин сжимается ладонями, руки выпрямляются перед собой.', 1.0, 'manual'
FROM workout_sessions session
JOIN exercises exercise ON exercise.name = 'Жим Свенда'
WHERE session.local_date = '2026-08-24' AND session.source_ref = 'telegram:2026-08-24:user_report';

INSERT INTO workout_session_exercises(
  session_id, exercise_id, position, source_position, raw_text, match_confidence, match_status, notes
)
SELECT session.id, exercise.id, 4, 3,
       'Сведение в кроссовере с акцентом на верх груди: 20 кг, 4×15.', 1.0, 'manual',
       'Вес сохранен как показание тренажера; сторона или суммарный вес не уточнялись.'
FROM workout_sessions session
JOIN exercises exercise ON exercise.name = 'Сведение рук в кроссовере на грудь'
WHERE session.local_date = '2026-08-24' AND session.source_ref = 'telegram:2026-08-24:user_report';

INSERT INTO workout_session_exercises(
  session_id, exercise_id, position, source_position, raw_text, match_confidence, match_status
)
SELECT session.id, exercise.id, 5, 4, 'Брусья: 3×10.', 1.0, 'manual'
FROM workout_sessions session
JOIN exercises exercise ON exercise.name = 'Отжимания на брусьях'
WHERE session.local_date = '2026-08-24' AND session.source_ref = 'telegram:2026-08-24:user_report';

INSERT INTO workout_session_exercises(
  session_id, exercise_id, position, source_position, raw_text, match_confidence, match_status
)
SELECT session.id, exercise.id, 6, 5, 'Махи гантелями сидя: 8 кг, 4×20.', 1.0, 'manual'
FROM workout_sessions session
JOIN exercises exercise ON exercise.name = 'Махи гантелями в стороны сидя'
WHERE session.local_date = '2026-08-24' AND session.source_ref = 'telegram:2026-08-24:user_report';

INSERT INTO set_logs(
  session_id, exercise_id, session_exercise_id, set_number, reps, weight_kg,
  set_type, load_basis, parent_set_number, performed_order, notes
)
SELECT occurrence.session_id, occurrence.exercise_id, occurrence.id,
       valueset.set_number, valueset.reps, valueset.weight_kg,
       valueset.set_type, 'per_side', valueset.parent_set_number, valueset.performed_order, valueset.notes
FROM workout_session_exercises occurrence
JOIN (
  SELECT 1 AS set_number, 12 AS reps, 30.0 AS weight_kg, 'working' AS set_type, NULL AS parent_set_number, 1 AS performed_order, NULL AS notes
  UNION ALL SELECT 2, 12, 35.0, 'working', NULL, 2, NULL
  UNION ALL SELECT 3, 12, 40.0, 'working', NULL, 3, NULL
  UNION ALL SELECT 4, 3, 45.0, 'working', NULL, 4, 'Сразу после подхода выполнен дроп.'
  UNION ALL SELECT 5, 3, 35.0, 'drop', 4, 5, 'Без отдыха после 45 кг × 3.'
) valueset
WHERE occurrence.session_id IN (
  SELECT id FROM workout_sessions WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report'
) AND occurrence.position = 1;

INSERT INTO set_logs(
  session_id, exercise_id, session_exercise_id, set_number, reps, weight_kg,
  set_type, load_basis, superset_round, performed_order
)
SELECT occurrence.session_id, occurrence.exercise_id, occurrence.id,
       rounds.round_number, 12, 40.0, 'working', 'per_side', rounds.round_number,
       5 + (rounds.round_number * 2 - 1)
FROM workout_session_exercises occurrence
JOIN (SELECT 1 AS round_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) rounds
WHERE occurrence.session_id IN (
  SELECT id FROM workout_sessions WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report'
) AND occurrence.position = 2;

INSERT INTO set_logs(
  session_id, exercise_id, session_exercise_id, set_number, reps, weight_kg,
  set_type, load_basis, superset_round, performed_order
)
SELECT occurrence.session_id, occurrence.exercise_id, occurrence.id,
       rounds.round_number, 12, 5.0, 'working', 'total', rounds.round_number,
       5 + (rounds.round_number * 2)
FROM workout_session_exercises occurrence
JOIN (SELECT 1 AS round_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) rounds
WHERE occurrence.session_id IN (
  SELECT id FROM workout_sessions WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report'
) AND occurrence.position = 3;

INSERT INTO set_logs(
  session_id, exercise_id, session_exercise_id, set_number, reps, weight_kg,
  set_type, load_basis, performed_order
)
SELECT occurrence.session_id, occurrence.exercise_id, occurrence.id,
       sets.set_number, 15, 20.0, 'working', 'machine_display', 13 + sets.set_number
FROM workout_session_exercises occurrence
JOIN (SELECT 1 AS set_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) sets
WHERE occurrence.session_id IN (
  SELECT id FROM workout_sessions WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report'
) AND occurrence.position = 4;

INSERT INTO set_logs(
  session_id, exercise_id, session_exercise_id, set_number, reps, weight_kg,
  set_type, load_basis, performed_order
)
SELECT occurrence.session_id, occurrence.exercise_id, occurrence.id,
       sets.set_number, 10, NULL, 'working', 'bodyweight', 17 + sets.set_number
FROM workout_session_exercises occurrence
JOIN (SELECT 1 AS set_number UNION ALL SELECT 2 UNION ALL SELECT 3) sets
WHERE occurrence.session_id IN (
  SELECT id FROM workout_sessions WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report'
) AND occurrence.position = 5;

INSERT INTO set_logs(
  session_id, exercise_id, session_exercise_id, set_number, reps, weight_kg,
  set_type, load_basis, performed_order
)
SELECT occurrence.session_id, occurrence.exercise_id, occurrence.id,
       sets.set_number, 20, 8.0, 'working', 'per_dumbbell', 20 + sets.set_number
FROM workout_session_exercises occurrence
JOIN (SELECT 1 AS set_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4) sets
WHERE occurrence.session_id IN (
  SELECT id FROM workout_sessions WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report'
) AND occurrence.position = 6;

INSERT INTO cardio_logs(
  session_id, position, activity, duration_minutes, speed_value, speed_unit,
  incline_value, incline_unit, notes
)
SELECT id, 7, 'treadmill', 30, 5, 'machine_display', 8, 'machine_level',
       'Дорожка: 30 минут, высота 8, скорость 5; единицы на дисплее тренажера не уточнялись.'
FROM workout_sessions
WHERE local_date = '2026-08-24' AND source_ref = 'telegram:2026-08-24:user_report';
