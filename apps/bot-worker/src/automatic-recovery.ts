import type { GeneratedWorkout } from "./gemini.ts";

export type RecoveryLoadDecision = "normal" | "reduced" | "deload" | "stop";

export interface RecentRecoveryCheckin {
  effort: number | null;
  rir: number | null;
  wellbeing: number | null;
  painReported: boolean;
  techniqueStable: boolean | null;
}

export interface AutomaticRecoveryInput {
  readiness: {
    sleepQuality: number;
    energy: number;
    pain: number;
    hasNewSwelling: boolean;
    hasInstability: boolean;
    feelsUnwell: boolean;
  };
  illnessActive: boolean;
  postIllnessPhase: 1 | 2 | null;
  scheduledDeloadActive: boolean;
  completedHardWeeks: number;
  consecutivePerformanceDeclines: number;
  recentCheckins: RecentRecoveryCheckin[];
}

export interface RecoverySafetyAssessment {
  allowed: boolean;
  reasons: string[];
}

export function assessRecoverySafety(input: AutomaticRecoveryInput): RecoverySafetyAssessment {
  const reasons = [
    input.illnessActive ? "активная болезнь" : null,
    input.readiness.hasNewSwelling ? "новый отёк" : null,
    input.readiness.hasInstability ? "нестабильность сустава" : null,
    input.readiness.feelsUnwell ? "плохое общее самочувствие" : null,
    input.readiness.pain >= 7 ? "сильная боль" : null,
  ].filter((reason): reason is string => reason !== null);
  return { allowed: reasons.length === 0, reasons };
}

export function compactRecoveryContext(input: AutomaticRecoveryInput): string {
  const postIllness = input.postIllnessPhase === null ? "нет" : `этап ${input.postIllnessPhase}`;
  const checkins = input.recentCheckins.length
    ? input.recentCheckins.map((checkin, index) => [
      `${index + 1}: усилие ${checkin.effort ?? "?"}/10`,
      `RIR ${checkin.rir ?? "?"}`,
      `самочувствие ${checkin.wellbeing ?? "?"}/5`,
      `боль ${checkin.painReported ? "да" : "нет"}`,
      `техника ${checkin.techniqueStable === null ? "?" : checkin.techniqueStable ? "стабильна" : "нестабильна"}`,
    ].join(", ")).join("; ")
    : "нет";
  return [
    `сон: качество ${input.readiness.sleepQuality}/5`,
    `энергия: ${input.readiness.energy}/5`,
    `боль: ${input.readiness.pain}/10`,
    `после болезни: ${postIllness}`,
    `запланированная разгрузка: ${input.scheduledDeloadActive ? "да" : "нет"}`,
    `завершено тяжёлых недель: ${input.completedHardWeeks}`,
    `снижений результата подряд: ${input.consecutivePerformanceDeclines}`,
    `последние послетренировочные чекины: ${checkins}`,
  ].join("; ");
}

export function applyRecoveryLoadGuard(
  workout: GeneratedWorkout,
  decision: RecoveryLoadDecision,
): GeneratedWorkout {
  if (decision === "stop") throw new Error("Тренировка остановлена безопасностным решением");
  if (decision === "normal") return workout;
  const reduced = decision === "reduced";
  return {
    ...workout,
    exercises: workout.exercises.slice(0, reduced ? 5 : 4).map((exercise) => ({
      ...exercise,
      sets: reduced ? Math.min(exercise.sets, 3) : Math.max(1, Math.floor(exercise.sets * 0.6)),
      weightGuidance: reduced
        ? "Не выше последнего подтверждённого рабочего веса; оставляй RIR 2–3."
        : "80–90% последнего подтверждённого рабочего веса; оставляй RIR 3–5.",
      notes: reduced
        ? "Контролируемая техника; без отказа, дроп-сетов, форсированных повторений и повышения веса."
        : "Разгрузочное выполнение; без отказа, интенсификаторов, акцентированных негативов и новых сложных упражнений.",
    })),
    safetyNotes: [
      ...workout.safetyNotes,
      reduced
        ? "Нагрузка автоматически снижена кодом из-за признаков неполного восстановления."
        : "Объём и интенсивность автоматически ограничены кодом на период разгрузки.",
    ],
  };
}
