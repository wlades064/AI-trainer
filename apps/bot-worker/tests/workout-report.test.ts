import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkoutReportPrompt,
  buildWorkoutVoiceReportPrompt,
  formatWorkoutReportDraft,
  looksLikeWorkoutReport,
  parseEditedPlanReport,
  parseWorkoutReport,
  parseWorkoutVoiceReport,
  reportConfirmationBlockers,
  validateWorkoutReport,
} from "../src/workout-report.ts";
import type { WorkoutReportDraft } from "../src/workout-report.ts";

const plan = {
  title: "Спина",
  warmup: [],
  exercises: [
    { name: "Подтягивания", sets: 4, reps: "6-10", weightGuidance: "свой вес", restSeconds: 120, notes: "" },
    { name: "Пуловер", sets: 4, reps: "12-15", weightGuidance: "35-43 кг", restSeconds: 90, notes: "" },
  ],
  cooldown: [],
  safetyNotes: [],
  programmingRationale: ["Последовательная прогрессия"],
};

const validReport: WorkoutReportDraft = {
  date: "2026-08-26",
  exercises: [
    {
      name: "Подтягивания", status: "completed", performedAsPlanned: false,
      sets: [{ reps: 10, loadBasis: "bodyweight", setType: "working", notes: "узкий параллельный хват" }], notes: "",
    },
    { name: "Пуловер", status: "completed", performedAsPlanned: true, sets: [], notes: "остальное по плану" },
  ],
  cardio: [], energy: 4,
  pain: [{ area: "колени", level: 0, notes: "" }],
  overallNotes: "",
  missingInformation: ["Фактический вес пуловера не указан"],
};

test("report prompt forbids invented results", () => {
  const prompt = buildWorkoutReportPrompt({
    date: "2026-08-26", plan, reportText: "Остальное по плану", catalogExerciseNames: ["Подтягивания", "Пуловер"],
  });
  assert.match(prompt, /Ничего не придумывай/);
  assert.match(prompt, /не разрешает придумывать фактический вес/);
});

test("valid report preserves missing information instead of inventing it", () => {
  const parsed = validateWorkoutReport(validReport, "2026-08-26", ["Подтягивания", "Пуловер"], new Set(["Подтягивания", "Пуловер"]));
  assert.equal(parsed.exercises[1].sets.length, 0);
  assert.match(parsed.missingInformation[0], /вес/);
});

test("report rejects an exercise that was not in the plan", () => {
  const invalid = structuredClone(validReport);
  invalid.exercises[0].name = "Становая тяга";
  assert.throws(
    () => validateWorkoutReport(invalid, "2026-08-26", ["Подтягивания", "Пуловер"], new Set(["Подтягивания", "Пуловер"])),
    /Недопустимое/,
  );
});

test("report parser uses a structured stateless request", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const fakeFetch: typeof fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      candidates: [{ content: { parts: [{ text: JSON.stringify(validReport) }] } }],
    });
  };
  const result = await parseWorkoutReport("secret", "gemini-test", {
    date: "2026-08-26", plan, reportText: "пример", catalogExerciseNames: ["Подтягивания", "Пуловер"],
  }, fakeFetch);
  assert.equal("store" in (requestBody ?? {}), false);
  assert.equal(result.report.energy, 4);
  assert.deepEqual([result.inputTokens, result.outputTokens], [100, 50]);
});

test("voice report uses one inline structured Gemini request", async () => {
  let requestBody: any;
  const fakeFetch: typeof fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      usageMetadata: { promptTokenCount: 2100, candidatesTokenCount: 50 },
      candidates: [{ content: { parts: [{ text: JSON.stringify(validReport) }] } }],
    });
  };
  const result = await parseWorkoutVoiceReport("secret", "gemini-test", {
    date: "2026-08-26",
    plan,
    catalogExerciseNames: ["Подтягивания", "Пуловер"],
    audio: { data: "BASE64_AUDIO", mimeType: "audio/ogg" },
  }, fakeFetch);
  assert.deepEqual(requestBody.contents[0].parts[0], {
    inline_data: { mime_type: "audio/ogg", data: "BASE64_AUDIO" },
  });
  assert.match(requestBody.contents[0].parts[1].text, /Не создавай отдельную транскрипцию/);
  assert.equal(result.report.energy, 4);
  assert.deepEqual([result.inputTokens, result.outputTokens], [2100, 50]);
});

test("voice prompt demands explicit facts and missing-information questions", () => {
  const prompt = buildWorkoutVoiceReportPrompt({
    date: "2026-08-26", plan, catalogExerciseNames: ["Подтягивания", "Пуловер"],
  });
  assert.match(prompt, /только когда они произнесены явно/);
  assert.match(prompt, /не угадывай/);
});

test("natural Russian completion text is recognized as a workout report", () => {
  assert.equal(looksLikeWorkoutReport("Закончил тренировку, подтягивания 10, 9, 8"), true);
  assert.equal(looksLikeWorkoutReport("Скинь тренировку на завтра"), false);
});

test("a draft with missing actual sets cannot be confirmed", () => {
  const blockers = reportConfirmationBlockers(validReport);
  assert.ok(blockers.some((item) => item.includes("Пуловер")));
  assert.match(formatWorkoutReportDraft(validReport), /Нужно уточнить/);
  assert.doesNotMatch(formatWorkoutReportDraft(validReport), /отправь \/confirm/);
});

test("the owner's edited plan format is parsed without Gemini", () => {
  const realPlan = {
    ...plan,
    exercises: [
      { name: "Подтягивания", sets: 4, reps: "6-10", weightGuidance: "Собственный вес", restSeconds: 120, notes: "" },
      { name: "Пуловер в кроссовере EZ-рукоятью", sets: 4, reps: "12-15", weightGuidance: "35-43 кг", restSeconds: 90, notes: "" },
      { name: "Горизонтальная тяга в Хаммере по одной руке", sets: 3, reps: "10-12", weightGuidance: "30-35 кг на сторону", restSeconds: 90, notes: "" },
      { name: "Верхняя тяга в кроссовере широким крабом на середину спины", sets: 3, reps: "10-12", weightGuidance: "38-43 кг", restSeconds: 90, notes: "" },
      { name: "Тяга в кроссовере на заднюю дельту", sets: 4, reps: "12-15", weightGuidance: "20-25 кг", restSeconds: 60, notes: "" },
      { name: "Сгибание рук в кроссовере подковой сидя", sets: 4, reps: "12-15", weightGuidance: "30-35 кг", restSeconds: 60, notes: "" },
    ],
  };
  const reportText = `2026-08-26 — Силовая тренировка спины

1. Подтягивания узким параллельным
4 подх. × 12; отдых 120 сек

2. Пуловер в кроссовере EZ-рукоятью
4 подх. × 15; отдых 90 сек
Вес: 50 кг

3. Горизонтальная тяга в Хаммере по одной руке
3 подх. × 12; отдых 90 сек
Вес: 35 кг на сторону

4. Верхняя тяга в кроссовере широким крабом на середину спины
3 подх. × 12; отдых 90 сек
Вес: 52 кг

5. Тяга в кроссовере на заднюю дельту
4 подх. × 15; отдых 60 сек
Вес: 27 кг

6. Сгибание рук в кроссовере подковой сидя
4 подх. × 15; отдых 60 сек
Вес: 30 кг

Кардио дорожка 30 мин высота 8 скорость 5`;
  const parsed = parseEditedPlanReport({ date: "2026-08-26", plan: realPlan, reportText });
  assert.ok(parsed);
  assert.equal(parsed.exercises[0].sets.length, 4);
  assert.equal(parsed.exercises[0].sets[0].loadBasis, "bodyweight");
  assert.equal(parsed.exercises[0].notes, "узким параллельным хватом");
  assert.equal(parsed.exercises[1].sets[0].weightKg, 50);
  assert.equal(parsed.exercises[2].sets[0].loadBasis, "per_side");
  assert.deepEqual(parsed.cardio[0], {
    activity: "дорожка",
    durationMinutes: 30,
    inclineValue: 8,
    speedValue: 5,
    notes: "Показания тренажёра",
  });
  assert.deepEqual(reportConfirmationBlockers(parsed), []);
});

test("the owner's leg report accepts catalog substitutions, omitted kg and pounds", () => {
  const legPlan = {
    ...plan,
    exercises: [
      { name: "Румынская тяга", sets: 3, reps: "8-10", weightGuidance: "удерживать", restSeconds: 120, notes: "" },
      { name: "Сгибание ног в тренажере сидя", sets: 3, reps: "12-15", weightGuidance: "удерживать", restSeconds: 90, notes: "" },
      { name: "Отведение бедра в тренажере", sets: 3, reps: "15-20", weightGuidance: "удерживать", restSeconds: 60, notes: "" },
      { name: "Приведение бедра в тренажере", sets: 3, reps: "15-20", weightGuidance: "удерживать", restSeconds: 60, notes: "" },
      { name: "Махи гантелями в стороны сидя", sets: 3, reps: "15-20", weightGuidance: "удерживать", restSeconds: 60, notes: "" },
    ],
  };
  const reportText = `2026-08-28 — Силовая тренировка ног с акцентом на заднюю цепь

1. Румынская тяга
3 подх. × 10; отдых 120 сек
Вес: 80кг

2. Сгибание ног в тренажере лёжа
3 подх. × 12; отдых 90 сек
Вес: 36кг

3. Отведение бедра в тренажере
3 подх. × 20; отдых 60 сек
Вес: 52

4. Приведение бедра в тренажере
3 подх. × 15-20; отдых 60 сек
Вес: 120 фунтов

5. Махи гантелями в стороны стоя
3 подх. × 20; отдых 60 сек
Вес: 10`;
  const parsed = parseEditedPlanReport({
    date: "2026-08-28",
    plan: legPlan,
    reportText,
    catalogExerciseNames: [
      "Сгибание ног в тренажере сидя",
      "Сгибание ног в тренажере лежа",
      "Махи гантелями в стороны сидя",
      "Махи гантелями в стороны стоя",
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.exercises[1].status, "substituted");
  assert.equal(parsed.exercises[1].substitutionName, "Сгибание ног в тренажере лежа");
  assert.equal(parsed.exercises[2].sets[0].weightKg, 52);
  assert.equal(parsed.exercises[2].sets[0].loadBasis, "machine_display");
  assert.equal(parsed.exercises[3].sets[0].weightKg, 54.4);
  assert.equal(parsed.exercises[3].sets[0].reps, 15);
  assert.match(parsed.exercises[3].notes, /120 фунтов/);
  assert.match(parsed.exercises[3].notes, /диапазон 15–20/);
  assert.equal(parsed.exercises[4].status, "substituted");
  assert.equal(parsed.exercises[4].substitutionName, "Махи гантелями в стороны стоя");
  assert.equal(parsed.exercises[4].sets[0].loadBasis, "per_dumbbell");
  assert.deepEqual(reportConfirmationBlockers(parsed), []);
});
