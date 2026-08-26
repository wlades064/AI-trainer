export type TrainingFocus = "chest" | "back" | "legs";
export type TrainingEmphasis =
  | "upper_chest"
  | "lower_chest"
  | "lats"
  | "trapezius_rhomboids"
  | "quadriceps"
  | "posterior_chain";

const EMPHASIS_BY_FOCUS: Record<TrainingFocus, readonly TrainingEmphasis[]> = {
  chest: ["upper_chest", "lower_chest"],
  back: ["lats", "trapezius_rhomboids"],
  legs: ["quadriceps", "posterior_chain"],
};

export function nextEmphasis(
  focus: TrainingFocus,
  lastCompleted: TrainingEmphasis | null,
  initialWhenUnknown: TrainingEmphasis,
): TrainingEmphasis {
  const cycle = EMPHASIS_BY_FOCUS[focus];
  if (!cycle.includes(initialWhenUnknown)) throw new Error("Начальный акцент не относится к выбранной группе");
  if (lastCompleted === null) return initialWhenUnknown;
  const currentIndex = cycle.indexOf(lastCompleted);
  if (currentIndex < 0) throw new Error("Последний акцент не относится к выбранной группе");
  return cycle[(currentIndex + 1) % cycle.length];
}

export function pullUpVariant(emphasis: TrainingEmphasis): "широким хватом" | "узким параллельным хватом" {
  if (emphasis === "trapezius_rhomboids") return "широким хватом";
  if (emphasis === "lats") return "узким параллельным хватом";
  throw new Error("Вариант подтягиваний определяется только для тренировки спины");
}

export interface ProgressionObservation {
  completedReps: number[];
  targetMinReps: number;
  targetMaxReps: number;
  targetRirReached: boolean;
  techniqueStable: boolean;
  jointPain: boolean;
}

export type ProgressionDecision = "increase_load" | "increase_reps" | "hold" | "reduce_or_replace";

export interface DeloadAssessmentInput {
  completedHardWeeksSinceRecovery: number;
  consecutivePerformanceDeclines: number;
  fatigue: number;
  sleepQuality: number;
  motivation: number;
  sorenessHours: number;
  worseningJointPain: boolean;
  newSwelling: boolean;
  jointInstability: boolean;
  recoveryBreakDays: number;
  feelsRecoveredAfterBreak: boolean;
}

export type DeloadDecision = "normal" | "monitor" | "deload" | "stop_and_review";

export interface DeloadAssessment {
  decision: DeloadDecision;
  trigger: "none" | "planned" | "reactive" | "safety" | "recovery_already_taken";
  reasons: string[];
}

function validScale(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function assessDeload(input: DeloadAssessmentInput): DeloadAssessment {
  if (!Number.isInteger(input.completedHardWeeksSinceRecovery) || input.completedHardWeeksSinceRecovery < 0
    || !Number.isInteger(input.consecutivePerformanceDeclines) || input.consecutivePerformanceDeclines < 0
    || !Number.isFinite(input.sorenessHours) || input.sorenessHours < 0
    || !Number.isFinite(input.recoveryBreakDays) || input.recoveryBreakDays < 0
    || !validScale(input.fatigue) || !validScale(input.sleepQuality) || !validScale(input.motivation)) {
    throw new Error("Некорректные данные оценки разгрузки");
  }
  if (input.newSwelling || input.jointInstability) {
    return {
      decision: "stop_and_review",
      trigger: "safety",
      reasons: [input.newSwelling ? "новый отёк" : "нестабильность сустава"],
    };
  }
  if (input.recoveryBreakDays >= 5 && input.feelsRecoveredAfterBreak) {
    return {
      decision: "normal",
      trigger: "recovery_already_taken",
      reasons: ["уже был восстановительный перерыв не менее пяти дней и готовность нормализовалась"],
    };
  }
  const fatigueSignals: string[] = [];
  if (input.consecutivePerformanceDeclines >= 2) fatigueSignals.push("результаты снизились минимум на двух последовательных тренировках");
  if (input.fatigue >= 4) fatigueSignals.push("высокая субъективная усталость");
  if (input.sleepQuality <= 2) fatigueSignals.push("ухудшение сна");
  if (input.motivation <= 2) fatigueSignals.push("заметное снижение желания тренироваться");
  if (input.sorenessHours >= 72) fatigueSignals.push("мышечная болезненность сохраняется не менее 72 часов");
  if (input.worseningJointPain) fatigueSignals.push("усиливается суставная боль");

  if (fatigueSignals.length >= 2 || (input.completedHardWeeksSinceRecovery >= 4 && fatigueSignals.length >= 1)) {
    return { decision: "deload", trigger: "reactive", reasons: fatigueSignals };
  }
  if (input.completedHardWeeksSinceRecovery >= 6) {
    return { decision: "deload", trigger: "planned", reasons: ["завершено шесть тяжёлых тренировочных недель без разгрузки"] };
  }
  if (input.completedHardWeeksSinceRecovery >= 4 || fatigueSignals.length === 1) {
    return {
      decision: "monitor",
      trigger: "none",
      reasons: fatigueSignals.length ? fatigueSignals : ["достигнуто окно плановой проверки после четырёх недель"],
    };
  }
  return { decision: "normal", trigger: "none", reasons: [] };
}

export const DELOAD_PRESCRIPTION = {
  durationDays: 7,
  normalVolumeFraction: [0.45, 0.6] as const,
  normalLoadFraction: [0.8, 0.9] as const,
  targetRir: [3, 5] as const,
  maintainNormalFrequencyWhenRecovered: true,
  removeFailureAndIntensifiers: true,
} as const;

export function deloadRules(): string[] {
  return [
    "Это разгрузочная тренировка: цель — снизить накопленную усталость, а не установить рекорд.",
    "Сохрани знакомые основные движения, если они не вызывают боль; не добавляй сложные новые упражнения.",
    "Оставь примерно 45–60% обычного объёма подходов и ориентировочно 80–90% привычного рабочего веса.",
    "Оставляй 3–5 повторений в запасе; исключи отказ, дроп-сеты, форсированные повторения, многоповторные добивки и акцентированные негативы.",
    "Сократи или убери второстепенные упражнения и используй освободившееся время для техники и спокойного восстановления.",
  ];
}

export function decideProgression(observation: ProgressionObservation): ProgressionDecision {
  if (observation.completedReps.length === 0) return "hold";
  if (observation.jointPain || !observation.techniqueStable) return "reduce_or_replace";
  if (observation.completedReps.every((reps) => reps >= observation.targetMaxReps) && observation.targetRirReached) {
    return "increase_load";
  }
  if (observation.completedReps.every((reps) => reps >= observation.targetMaxReps)) return "hold";
  if (observation.completedReps.every((reps) => reps >= observation.targetMinReps)) return "increase_reps";
  return "hold";
}

export function programmingRules(focus: TrainingFocus, emphasis: TrainingEmphasis, loadMode: "normal" | "deload" = "normal"): string[] {
  const rules = [
    `Текущий акцент: ${emphasis}.`,
    "Акцент меняется только после фактически выполненной тренировки этой группы; пропуск календарного дня цикл не переключает.",
    "Не усредняй и не выбирай случайно упражнения из истории. Сохраняй основные движения блока и меняй их только по обоснованной причине.",
    "Используй двойную прогрессию: сначала повторения в заданном диапазоне, затем минимальный доступный шаг веса.",
    "Даже при достижении верхней границы повторений не повышай вес, если последние подходы были с RIR 0; сначала добейся целевого запаса и стабильной техники.",
    "Не увеличивай нагрузку при суставной боли, ухудшении техники или незавершённом объёме.",
    "Сформируй внутреннее обоснование выбора упражнений и прогрессии, но не включай его в сообщение пользователю.",
  ];
  if (focus === "back") rules.push(`Подтягивания указывай только с конкретным хватом; для этого акцента: ${pullUpVariant(emphasis)}.`);
  if (loadMode === "deload") rules.push(...deloadRules());
  return rules;
}
