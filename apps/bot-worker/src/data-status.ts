export interface DataStatusSnapshot {
  today: string;
  goal: { type: string; description: string | null } | null;
  workouts: { latestDate: string | null; count28: number };
  nutrition: { latestDate: string | null; count7: number; count28: number; source: string | null };
  weight: { latestDate: string | null; valueKg: number | null };
  measurements: { latestDate: string | null };
  readiness: { latestDate: string | null; count28: number };
  injuries: { active: number; recovering: number };
  activeSupplements: number;
  labs: { latestDate: string | null; activeCount: number };
  wearable: { latestDate: string | null; metricCount: number };
  activeConnections: number;
}

const GOALS: Record<string, string> = {
  fat_loss: "снижение жира",
  muscle_gain: "набор мышечной массы",
  recomposition: "рекомпозиция: снижение жира и набор мышц",
  maintenance: "поддержание формы",
  recovery: "восстановление",
};

const SOURCES: Record<string, string> = {
  fatsecret_user_export: "экспорт FatSecret",
  fatsecret_screenshot: "скриншот FatSecret",
  telegram_manual: "Telegram",
  telegram_emergency: "резервный ввод Telegram",
};

export function calendarAge(today: string, date: string | null): number | null {
  if (!date) return null;
  const current = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  const observed = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(current) || !Number.isFinite(observed)) return null;
  return Math.max(0, Math.round((current - observed) / 86_400_000));
}

function dated(date: string | null, today: string): string {
  if (!date) return "нет данных";
  const age = calendarAge(today, date);
  if (age === 0) return `${date} (сегодня)`;
  if (age === 1) return `${date} (вчера)`;
  return `${date} (${age ?? "?"} дн. назад)`;
}

export function formatDataStatus(value: DataStatusSnapshot): string {
  const goal = value.goal ? (value.goal.description || GOALS[value.goal.type] || value.goal.type) : "не задана";
  const nutritionSource = value.nutrition.source ? `; источник: ${SOURCES[value.nutrition.source] ?? value.nutrition.source}` : "";
  const injuryTotal = value.injuries.active + value.injuries.recovering;
  const lines = [
    `Пульс данных на ${value.today}:`,
    "",
    `• цель: ${goal}`,
    `• тренировки: ${value.workouts.count28} за 28 дней; последняя — ${dated(value.workouts.latestDate, value.today)}`,
    `• питание: ${value.nutrition.count7}/7 дней и ${value.nutrition.count28}/28 дней; последнее — ${dated(value.nutrition.latestDate, value.today)}${nutritionSource}`,
    `• вес: ${value.weight.valueKg === null ? "нет данных" : `${value.weight.valueKg} кг; ${dated(value.weight.latestDate, value.today)}`}`,
    `• объёмы тела: ${dated(value.measurements.latestDate, value.today)}`,
    `• сон и готовность: ${value.readiness.count28} чекинов за 28 дней; последний — ${dated(value.readiness.latestDate, value.today)}`,
    `• травмы: ${injuryTotal ? `активных ${value.injuries.active}, восстанавливающихся ${value.injuries.recovering}` : "активных ограничений нет"}`,
    `• добавки: активных ${value.activeSupplements}`,
    `• анализы: ${value.labs.activeCount} показателей; последние — ${dated(value.labs.latestDate, value.today)}`,
    `• носимые показатели: ${value.wearable.metricCount ? `${value.wearable.metricCount} типов; последние — ${dated(value.wearable.latestDate, value.today)}` : "данных пока нет"}`,
    `• внешние подключения: активных ${value.activeConnections}`,
  ];

  const actions: string[] = [];
  if (!value.goal) actions.push("задать актуальную цель через /goal");
  if (value.workouts.count28 === 0) actions.push("сохранить первую фактически выполненную тренировку");
  if (value.nutrition.count7 < 4) actions.push("набрать хотя бы 4 подтверждённых дня питания за последние 7 дней");
  const weightAge = calendarAge(value.today, value.weight.latestDate);
  if (weightAge === null || weightAge > 10) actions.push("обновить вес в FatSecret и импортировать его разрешённым способом");
  const measurementsAge = calendarAge(value.today, value.measurements.latestDate);
  if (measurementsAge === null || measurementsAge > 40) actions.push("сделать одинаковые контрольные замеры через /measure");
  lines.push("", "Что сейчас улучшит точность:", ...(actions.length ? actions.map((item) => `• ${item}`) : ["• базовых данных достаточно; продолжай регулярный ввод без дублирования"]));
  lines.push("", "Это проверка полноты данных, а не медицинская интерпретация. Gemini не использовался.");
  return lines.join("\n");
}
