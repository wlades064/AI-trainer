PRAGMA foreign_keys = ON;

INSERT INTO equipment_items (
  user_id, category, user_label, canonical_name, description, details_json
)
SELECT id, 'machine', 'колодец', 'тренажер для поясного приседа (belt squat)',
       'Платформа со стойками, поясом и цепью; блины устанавливаются на ось тренажера.',
       json_object(
         'setup', json_array('встать на платформу', 'пристегнуть цепь к поясу', 'держаться за стойки'),
         'loading', 'блины на оси',
         'movement', 'глубокие приседания'
       )
FROM users
WHERE 1 = 1
ON CONFLICT(user_id, user_label) DO UPDATE SET
  category = excluded.category,
  canonical_name = excluded.canonical_name,
  description = excluded.description,
  details_json = excluded.details_json,
  active = 1;

DELETE FROM exercise_risk_tags
WHERE exercise_id = (SELECT id FROM exercises WHERE name = 'Приседания в колодце')
  AND risk_tag = 'axial_load';

INSERT OR IGNORE INTO exercise_risk_tags(exercise_id, risk_tag)
SELECT id, 'deep_knee_flexion' FROM exercises WHERE name = 'Приседания в колодце';

INSERT INTO exercise_reintroduction_plans(
  user_id, exercise_id, status, load_policy, monitoring_json, notes
)
SELECT users.id, exercises.id, 'planned',
       'Начать с небольшого веса; увеличивать только по реакции и не автоматически.',
       json_array('ощущения в коленях во время подхода', 'боль', 'отек', 'нестабильность', 'реакция после тренировки'),
       'Постепенное внедрение по решению владельца.'
FROM users
CROSS JOIN exercises
WHERE exercises.name IN (
  'Приседания в маятниковом гакке лицом к спинке',
  'Приседания в маятниковом гакке спиной к спинке',
  'Жим ногами со средней постановкой ног',
  'Жим ногами с высокой постановкой ног',
  'Жим ногой в тренажере по одной ноге',
  'Приседания в колодце',
  'Приседания с собственным весом с пятками на подиуме и неполным подъемом'
)
ON CONFLICT(user_id, exercise_id) DO UPDATE SET
  status = excluded.status,
  load_policy = excluded.load_policy,
  monitoring_json = excluded.monitoring_json,
  notes = excluded.notes,
  updated_at = CURRENT_TIMESTAMP;
