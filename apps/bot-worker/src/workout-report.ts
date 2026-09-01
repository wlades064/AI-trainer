import type { GeneratedWorkout } from "./gemini.ts";

export type LoadBasis = "total" | "per_side" | "per_dumbbell" | "machine_display" | "bodyweight" | "unknown";
export type ReportExerciseStatus = "completed" | "partial" | "skipped" | "substituted";

export interface ReportSet {
  reps: number;
  weightKg?: number;
  loadBasis: LoadBasis;
  setType: "warmup" | "working" | "drop" | "backoff" | "failure" | "other";
  notes: string;
}

export interface ReportExercise {
  name: string;
  status: ReportExerciseStatus;
  performedAsPlanned: boolean;
  substitutionName?: string;
  sets: ReportSet[];
  notes: string;
}

export interface WorkoutReportDraft {
  date: string;
  exercises: ReportExercise[];
  cardio: Array<{
    activity: string;
    durationMinutes?: number;
    speedValue?: number;
    inclineValue?: number;
    notes: string;
  }>;
  energy?: number;
  pain: Array<{ area: string; level: number; notes: string }>;
  overallNotes: string;
  missingInformation: string[];
}

function normalizeEditedPlanText(text: string): string {
  return text
    .replace(/\\\r?\n/g, "\n")
    .replace(/\\\./g, ".")
    .replace(/\r/g, "")
    .trim();
}

function comparableExerciseName(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9]+/gi, " ").trim();
}

function loadBasisFor(name: string, block: string, bodyweight: boolean): LoadBasis {
  const normalized = `${name} ${block}`.toLowerCase();
  if (bodyweight) return "bodyweight";
  if (normalized.includes("на сторону") || normalized.includes("хаммер")) return "per_side";
  if (normalized.includes("гантел")) return "per_dumbbell";
  if (normalized.includes("кроссовер") || normalized.includes("блок") || normalized.includes("тренажер")) return "machine_display";
  if (normalized.includes("румынск") || normalized.includes("штанг")) return "total";
  return "unknown";
}

function roundWeight(value: number): number {
  return Math.round(value * 10) / 10;
}

export function parseEditedPlanReport(input: {
  date: string;
  plan: GeneratedWorkout;
  reportText: string;
  catalogExerciseNames?: string[];
}): WorkoutReportDraft | null {
  const text = normalizeEditedPlanText(input.reportText);
  const explicitDate = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (explicitDate && explicitDate !== input.date) return null;
  const matches = [...text.matchAll(
    /(?:^|\n)\s*(\d+)\.\s*([^\n]+)\n([\s\S]*?)(?=(?:\n\s*\d+\.\s)|(?:\n\s*Кардио\b)|$)/gi,
  )];
  if (matches.length !== input.plan.exercises.length) return null;
  const catalogByComparable = new Map(
    (input.catalogExerciseNames ?? []).map((name) => [comparableExerciseName(name), name]),
  );
  const exercises: ReportExercise[] = [];
  for (let index = 0; index < input.plan.exercises.length; index += 1) {
    const planned = input.plan.exercises[index];
    const match = matches[index];
    if (Number(match[1]) !== index + 1) return null;
    const reportedName = match[2].trim();
    const plannedName = comparableExerciseName(planned.name);
    const reportedComparable = comparableExerciseName(reportedName);
    const samePlannedMovement = reportedComparable.startsWith(plannedName);
    const substitutionName = samePlannedMovement ? undefined : catalogByComparable.get(reportedComparable);
    if (!samePlannedMovement && !substitutionName) return null;
    const block = match[3].trim();
    const prescription = block.match(/(\d+)\s*подх?\.?\s*[×xх]\s*(\d+)(?:\s*[-–—]\s*(\d+))?/i);
    if (!prescription) return null;
    const setCount = Number(prescription[1]);
    const reps = Number(prescription[2]);
    const maximumReps = prescription[3] ? Number(prescription[3]) : reps;
    if (!Number.isInteger(setCount) || setCount < 1 || setCount > 12 || !Number.isInteger(reps) || reps < 1 || maximumReps < reps || maximumReps > 100) return null;
    const weightMatch = block.match(/^Вес:[ \t]*(\d+(?:[.,]\d+)?)([^\n]*)$/im);
    const actualName = substitutionName ?? reportedName;
    const actualComparable = comparableExerciseName(actualName);
    const bodyweight = planned.weightGuidance.toLowerCase().includes("собствен") || actualComparable.includes("подтягиван");
    if (!bodyweight && !weightMatch) return null;
    const reportedWeight = weightMatch ? Number(weightMatch[1].replace(",", ".")) : undefined;
    const weightUnit = weightMatch?.[2].match(/(кг|килограмм(?:а|ов)?|фунт(?:а|ов)?|lbs?)/i)?.[1].toLowerCase();
    const pounds = weightUnit?.startsWith("фунт") || weightUnit === "lb" || weightUnit === "lbs";
    const weightKg = reportedWeight === undefined ? undefined : roundWeight(pounds ? reportedWeight * 0.45359237 : reportedWeight);
    const loadBasis = loadBasisFor(actualName, block, bodyweight);
    const nameSuffix = reportedComparable.slice(plannedName.length).trim();
    const variationNotes = samePlannedMovement && nameSuffix
      ? nameSuffix.includes("узким параллельным") ? "узким параллельным хватом" : nameSuffix
      : "";
    const notes = [
      variationNotes,
      maximumReps > reps ? `указан диапазон ${reps}–${maximumReps}; для консервативной аналитики сохранён минимум` : "",
      pounds ? `${reportedWeight} фунтов по шкале тренажёра` : "",
    ].filter(Boolean).join("; ");
    exercises.push({
      name: planned.name,
      status: substitutionName ? "substituted" : "completed",
      performedAsPlanned: false,
      ...(substitutionName ? { substitutionName } : {}),
      sets: Array.from({ length: setCount }, () => ({
        reps,
        ...(weightKg === undefined ? {} : { weightKg }),
        loadBasis,
        setType: "working" as const,
        notes: "",
      })),
      notes,
    });
  }
  const cardioMatch = text.match(
    /Кардио\s+([^\n]*?)\s+(\d+(?:[.,]\d+)?)\s*мин(?:ут)?[^\n]*?(?:высота|наклон)\s*(\d+(?:[.,]\d+)?)[^\n]*?скорость\s*(\d+(?:[.,]\d+)?)/i,
  );
  const cardio = cardioMatch ? [{
    activity: cardioMatch[1].trim(),
    durationMinutes: Number(cardioMatch[2].replace(",", ".")),
    inclineValue: Number(cardioMatch[3].replace(",", ".")),
    speedValue: Number(cardioMatch[4].replace(",", ".")),
    notes: "Показания тренажёра",
  }] : [];
  return {
    date: input.date,
    exercises,
    cardio,
    pain: [],
    overallNotes: "",
    missingInformation: [],
  };
}

export function looksLikeWorkoutReport(text: string): boolean {
  const normalized = text.toLowerCase().replace(/ё/g, "е");
  return /(сделал|выполнил|закончил|завершил|отработал|пропустил|заменил)/.test(normalized)
    || /(подход|повтор|по плану|самочувств|боль|энергия)/.test(normalized);
}

export function reportConfirmationBlockers(report: WorkoutReportDraft): string[] {
  const blockers = [...report.missingInformation];
  for (const exercise of report.exercises) {
    if ((exercise.status === "completed" || exercise.status === "partial") && exercise.sets.length === 0) {
      blockers.push(`${exercise.name}: не указаны фактические подходы`);
    }
  }
  return [...new Set(blockers)];
}

function setText(set: ReportSet): string {
  const weight = set.loadBasis === "bodyweight"
    ? "свой вес"
    : set.weightKg === undefined
      ? "вес не указан"
      : `${set.weightKg} кг`;
  const basis = set.loadBasis === "per_side" ? " на сторону"
    : set.loadBasis === "per_dumbbell" ? " на гантель"
      : "";
  const kind = set.setType === "working" ? "" : `, ${set.setType}`;
  return `${weight}${basis} × ${set.reps}${kind}${set.notes ? ` (${set.notes})` : ""}`;
}

export function formatWorkoutReportDraft(report: WorkoutReportDraft): string {
  const statusText: Record<ReportExerciseStatus, string> = {
    completed: "выполнено",
    partial: "частично",
    skipped: "пропущено",
    substituted: "заменено",
  };
  const exercises = report.exercises.map((exercise, index) => {
    const replacement = exercise.substitutionName ? ` → ${exercise.substitutionName}` : "";
    const sets = exercise.sets.length ? exercise.sets.map(setText).join("; ") : "подходы не указаны";
    return `${index + 1}. ${exercise.name}${replacement} — ${statusText[exercise.status]}\n${sets}${exercise.notes ? `\n${exercise.notes}` : ""}`;
  }).join("\n\n");
  const cardio = report.cardio.length
    ? `\n\nКардио:\n${report.cardio.map((item) => `• ${item.activity}${item.durationMinutes === undefined ? "" : ` — ${item.durationMinutes} мин`}`).join("\n")}`
    : "";
  const recovery = [
    report.energy === undefined ? "" : `Энергия: ${report.energy}/5`,
    ...report.pain.map((item) => `Боль — ${item.area}: ${item.level}/10${item.notes ? ` (${item.notes})` : ""}`),
  ].filter(Boolean).join("\n");
  const blockers = reportConfirmationBlockers(report);
  const action = blockers.length
    ? `\n\nНужно уточнить:\n${blockers.map((item) => `• ${item}`).join("\n")}\n\nПришли исправленный полный отчёт ещё раз.`
    : "\n\nЕсли всё распознано верно, отправь /confirm. Для отмены — /cancel.";
  const text = `Черновик тренировки за ${report.date}:\n\n${exercises}${cardio}${recovery ? `\n\n${recovery}` : ""}${report.overallNotes ? `\n\nКомментарий: ${report.overallNotes}` : ""}${action}`;
  return text.length <= 4000 ? text : `${text.slice(0, 3750)}\n\nЧерновик слишком длинный для одного сообщения. Пришли отчёт короче, сохранив веса и повторения.`;
}

interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    date: { type: "string" },
    exercises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          status: { type: "string", enum: ["completed", "partial", "skipped", "substituted"] },
          performedAsPlanned: { type: "boolean" },
          substitutionName: { type: "string" },
          sets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                reps: { type: "integer", minimum: 1, maximum: 100 },
                weightKg: { type: "number", minimum: 0, maximum: 1000 },
                loadBasis: { type: "string", enum: ["total", "per_side", "per_dumbbell", "machine_display", "bodyweight", "unknown"] },
                setType: { type: "string", enum: ["warmup", "working", "drop", "backoff", "failure", "other"] },
                notes: { type: "string" },
              },
              required: ["reps", "loadBasis", "setType", "notes"],
            },
          },
          notes: { type: "string" },
        },
        required: ["name", "status", "performedAsPlanned", "sets", "notes"],
      },
    },
    cardio: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          activity: { type: "string" },
          durationMinutes: { type: "number", minimum: 0, maximum: 600 },
          speedValue: { type: "number", minimum: 0 },
          inclineValue: { type: "number", minimum: 0 },
          notes: { type: "string" },
        },
        required: ["activity", "notes"],
      },
    },
    energy: { type: "integer", minimum: 1, maximum: 5 },
    pain: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          area: { type: "string" },
          level: { type: "integer", minimum: 0, maximum: 10 },
          notes: { type: "string" },
        },
        required: ["area", "level", "notes"],
      },
    },
    overallNotes: { type: "string" },
    missingInformation: { type: "array", items: { type: "string" } },
  },
  required: ["date", "exercises", "cardio", "pain", "overallNotes", "missingInformation"],
} as const;

export function buildWorkoutReportPrompt(input: {
  date: string;
  plan: GeneratedWorkout;
  reportText: string;
  catalogExerciseNames: string[];
}): string {
  const compactPlan = input.plan.exercises.map(({ name, sets, reps, weightGuidance }) => ({ name, sets, reps, weightGuidance }));
  return [
    "Разбери фактический отчёт о тренировке в строгую структуру. Ничего не придумывай.",
    `Дата: ${input.date}. План: ${JSON.stringify(compactPlan)}.`,
    `Допустимые названия замен: ${JSON.stringify(input.catalogExerciseNames)}.`,
    `Сообщение владельца: ${JSON.stringify(input.reportText)}.`,
    "Верни каждое упражнение плана ровно один раз и сохрани его точное название.",
    "Фраза «остальное по плану» означает performedAsPlanned=true, но не разрешает придумывать фактический вес из диапазона.",
    "Не копируй целевые веса и повторения в фактические подходы, если владелец явно не подтвердил выполнение по плану.",
    "Вес гантели записывай как per_dumbbell, вес на одну сторону Хаммера как per_side, цифру на блоке как machine_display.",
    "Дроп-сеты возвращай отдельными подходами с setType=drop. Пропущенные упражнения возвращай с пустым sets.",
    "Все неясности перечисли в missingInformation; не подменяй их предположениями.",
  ].join("\n");
}

export function buildWorkoutVoiceReportPrompt(input: {
  date: string;
  plan: GeneratedWorkout;
  catalogExerciseNames: string[];
}): string {
  const compactPlan = input.plan.exercises.map(({ name, sets, reps, weightGuidance }) => ({ name, sets, reps, weightGuidance }));
  return [
    "Разбери русское голосовое сообщение как фактический отчёт о тренировке и сразу верни строгую структуру. Не создавай отдельную транскрипцию и ничего не придумывай.",
    `Дата: ${input.date}. План: ${JSON.stringify(compactPlan)}.`,
    `Допустимые названия замен: ${JSON.stringify(input.catalogExerciseNames)}.`,
    "Верни каждое упражнение плана ровно один раз и сохрани его точное название.",
    "Распознавай числа, веса, повторения, подходы, замены, пропуски и кардио только когда они произнесены явно.",
    "Фраза «остальное по плану» означает performedAsPlanned=true, но не разрешает придумывать вес из целевого диапазона.",
    "Вес гантели записывай как per_dumbbell, вес на одну сторону Хаммера как per_side, цифру на блоке как machine_display.",
    "Если слово или число неразборчиво, не угадывай: добавь конкретный вопрос в missingInformation.",
  ].join("\n");
}

function responseText(response: GenerateContentResponse): string {
  const value = response.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!value) throw new Error("Gemini не вернул разобранный отчёт");
  return value;
}

export function validateWorkoutReport(
  value: unknown,
  expectedDate: string,
  planExerciseNames: string[],
  catalogExerciseNames: Set<string>,
): WorkoutReportDraft {
  if (!value || typeof value !== "object") throw new Error("Некорректный JSON отчёта");
  const report = value as Partial<WorkoutReportDraft>;
  if (report.date !== expectedDate) throw new Error("Дата отчёта не совпадает с планом");
  if (!Array.isArray(report.exercises) || !Array.isArray(report.cardio) || !Array.isArray(report.pain) || !Array.isArray(report.missingInformation)) {
    throw new Error("В отчёте отсутствуют обязательные списки");
  }
  const expected = new Set(planExerciseNames);
  const seen = new Set<string>();
  for (const exercise of report.exercises) {
    if (!expected.has(exercise.name) || seen.has(exercise.name)) throw new Error(`Недопустимое или повторное упражнение: ${exercise.name}`);
    seen.add(exercise.name);
    if (!["completed", "partial", "skipped", "substituted"].includes(exercise.status)) throw new Error("Некорректный статус упражнения");
    if (!Array.isArray(exercise.sets)) throw new Error("Некорректные подходы");
    if (exercise.status === "substituted" && (!exercise.substitutionName || !catalogExerciseNames.has(exercise.substitutionName))) {
      throw new Error("Замена отсутствует в каталоге упражнений");
    }
    if ((exercise.status === "completed" || exercise.status === "partial") && exercise.sets.length === 0 && !exercise.performedAsPlanned) {
      throw new Error("Для выполненного упражнения не указаны подходы");
    }
    for (const set of exercise.sets) {
      if (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 100) throw new Error("Некорректное число повторений");
      if (set.weightKg !== undefined && (!Number.isFinite(set.weightKg) || set.weightKg < 0 || set.weightKg > 1000)) throw new Error("Некорректный вес");
    }
  }
  if (seen.size !== expected.size) throw new Error("Отчёт содержит не все упражнения плана");
  if (report.energy !== undefined && (!Number.isInteger(report.energy) || report.energy < 1 || report.energy > 5)) throw new Error("Энергия должна быть от 1 до 5");
  for (const pain of report.pain) {
    if (!Number.isInteger(pain.level) || pain.level < 0 || pain.level > 10) throw new Error("Боль должна быть от 0 до 10");
  }
  if (typeof report.overallNotes !== "string" || !report.missingInformation.every((item) => typeof item === "string")) {
    throw new Error("Некорректные заметки отчёта");
  }
  return report as WorkoutReportDraft;
}

export async function parseWorkoutReport(
  apiKey: string,
  model: string,
  input: Parameters<typeof buildWorkoutReportPrompt>[0],
  fetchImpl: typeof fetch = fetch,
): Promise<{ report: WorkoutReportDraft; inputTokens: number; outputTokens: number }> {
  const request = async (prompt: string): Promise<GenerateContentResponse> => {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: REPORT_SCHEMA },
      }),
    });
    if (!response.ok) throw new Error(`Gemini report parser error: ${response.status}`);
    return response.json<GenerateContentResponse>();
  };
  const validate = (text: string): WorkoutReportDraft => validateWorkoutReport(
    JSON.parse(text),
    input.date,
    input.plan.exercises.map(({ name }) => name),
    new Set(input.catalogExerciseNames),
  );
  const originalPrompt = buildWorkoutReportPrompt(input);
  const first = await request(originalPrompt);
  let firstText = "";
  let report: WorkoutReportDraft;
  let repaired: GenerateContentResponse | null = null;
  try {
    firstText = responseText(first);
    report = validate(firstText);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "неизвестная ошибка структуры";
    const repairPrompt = [
      originalPrompt,
      "Первый ответ не прошёл проверку контракта. Исправь его и верни полный JSON отчёта заново.",
      `Причина отказа валидатора: ${JSON.stringify(reason)}.`,
      `Предыдущий ответ: ${JSON.stringify(firstText || "пустой ответ")}.`,
      "Не меняй подтверждённые владельцем факты. Неизвестные значения оставь в missingInformation.",
    ].join("\n");
    repaired = await request(repairPrompt);
    report = validate(responseText(repaired));
  }
  return {
    report,
    inputTokens: (first.usageMetadata?.promptTokenCount ?? 0) + (repaired?.usageMetadata?.promptTokenCount ?? 0),
    outputTokens: (first.usageMetadata?.candidatesTokenCount ?? 0) + (repaired?.usageMetadata?.candidatesTokenCount ?? 0),
  };
}

export async function parseWorkoutVoiceReport(
  apiKey: string,
  model: string,
  input: Parameters<typeof buildWorkoutVoiceReportPrompt>[0] & { audio: { data: string; mimeType: string } },
  fetchImpl: typeof fetch = fetch,
): Promise<{ report: WorkoutReportDraft; inputTokens: number; outputTokens: number }> {
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: input.audio.mimeType, data: input.audio.data } },
        { text: buildWorkoutVoiceReportPrompt(input) },
      ] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: REPORT_SCHEMA },
    }),
  });
  if (!response.ok) throw new Error(`Gemini voice report parser error: ${response.status}`);
  const generated = await response.json<GenerateContentResponse>();
  const report = validateWorkoutReport(
    JSON.parse(responseText(generated)),
    input.date,
    input.plan.exercises.map(({ name }) => name),
    new Set(input.catalogExerciseNames),
  );
  return {
    report,
    inputTokens: generated.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: generated.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
