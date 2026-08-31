export type TrainingFocus = "chest" | "back" | "legs";
export type TrainingLoadMode = "normal" | "reduced" | "deload";
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

export function reducedLoadRules(): string[] {
  return [
    "Это облегчённая тренировка из-за неполного восстановления: сохрани технику и не компенсируй состояние интенсивностью.",
    "Оставь не более пяти упражнений и не более трёх рабочих подходов в каждом.",
    "Не повышай рабочий вес, оставляй 2–3 повторения в запасе и исключи отказ, дроп-сеты и форсированные повторения.",
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

export function programmingRules(focus: TrainingFocus, emphasis: TrainingEmphasis, loadMode: TrainingLoadMode = "normal"): string[] {
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
  if (loadMode === "reduced") rules.push(...reducedLoadRules());
  if (loadMode === "deload") rules.push(...deloadRules());
  return rules;
}
