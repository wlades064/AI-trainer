PRAGMA foreign_keys = ON;

INSERT INTO equipment_items (
  user_id, category, user_label, canonical_name, description, details_json
)
SELECT id, 'attachment', 'подкова', 'рукоять для кроссовера',
       'Пользовательское название; преимущественно используется для бицепса и трицепса.', '{}'
FROM users
WHERE 1 = 1
ON CONFLICT(user_id, user_label) DO UPDATE SET
  category = excluded.category,
  canonical_name = excluded.canonical_name,
  description = excluded.description,
  details_json = excluded.details_json,
  active = 1;

INSERT INTO equipment_items (
  user_id, category, user_label, canonical_name, description, details_json
)
SELECT id, 'attachment', 'яйца', 'канатная рукоять',
       'Пользовательское название канатной рукояти.', '{}'
FROM users
WHERE 1 = 1
ON CONFLICT(user_id, user_label) DO UPDATE SET
  category = excluded.category,
  canonical_name = excluded.canonical_name,
  description = excluded.description,
  details_json = excluded.details_json,
  active = 1;

INSERT INTO equipment_items (
  user_id, category, user_label, canonical_name, description, details_json
)
SELECT id, 'attachment', label, 'вариант рукояти «краб»',
       'Пользовательский вариант рукояти семейства «краб».', json_object('family', 'краб', 'variant', variant)
FROM users
CROSS JOIN (
  SELECT 'краб широкий прямой' AS label, 'широкий прямой' AS variant
  UNION ALL SELECT 'краб средний прямой', 'средний прямой'
  UNION ALL SELECT 'краб узкий прямой', 'узкий прямой'
  UNION ALL SELECT 'краб обратный', 'обратный'
)
WHERE 1 = 1
ON CONFLICT(user_id, user_label) DO UPDATE SET
  category = excluded.category,
  canonical_name = excluded.canonical_name,
  description = excluded.description,
  details_json = excluded.details_json,
  active = 1;

INSERT INTO equipment_items (
  user_id, category, user_label, canonical_name, description, details_json
)
SELECT id, 'attachment', 'руль', 'рукоять для параллельной тяги',
       'Рукоять для параллельной тяги, немного шире узкого хвата.', '{}'
FROM users
WHERE 1 = 1
ON CONFLICT(user_id, user_label) DO UPDATE SET
  category = excluded.category,
  canonical_name = excluded.canonical_name,
  description = excluded.description,
  details_json = excluded.details_json,
  active = 1;

UPDATE imported_documents
SET review_notes_json = json_object(
  'clarified_at', '2026-08-25',
  'exercise_clarifications', json_array(
    'Вращение гантелей: руки с гантелями отводятся в стороны, затем над собой, затем перед собой; 10 повторов в одном направлении и 10 обратно.',
    'Отжимание от 3 уровня: гриф на третьем уровне силовой рамы, ноги на полу, таз немного приподнят, руки держат гриф.'
  ),
  'equipment_terms_confirmed', 1
)
WHERE filename = 'Понедельник.docx';

UPDATE imported_documents
SET review_notes_json = json_object(
  'clarified_at', '2026-08-25',
  'equipment_terms_confirmed', 1
)
WHERE filename = 'Среда.docx';

UPDATE imported_documents
SET review_notes_json = json_object(
  'clarified_at', '2026-08-25',
  'exercise_clarifications', json_array(
    'Сведение ровным темпом 80 фунтов: приведение бедра.',
    'Разгибание голени сидя: обычное разгибание ног сидя в тренажёре на квадрицепс; сейчас переносится коленями нормально, но без больших весов и с контролем симптомов.'
  ),
  'equipment_terms_confirmed', 1
)
WHERE filename = 'Пятница.docx';
