PRAGMA foreign_keys = ON;

INSERT INTO injury_episodes(user_id, body_area, status, description, avoid_json, starts_on)
SELECT id, 'колени', 'recovering',
       'Колени ранее травмированы. Не использовать большие веса; коленно-доминантные упражнения возвращать постепенно, отслеживая боль, отек, нестабильность и реакцию после тренировки.',
       '[]', '2026-08-25'
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM injury_episodes episode
  WHERE episode.user_id = users.id AND episode.body_area = 'колени' AND episode.status IN ('active', 'recovering')
);

INSERT INTO injury_episodes(user_id, body_area, status, description, avoid_json, starts_on)
SELECT id, 'голеностопы', 'recovering',
       'Нагрузка возможна осторожно с контролем реакции, устойчивости и боли.',
       '[]', '2026-08-25'
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM injury_episodes episode
  WHERE episode.user_id = users.id AND episode.body_area = 'голеностопы' AND episode.status IN ('active', 'recovering')
);
