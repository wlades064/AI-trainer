import { decideProgression, type ProgressionDecision, type TrainingLoadMode } from "./domain/programming.ts";
import type { GeneratedWorkout } from "./gemini.ts";

export interface ExerciseProgressionInput {
  focus: string;
  date: string;
  name: string;
  targetSets: number | null;
  targetReps: string | null;
  actualSets: Array<{ reps: number; weightKg: number | null; loadBasis: string }>;
  reportStatus: "completed" | "partial" | "skipped" | "substituted" | null;
  replacementName: string | null;
  lastSetRir: number | null;
  techniqueStable: boolean | null;
  painReported: boolean;
  loadMode: TrainingLoadMode;
}

export interface ExerciseProgressionAssessment extends ExerciseProgressionInput {
  actualReps: number[];
  latestWeightKg: number | null;
  loadBasis: string | null;
  decision: ProgressionDecision;
  constraint: "hard" | "advisory";
  reason: string;
}

const DECISION_LABELS: Record<ProgressionDecision, string> = {
  increase_load: "разрешён минимальный шаг веса",
  increase_reps: "сначала добавить повторения",
  hold: "удерживать нагрузку",
  reduce_load: "снизить нагрузку",
  replace_exercise: "заменить упражнение",
};

const BASIS_LABELS: Record<string, string> = {
  per_side: "на сторону",
  per_dumbbell: "на гантель",
  machine_display: "по шкале тренажёра",
  total: "общий вес",
  bodyweight: "собственный вес",
  unknown: "тип веса не указан",
};

const FOCUS_LABELS: Record<string, string> = {
  chest: "грудь",
  back: "спина",
  legs: "ноги",
};

export function parseTargetRepRange(value: string | null): { minimum: number; maximum: number } | null {
  if (!value) return null;
  const normalized = value.trim().replace(/×/g, "x");
  const range = normalized.match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})$/);
  if (range) {
    const minimum = Number(range[1]); const maximum = Number(range[2]);
    return minimum > 0 && maximum >= minimum && maximum <= 100 ? { minimum, maximum } : null;
  }
  const single = normalized.match(/^(\d{1,2})$/);
  if (!single) return null;
  const reps = Number(single[1]);
  return reps > 0 ? { minimum: reps, maximum: reps } : null;
}

export function assessExerciseProgression(input: ExerciseProgressionInput): ExerciseProgressionAssessment {
  const actualSets = input.actualSets;
  const actualReps = actualSets.map((set) => set.reps);
  const referenceSets = input.targetSets && input.targetSets > 0 ? actualSets.slice(0, input.targetSets) : actualSets;
  const recordedBases = new Set(referenceSets.map((set) => set.loadBasis));
  const loadBasis = recordedBases.size === 1 ? referenceSets[0]?.loadBasis ?? null : null;
  const recordedWeights = new Set(referenceSets.map((set) => set.weightKg).filter((weight): weight is number => weight !== null));
  const latestWeightKg = recordedWeights.size === 1 ? [...recordedWeights][0] : null;
  const base = { ...input, actualReps, latestWeightKg, loadBasis };
  if (input.reportStatus === "substituted") {
    return input.replacementName
      ? { ...base, decision: "replace_exercise", constraint: "hard", reason: `в отчёте упражнение заменено на «${input.replacementName}»` }
      : { ...base, decision: "hold", constraint: "hard", reason: "замена не подтверждена" };
  }
  if (input.reportStatus === "skipped") return { ...base, decision: "hold", constraint: "hard", reason: "упражнение пропущено" };
  if (input.painReported) return { ...base, decision: "reduce_load", constraint: "hard", reason: "после тренировки указана боль или неприятные ощущения" };
  if (input.techniqueStable === false) return { ...base, decision: "reduce_load", constraint: "hard", reason: "техника в рабочих подходах была нестабильной" };
  if (input.reportStatus === "partial") return { ...base, decision: "hold", constraint: "hard", reason: "упражнение отмечено выполненным частично" };
  if (input.loadMode !== "normal") return {
    ...base,
    decision: "hold",
    constraint: "hard",
    reason: input.loadMode === "deload"
      ? "разгрузочная тренировка не используется для повышения нагрузки"
      : "облегчённая тренировка из-за восстановления не используется для повышения нагрузки",
  };
  if (input.techniqueStable === null) return { ...base, decision: "hold", constraint: "hard", reason: "стабильность техники не зафиксирована" };
  if (input.lastSetRir === null) return { ...base, decision: "hold", constraint: "hard", reason: "RIR последних рабочих подходов не зафиксирован" };
  if (input.lastSetRir <= 0) return { ...base, decision: "hold", constraint: "hard", reason: "верхняя граница достигнута, но RIR 0 запрещает повышение веса" };
  const range = parseTargetRepRange(input.targetReps);
  if (!range || !input.targetSets) return { ...base, decision: "hold", constraint: "hard", reason: "нет сопоставимого целевого диапазона плана" };
  if (actualReps.length < input.targetSets) return { ...base, decision: "hold", constraint: "hard", reason: `выполнено ${actualReps.length} из ${input.targetSets} рабочих подходов` };
  const comparedSets = referenceSets;
  if (comparedSets.some((set) => set.reps < range.minimum)) {
    return { ...base, decision: "hold", constraint: "hard", reason: `минимум ${range.minimum} повторений достигнут не во всех целевых подходах` };
  }
  const loadBases = new Set(comparedSets.map((set) => set.loadBasis));
  if (loadBases.size !== 1 || loadBases.has("unknown")) {
    return { ...base, decision: "hold", constraint: "hard", reason: "рабочие подходы имеют несопоставимый или неизвестный тип учёта веса" };
  }
  const comparedLoadBasis = comparedSets[0].loadBasis;
  if (comparedLoadBasis === "bodyweight") {
    const bodyweightLoads = new Set(comparedSets.map((set) => set.weightKg === null ? "bodyweight" : `added:${set.weightKg}`));
    if (bodyweightLoads.size !== 1) {
      return { ...base, decision: "hold", constraint: "hard", reason: "подходы со своим весом и добавочным весом нельзя объединять в одну прогрессию" };
    }
  } else {
    if (comparedSets.some((set) => set.weightKg === null)) {
      return { ...base, decision: "hold", constraint: "hard", reason: "вес указан не для всех целевых рабочих подходов" };
    }
    const weights = new Set(comparedSets.map((set) => set.weightKg));
    if (weights.size !== 1) return { ...base, decision: "hold", constraint: "advisory", reason: "целевые рабочие подходы выполнены с разным весом" };
  }
  const decision = decideProgression({
    completedReps: actualReps.slice(0, input.targetSets),
    targetMinReps: range.minimum,
    targetMaxReps: range.maximum,
    targetRirReached: input.lastSetRir >= 1,
    techniqueStable: true,
    jointPain: false,
  });
  const reason = decision === "increase_load"
    ? `все рабочие подходы достигли ${range.maximum} повторений при RIR ${input.lastSetRir}`
    : `выполнен диапазон от ${range.minimum}, но верхняя граница достигнута не во всех подходах`;
  return { ...base, decision, constraint: "advisory", reason };
}

function loadText(value: ExerciseProgressionAssessment): string {
  if (value.loadBasis === "bodyweight") return value.latestWeightKg === null
    ? "собственный вес"
    : `собственный вес + ${value.latestWeightKg} кг`;
  if (value.latestWeightKg === null) return "последний подтверждённый вес не указан";
  return `${value.latestWeightKg} кг ${BASIS_LABELS[value.loadBasis ?? "unknown"] ?? value.loadBasis ?? ""}`.trim();
}

export function progressionWeightGuidance(value: ExerciseProgressionAssessment): string {
  const base = loadText(value);
  if (value.decision === "increase_load") return `Разрешён только минимальный доступный шаг нагрузки относительно «${base}» при сохранении техники и RIR не ниже 1.`;
  if (value.decision === "increase_reps") return `Сохрани нагрузку «${base}» и сначала добавляй повторения в целевом диапазоне; вес не повышать.`;
  if (value.decision === "reduce_load") return `Снизить нагрузку относительно «${base}» до стабильной безболезненной техники; повышение веса запрещено.`;
  if (value.decision === "replace_exercise") return `Вместо исходного упражнения используй «${value.replacementName ?? "безопасный разрешённый аналог"}» с нагрузкой не выше «${base}»; повышение веса запрещено.`;
  return `Удерживай нагрузку не выше «${base}»; повышение веса пока не разрешено.`;
}

function factualSets(value: ExerciseProgressionAssessment): string {
  if (!value.actualSets.length) return "подходы не подтверждены";
  return value.actualSets.map((set) => {
    const load = set.loadBasis === "bodyweight"
      ? set.weightKg === null ? "свой вес" : `свой вес + ${set.weightKg} кг`
      : set.weightKg === null ? "вес не указан" : `${set.weightKg} кг`;
    const basis = set.loadBasis === "bodyweight" ? "" : BASIS_LABELS[set.loadBasis] ?? set.loadBasis;
    return `${load}${basis ? ` (${basis})` : ""} × ${set.reps}`;
  }).join(", ");
}

export function compactProgressionContext(values: ExerciseProgressionAssessment[]): string {
  if (!values.length) return "детерминированных решений пока нет";
  return values.slice(0, 8).map((value) => {
    const role = value.constraint === "hard" ? "жёсткий потолок" : "тренерский сигнал";
    const technique = value.techniqueStable === true ? "стабильна" : value.techniqueStable === false ? "нестабильна" : "не указана";
    return `${value.name}: план ${value.targetSets ?? "?"} × ${value.targetReps ?? "?"}; факт ${factualSets(value)}; RIR ${value.lastSetRir ?? "?"}; техника ${technique}; боль ${value.painReported ? "есть" : "нет"}; режим ${value.loadMode}; ${role}: ${DECISION_LABELS[value.decision]} (${value.reason})`;
  }).join("; ");
}

export function formatProgressionSummary(values: ExerciseProgressionAssessment[]): string {
  if (!values.length) return "Паспорт прогрессии пока пуст: нужна подтверждённая тренировка с планом и фактическими подходами.";
  const lines = ["Паспорт прогрессии по последним подтверждённым тренировкам:"];
  let previous = "";
  for (const value of values) {
    const heading = `${value.focus}|${value.date}`;
    if (heading !== previous) { lines.push("", `${value.date} — ${FOCUS_LABELS[value.focus] ?? value.focus}:`); previous = heading; }
    const role = value.constraint === "hard" ? "жёсткий потолок" : "тренерский сигнал";
    lines.push(`• ${value.name}: ${role}; ${DECISION_LABELS[value.decision]}; ${value.reason}. База: ${loadText(value)}.`);
  }
  lines.push("", "Жёсткий потолок обязателен для следующего плана. Остальные строки служат тренерским сигналом для Gemini. Сводка рассчитана без вызова модели.");
  return lines.join("\n");
}

export function applyProgressionGuard(
  workout: GeneratedWorkout,
  values: ExerciseProgressionAssessment[],
  allowedExerciseNames?: ReadonlySet<string>,
): GeneratedWorkout {
  const byName = new Map(values.map((value) => [value.name, value]));
  const alreadySelected = new Set(workout.exercises.map((exercise) => exercise.name));
  const exercises: GeneratedWorkout["exercises"] = [];
  for (const exercise of workout.exercises) {
    const value = byName.get(exercise.name);
    if (value?.decision === "replace_exercise") {
      const replacement = value.replacementName;
      if (!replacement || (allowedExerciseNames && !allowedExerciseNames.has(replacement))) {
        throw new Error(`Нет разрешённой подтверждённой замены для упражнения «${exercise.name}»`);
      }
      if (alreadySelected.has(replacement)) continue;
      exercises.push({
        ...exercise,
        name: replacement,
        weightGuidance: progressionWeightGuidance(value),
        notes: `${exercise.notes} Прогрессия: ${value.reason}.`.trim(),
      });
      continue;
    }
    exercises.push(value
      ? value.constraint === "hard"
        ? { ...exercise, weightGuidance: progressionWeightGuidance(value), notes: `${exercise.notes} Жёсткий потолок прогрессии: ${value.reason}.`.trim() }
        : { ...exercise, notes: `${exercise.notes} Тренерский сигнал прогрессии: ${value.reason}.`.trim() }
      : {
        ...exercise,
        weightGuidance: "Нет сопоставимого подтверждённого паспорта: начни с консервативного тестового веса, сохрани технику и RIR не ниже 2; это не повышение нагрузки.",
        notes: `${exercise.notes} Прогрессия: сначала собрать фактический результат для этого упражнения.`.trim(),
      });
  }
  return {
    ...workout,
    exercises,
  };
}
