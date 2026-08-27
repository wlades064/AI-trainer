export interface ReviewWindow {
  workouts: number;
  focusCounts: Record<string, number>;
  nutritionDays: number;
  caloriesKcal: number | null;
  proteinG: number | null;
  readinessDays: number;
  sleepMinutes: number | null;
  sleepQuality: number | null;
  energy: number | null;
  readinessPain: number | null;
  blockedReadiness: number;
  recoveryCheckins: number;
  effort: number | null;
  wellbeing: number | null;
  painReports: number;
}

export interface ReviewInput {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  current: ReviewWindow;
  previous: ReviewWindow;
  weights: Array<{ date: string; value: number }>;
}

function number(value: number | null, digits = 0): string {
  return value === null ? "—" : value.toFixed(digits).replace(".", ",");
}

function delta(current: number, previous: number): string {
  const value = current - previous;
  return `${value > 0 ? "+" : ""}${value}`;
}

export function formatProgressReview(input: ReviewInput): string {
  const { current, previous } = input;
  const focuses: Record<string, string> = { chest: "грудь", back: "спина", legs: "ноги", rest: "восстановление" };
  const focusText = Object.entries(current.focusCounts).filter(([, count]) => count > 0)
    .map(([focus, count]) => `${focuses[focus] ?? focus}: ${count}`).join(", ") || "нет";
  const lines = [
    `Итоги за 28 дней: ${input.currentStart} — ${input.currentEnd}`,
    "",
    `Тренировки: ${current.workouts} (${delta(current.workouts, previous.workouts)} к предыдущим 28 дням)` ,
    `• по группам: ${focusText}`,
    `Питание: ${current.nutritionDays}/28 дней записано${previous.nutritionDays ? `; ранее ${previous.nutritionDays}/28` : ""}`,
    `• среднее: ${number(current.caloriesKcal)} ккал; белок ${number(current.proteinG, 1)} г`,
    `Готовность: ${current.readinessDays} чекинов; сон ${number(current.sleepMinutes === null ? null : current.sleepMinutes / 60, 1)} ч; качество ${number(current.sleepQuality, 1)}/5; энергия ${number(current.energy, 1)}/5; боль ${number(current.readinessPain, 1)}/10`,
    `Послетренировочно: ${current.recoveryCheckins} чекинов; тяжесть ${number(current.effort, 1)}/10; самочувствие ${number(current.wellbeing, 1)}/5; сообщений о боли ${current.painReports}`,
  ];

  if (input.weights.length >= 2) {
    const first = input.weights[0]; const last = input.weights[input.weights.length - 1];
    const change = last.value - first.value;
    lines.push(`Вес: ${first.value} → ${last.value} кг (${change > 0 ? "+" : ""}${number(change, 1)} кг)`);
  } else if (input.weights.length === 1) lines.push(`Вес: одна запись ${input.weights[0].value} кг — тренд пока не определяется.`);
  else lines.push("Вес: за 56 дней записей нет — тренд не определяется.");

  const observations: string[] = [];
  if (current.nutritionDays < 14) observations.push("Для анализа влияния питания нужно хотя бы 14 заполненных дней из 28.");
  if (current.readinessDays < Math.min(3, Math.max(1, current.workouts))) observations.push("Данных сна и готовности пока мало для устойчивого вывода о восстановлении.");
  if (current.recoveryCheckins < current.workouts) observations.push("Не у всех тренировок заполнен послетренировочный чекин, поэтому нагрузка оценивается неполно.");
  if (current.painReports > 0 || current.blockedReadiness > 0) observations.push("В периоде отмечались боль или блокировка готовности; прогрессию нагрузки нужно оценивать консервативно.");
  if (!observations.length) observations.push("Данных достаточно для наблюдения за динамикой; причинно-следственные выводы бот не выдумывает.");
  lines.push("", "Что учитывать:", ...observations.map((item) => `• ${item}`));
  return lines.join("\n");
}
