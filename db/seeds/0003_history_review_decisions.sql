PRAGMA foreign_keys = ON;

UPDATE imported_workout_lines
SET match_status = 'confirmed',
    review_note = CASE
      WHEN local_date = '2025-11-21' AND position = 5 THEN 'Владелец подтвердил: плечевой Хаммер.'
      WHEN local_date = '2025-12-17' AND position = 1 THEN 'Если высокая постановка не указана, жим выполнялся с постановкой на квадрицепс.'
      WHEN local_date = '2025-12-26' AND position = 2 THEN 'Аналог румынской тяги в колодце; больше не выполнять из-за сильной нагрузки на поясницу, использовать обычную румынскую тягу.'
      WHEN local_date = '2025-12-21' AND position = 6 THEN 'Рукоять не запомнилась; по оценке владельца, вероятнее всего использовалась канатная рукоять «яйца».'
      WHEN local_date = '2026-01-22' AND position = 3 THEN 'Владелец подтвердил: Хаммер на низ груди.'
      WHEN local_date = '2026-01-21' AND position = 3 THEN 'Владелец подтвердил: тяга выполнялась сидя на полу.'
      WHEN normalized_text LIKE '%махи гантел%' THEN 'Если положение не указано, владелец подтвердил выполнение стоя.'
      WHEN normalized_text LIKE '%верхняя постановка%' THEN 'Высокая/верхняя постановка указана явно и относится к задней поверхности бедра.'
      ELSE 'Подтверждено владельцем 2026-08-25.'
    END,
    reviewed_at = '2026-08-25T00:00:00+04:00'
WHERE (
  imported_document_id = (SELECT id FROM imported_documents WHERE filename = 'Пятница.docx')
  AND (
       (local_date = '2025-11-21' AND position = 5)
    OR (local_date = '2025-12-17' AND position = 1)
    OR (local_date = '2025-12-26' AND position = 2)
    OR (local_date = '2026-01-30' AND position IN (5, 6))
    OR (local_date = '2026-05-22' AND position = 6)
  )
)
OR (
  imported_document_id = (SELECT id FROM imported_documents WHERE filename = 'Понедельник.docx')
  AND (
       (local_date = '2025-12-21' AND position = 6)
    OR (local_date = '2026-01-19' AND position IN (2, 3, 5))
    OR (local_date = '2026-01-22' AND position = 3)
    OR (local_date = '2026-04-21' AND position = 4)
  )
)
OR (
  imported_document_id = (SELECT id FROM imported_documents WHERE filename = 'Среда.docx')
  AND local_date = '2026-01-21' AND position = 3
);

UPDATE imported_line_candidates
SET review_status = 'confirmed'
WHERE line_id IN (
  SELECT id FROM imported_workout_lines WHERE reviewed_at = '2026-08-25T00:00:00+04:00'
);
