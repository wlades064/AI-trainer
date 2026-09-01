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

export interface AutomaticRecoveryAssessment {
  decision: RecoveryLoadDecision;
  trigger: "none" | "reactive" | "planned" | "safety";
  reasons: string[];
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

function poorCheckin(checkin: RecentRecoveryCheckin): boolean {
  return (checkin.effort !== null && checkin.effort >= 9)
    || (checkin.wellbeing !== null && checkin.wellbeing <= 2)
    || checkin.painReported
    || checkin.techniqueStable === false;
}

export function assessAutomaticRecovery(input: AutomaticRecoveryInput): AutomaticRecoveryAssessment {
  const safetyReasons = [
    input.illnessActive ? "активная болезнь" : null,
    input.readiness.hasNewSwelling ? "новый отёк" : null,
    input.readiness.hasInstability ? "нестабильность сустава" : null,
    input.readiness.feelsUnwell ? "плохое общее самочувствие" : null,
    input.readiness.pain >= 7 ? "сильная боль" : null,
  ].filter((reason): reason is string => reason !== null);
  if (safetyReasons.length) return { decision: "stop", trigger: "safety", reasons: safetyReasons };

  if (input.scheduledDeloadActive) {
    return { decision: "deload", trigger: "planned", reasons: ["активна запланированная разгрузочная неделя"] };
  }

  const acuteReasons = [
    input.readiness.sleepQuality <= 2 ? "низкое качество сна" : null,
    input.readiness.energy <= 2 ? "низкая энергия" : null,
    input.readiness.pain >= 4 ? "заметная текущая боль" : null,
  ].filter((reason): reason is string => reason !== null);
  const poorRecentCount = input.recentCheckins.slice(0, 2).filter(poorCheckin).length;
  const accumulatedReasons = [
    input.consecutivePerformanceDeclines >= 2 ? "результаты снизились на двух последовательных тренировках" : null,
    poorRecentCount >= 2 ? "два последних послетренировочных чекина указывают на плохое восстановление" : null,
  ].filter((reason): reason is string => reason !== null);

  if (input.completedHardWeeks >= 6) {
    return { decision: "deload", trigger: "planned", reasons: ["завершено шесть тяжёлых недель без разгрузки"] };
  }
  if (input.completedHardWeeks >= 4 && (acuteReasons.length >= 2 || accumulatedReasons.length >= 1)) {
    return { decision: "deload", trigger: "reactive", reasons: [...acuteReasons, ...accumulatedReasons] };
  }
  const reducedReasons = [
    ...acuteReasons,
    ...accumulatedReasons,
    ...(poorRecentCount === 1 ? ["последний послетренировочный чекин указывает на неполное восстановление"] : []),
    ...(input.completedHardWeeks >= 4 ? ["завершено не менее четырёх тяжёлых недель"] : []),
    ...(input.postIllnessPhase ? [`возврат после болезни, этап ${input.postIllnessPhase}`] : []),
  ];
  if (reducedReasons.length) return { decision: "reduced", trigger: "reactive", reasons: reducedReasons };
  return { decision: "normal", trigger: "none", reasons: [] };
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
