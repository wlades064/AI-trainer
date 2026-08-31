import { decideProgression, type ProgressionDecision, type TrainingLoadMode } from "./domain/programming.ts";
import type { GeneratedWorkout } from "./gemini.ts";

export interface ExerciseProgressionInput {
  focus: string;
  date: string;
  name: string;
  targetSets: number | null;
  targetReps: string | null;
  actualReps: number[];
  latestWeightKg: number | null;
  loadBasis: string | null;
  lastSetRir: number | null;
  techniqueStable: boolean | null;
  painReported: boolean;
  loadMode: TrainingLoadMode;
}

export interface ExerciseProgressionAssessment extends ExerciseProgressionInput {
  decision: ProgressionDecision;
  reason: string;
}

const DECISION_LABELS: Record<ProgressionDecision, string> = {
  increase_load: "разрешён минимальный шаг веса",
  increase_reps: "сначала добавить повторения",
  hold: "удерживать нагрузку",
  reduce_or_replace: "снизить нагрузку или заменить упражнение",
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
  const base = { ...input };
  if (input.loadMode !== "normal") return {
    ...base,
    decision: "hold",
    reason: input.loadMode === "deload"
      ? "разгрузочная тренировка не используется для повышения нагрузки"
      : "облегчённая тренировка из-за восстановления не используется для повышения нагрузки",
  };
  if (input.painReported) return { ...base, decision: "reduce_or_replace", reason: "после тренировки указана боль или неприятные ощущения" };
  if (input.techniqueStable === false) return { ...base, decision: "reduce_or_replace", reason: "техника в рабочих подходах была нестабильной" };
  if (input.techniqueStable === null) return { ...base, decision: "hold", reason: "стабильность техники не зафиксирована" };
  if (input.lastSetRir === null) return { ...base, decision: "hold", reason: "RIR последних рабочих подходов не зафиксирован" };
  const range = parseTargetRepRange(input.targetReps);
  if (!range || !input.targetSets) return { ...base, decision: "hold", reason: "нет сопоставимого целевого диапазона плана" };
  if (input.actualReps.length < input.targetSets) return { ...base, decision: "hold", reason: `выполнено ${input.actualReps.length} из ${input.targetSets} рабочих подходов` };
  const decision = decideProgression({
    completedReps: input.actualReps.slice(0, input.targetSets),
    targetMinReps: range.minimum,
    targetMaxReps: range.maximum,
    targetRirReached: input.lastSetRir >= 1,
    techniqueStable: true,
    jointPain: false,
  });
  const reason = decision === "increase_load" ? `все рабочие подходы достигли ${range.maximum} повторений при RIR ${input.lastSetRir}`
    : decision === "increase_reps" ? `выполнен диапазон от ${range.minimum}, но верхняя граница достигнута не во всех подходах`
      : input.actualReps.every((reps) => reps >= range.maximum) && input.lastSetRir === 0 ? "верхняя граница достигнута, но RIR 0 запрещает повышение веса"
        : `целевой объём ${input.targetSets} × ${input.targetReps} ещё не закрыт`;
  return { ...base, decision, reason };
}

function loadText(value: ExerciseProgressionAssessment): string {
  if (value.loadBasis === "bodyweight") return "собственный вес";
  if (value.latestWeightKg === null) return "последний подтверждённый вес не указан";
  return `${value.latestWeightKg} кг ${BASIS_LABELS[value.loadBasis ?? "unknown"] ?? value.loadBasis ?? ""}`.trim();
}

export function progressionWeightGuidance(value: ExerciseProgressionAssessment): string {
  const base = loadText(value);
  if (value.decision === "increase_load") return `Разрешён только минимальный доступный шаг нагрузки относительно «${base}» при сохранении техники и RIR не ниже 1.`;
  if (value.decision === "increase_reps") return `Сохрани нагрузку «${base}» и сначала добавляй повторения в целевом диапазоне; вес не повышать.`;
  if (value.decision === "reduce_or_replace") return `Не повышать нагрузку относительно «${base}»; снизить её до стабильной безболезненной техники либо заменить упражнение.`;
  return `Удерживай нагрузку не выше «${base}»; повышение веса пока не разрешено.`;
}

export function compactProgressionContext(values: ExerciseProgressionAssessment[]): string {
  if (!values.length) return "детерминированных решений пока нет";
  return values.slice(0, 8).map((value) => `${value.name}: ${DECISION_LABELS[value.decision]} (${value.reason})`).join("; ");
}

export function formatProgressionSummary(values: ExerciseProgressionAssessment[]): string {
  if (!values.length) return "Паспорт прогрессии пока пуст: нужна подтверждённая тренировка с планом и фактическими подходами.";
  const lines = ["Паспорт прогрессии по последним подтверждённым тренировкам:"];
  let previous = "";
  for (const value of values) {
    const heading = `${value.focus}|${value.date}`;
    if (heading !== previous) { lines.push("", `${value.date} — ${FOCUS_LABELS[value.focus] ?? value.focus}:`); previous = heading; }
    lines.push(`• ${value.name}: ${DECISION_LABELS[value.decision]}; ${value.reason}. База: ${loadText(value)}.`);
  }
  lines.push("", "Это ограничитель следующего плана, а не автоматическая команда повышать вес. Gemini не использовался.");
  return lines.join("\n");
}

export function applyProgressionGuard(workout: GeneratedWorkout, values: ExerciseProgressionAssessment[]): GeneratedWorkout {
  const byName = new Map(values.map((value) => [value.name, value]));
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => {
      const value = byName.get(exercise.name);
      return value
        ? { ...exercise, weightGuidance: progressionWeightGuidance(value), notes: `${exercise.notes} Прогрессия: ${value.reason}.`.trim() }
        : {
          ...exercise,
          weightGuidance: "Нет сопоставимого подтверждённого паспорта: начни с консервативного тестового веса, сохрани технику и RIR не ниже 2; это не повышение нагрузки.",
          notes: `${exercise.notes} Прогрессия: сначала собрать фактический результат для этого упражнения.`.trim(),
        };
    }),
  };
}
