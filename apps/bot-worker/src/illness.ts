import type { GeneratedWorkout } from "./gemini.ts";

export type IllnessAction = "start" | "recover";
export type PostIllnessPhase = 1 | 2;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function parseIllnessAction(text: string): IllnessAction | null {
  const value = text.trim().toLocaleLowerCase("ru-RU");
  if (["заболел", "заболела", "болею"].includes(value)) return "start";
  if (["выздоровел", "выздоровела", "здоров"].includes(value)) return "recover";
  return null;
}

export function parseIllnessDate(text: string, today: string): string | null {
  const value = text.trim().toLocaleLowerCase("ru-RU");
  const date = value === "сегодня" ? today : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return date <= today && date >= addDays(today, -90) ? date : null;
}

export function postIllnessPhase(completedSessions: number): PostIllnessPhase | null {
  if (!Number.isInteger(completedSessions) || completedSessions < 0) throw new Error("Некорректное число тренировок после болезни");
  if (completedSessions === 0) return 1;
  if (completedSessions === 1) return 2;
  return null;
}

export function postIllnessRules(phase: PostIllnessPhase): string[] {
  if (phase === 1) return [
    "Это первая фактически выполняемая тренировка после болезни. Оцени сон, энергию, симптомы, длительность перерыва и последние тренировки вместе.",
    "Самостоятельно выбери reduced или deload и объясни выбор в recoveryRationale. Обычная прогрессия и попытка наверстать пропуск не являются целью возвращения.",
    "Подбери объём, интенсивность и запас повторений согласно выбранному режиму. Исключи отказ, дроп-сеты, форсированные повторения, добивки и акцентированные негативы.",
    "При боли в груди, необычной одышке, головокружении, сердцебиении или ухудшении самочувствия прекрати тренировку.",
  ];
  return [
    "Это вторая фактически выполняемая тренировка после болезни. Учти результат и послетренировочное самочувствие предыдущей тренировки возвращения.",
    "Самостоятельно выбери normal, reduced или deload по совокупности фактов. Не повышай нагрузку только из-за номера фазы.",
    "Подбери объём, интенсивность и запас повторений согласно выбранному режиму. Исключи отказ, дроп-сеты и форсированные повторения.",
    "При боли в груди, необычной одышке, головокружении, сердцебиении или ухудшении самочувствия прекрати тренировку.",
  ];
}

export function applyPostIllnessSafetyGuard(workout: GeneratedWorkout, phase: PostIllnessPhase): GeneratedWorkout {
  const safety = "После болезни: при боли в груди, необычной одышке, головокружении, сердцебиении или ухудшении самочувствия прекрати тренировку и обратись за медицинской оценкой.";
  return {
    ...workout,
    title: workout.title.includes("возвращение после болезни")
      ? workout.title
      : `${workout.title} (возвращение после болезни, фаза ${phase})`,
    safetyNotes: workout.safetyNotes.includes(safety) ? workout.safetyNotes : [...workout.safetyNotes, safety],
  };
}
