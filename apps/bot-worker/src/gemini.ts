import type { ActiveRestriction, ExerciseCandidate } from "./domain/safety.ts";

export interface GeneratedExercise {
  name: string;
  sets: number;
  reps: string;
  weightGuidance: string;
  restSeconds: number;
  notes: string;
}

export interface GeneratedWorkout {
  title: string;
  warmup: string[];
  exercises: GeneratedExercise[];
  cooldown: string[];
  safetyNotes: string[];
  programmingRationale: string[];
}

interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const WORKOUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    warmup: { type: "array", items: { type: "string" }, maxItems: 8 },
    exercises: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          sets: { type: "integer", minimum: 1, maximum: 8 },
          reps: { type: "string" },
          weightGuidance: { type: "string" },
          restSeconds: { type: "integer", minimum: 15, maximum: 600 },
          notes: { type: "string" },
        },
        required: ["name", "sets", "reps", "weightGuidance", "restSeconds", "notes"],
      },
    },
    cooldown: { type: "array", items: { type: "string" }, maxItems: 8 },
    safetyNotes: { type: "array", items: { type: "string" }, maxItems: 8 },
    programmingRationale: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
  },
  required: ["title", "warmup", "exercises", "cooldown", "safetyNotes", "programmingRationale"],
} as const;

function outputText(response: GenerateContentResponse): string {
  const text = response.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (text) return text;
  throw new Error("Gemini не вернул текстовый результат");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateGeneratedWorkout(value: unknown, allowedNames: Set<string>): GeneratedWorkout {
  if (!value || typeof value !== "object") throw new Error("Некорректный JSON тренировки");
  const plan = value as Partial<GeneratedWorkout>;
  if (typeof plan.title !== "string" || !isStringArray(plan.warmup) || !isStringArray(plan.cooldown) || !isStringArray(plan.safetyNotes)
    || !isStringArray(plan.programmingRationale) || plan.programmingRationale.length === 0) {
    throw new Error("В тренировке отсутствуют обязательные поля");
  }
  if (!Array.isArray(plan.exercises) || plan.exercises.length === 0 || plan.exercises.length > 12) {
    throw new Error("Некорректный список упражнений");
  }
  for (const exercise of plan.exercises) {
    if (!exercise || typeof exercise !== "object") throw new Error("Некорректное упражнение");
    if (!allowedNames.has(exercise.name)) throw new Error(`Gemini предложил недопустимое упражнение: ${exercise.name}`);
    if (!Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 8) throw new Error("Некорректное число подходов");
    if (typeof exercise.reps !== "string" || typeof exercise.weightGuidance !== "string" || typeof exercise.notes !== "string") {
      throw new Error("Некорректные параметры упражнения");
    }
    if (!Number.isInteger(exercise.restSeconds) || exercise.restSeconds < 15 || exercise.restSeconds > 600) {
      throw new Error("Некорректное время отдыха");
    }
  }
  return plan as GeneratedWorkout;
}

export function buildWorkoutPrompt(input: {
  date: string;
  focus: string;
  durationMinutes: number;
  emphasis: string;
  exercises: ExerciseCandidate[];
  restrictions: ActiveRestriction[];
  recentSummary?: string;
  selectionGuidance?: string[];
}): string {
  return [
    "Ты составляешь одну силовую тренировку. Не ставь диагнозы и не меняй медицинские назначения.",
    "Используй ТОЛЬКО названия упражнений из разрешённого списка, сохраняя написание точно.",
    `Дата: ${input.date}. Группа: ${input.focus}. Лимит времени: ${input.durationMinutes} минут.`,
    `Обязательный акцент этой тренировки: ${input.emphasis}.`,
    `Разрешённые упражнения: ${JSON.stringify(input.exercises.map(({ name }) => name))}.`,
    `Ограничения: ${JSON.stringify(input.restrictions)}.`,
    `Краткая история: ${input.recentSummary || "нет подтверждённых данных"}.`,
    `Правила подбора: ${JSON.stringify(input.selectionGuidance || [])}.`,
    "Обычно выбери 4 упражнения на основную группу и 2 дополнительных. Не добавляй упражнения только ради количества.",
    "В weightGuidance укажи консервативный ориентир из истории или способ подобрать вес по технике и запасу повторений.",
    "Нагрузка должна быть консервативной; при боли упражнение прекращается.",
    "В programmingRationale кратко зафиксируй причины выбора упражнений и способ прогрессии. Это служебное поле не показывается владельцу.",
  ].join("\n");
}

export async function generateWorkout(
  apiKey: string,
  model: string,
  input: Parameters<typeof buildWorkoutPrompt>[0],
  fetchImpl: typeof fetch = fetch,
): Promise<{ workout: GeneratedWorkout; inputTokens: number; outputTokens: number }> {
  if (input.exercises.length === 0) throw new Error("Нет разрешённых упражнений для генерации");
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildWorkoutPrompt(input) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: WORKOUT_SCHEMA,
      },
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 800);
    throw new Error(`Gemini API error: ${response.status}; ${detail}`);
  }
  const generated = await response.json<GenerateContentResponse>();
  const workout = validateGeneratedWorkout(JSON.parse(outputText(generated)), new Set(input.exercises.map(({ name }) => name)));
  return {
    workout,
    inputTokens: generated.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: generated.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
