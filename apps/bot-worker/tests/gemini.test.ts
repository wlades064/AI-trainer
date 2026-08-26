import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkoutPrompt, generateWorkout, validateGeneratedWorkout } from "../src/gemini.ts";

const allowed = [{ id: 1, name: "Жим лёжа", riskTags: [] }];
const validPlan = {
  title: "Грудь",
  warmup: ["Разминка плеч"],
  exercises: [{ name: "Жим лёжа", sets: 3, reps: "8–10", weightGuidance: "умеренный вес", restSeconds: 120, notes: "Без боли" }],
  cooldown: ["Спокойная ходьба"],
  safetyNotes: ["Остановиться при боли"],
  programmingRationale: ["Сохранено основное движение и применена двойная прогрессия"],
};

test("prompt contains only compact structured context", () => {
  const prompt = buildWorkoutPrompt({
    date: "2026-08-24",
    focus: "грудь",
    durationMinutes: 90,
    emphasis: "верх груди",
    exercises: allowed,
    restrictions: [],
    recentSummary: "2026-08-26: чекин: тяжесть 8/10, RIR 0, боль: нет",
    selectionGuidance: ["4 основных + 2 дополнительных"],
  });
  assert.match(prompt, /Жим лёжа/);
  assert.match(prompt, /90 минут/);
  assert.match(prompt, /4 основных/);
  assert.match(prompt, /RIR 0/);
});

test("post-validation rejects a hallucinated exercise", () => {
  const invalid = structuredClone(validPlan);
  invalid.exercises[0].name = "Приседания";
  assert.throws(() => validateGeneratedWorkout(invalid, new Set(["Жим лёжа"])), /недопустимое упражнение/);
});

test("Gemini generateContent request is stateless and parses structured response", async () => {
  let sentBody: Record<string, unknown> | undefined;
  const fakeFetch: typeof fetch = async (_url, init) => {
    sentBody = JSON.parse(String(init?.body));
    return Response.json({
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 25 },
      candidates: [{ content: { parts: [{ text: JSON.stringify(validPlan) }] } }],
    });
  };
  const result = await generateWorkout("secret", "gemini-3.7-flash", {
    date: "2026-08-24",
    focus: "грудь",
    durationMinutes: 90,
    emphasis: "верх груди",
    exercises: allowed,
    restrictions: [],
  }, fakeFetch);
  assert.equal("store" in (sentBody ?? {}), false);
  assert.ok(Array.isArray(sentBody?.contents));
  assert.equal(result.workout.exercises[0].name, "Жим лёжа");
  assert.deepEqual([result.inputTokens, result.outputTokens], [50, 25]);
});
