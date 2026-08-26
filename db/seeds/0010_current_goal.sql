INSERT INTO goal_periods(user_id, goal_type, description, starts_on)
SELECT id, 'recomposition', 'Снижение общей жировой массы с сохранением или постепенным набором мышц', '2026-08-26'
FROM users WHERE NOT EXISTS (SELECT 1 FROM goal_periods g WHERE g.user_id=users.id AND g.ends_on IS NULL);
