import test from "node:test";
import assert from "node:assert/strict";
import { applyPostIllnessSafetyGuard, parseIllnessAction, parseIllnessDate, postIllnessPhase, postIllnessRules } from "../src/illness.ts";
import type { GeneratedWorkout } from "../src/gemini.ts";

test("illness dialog accepts explicit actions and safe historical dates", () => {
  assert.equal(parseIllnessAction("заболел"), "start");
  assert.equal(parseIllnessAction("выздоровел"), "recover");
  assert.equal(parseIllnessAction("что-то ещё"), null);
  assert.equal(parseIllnessDate("сегодня", "2026-08-31"), "2026-08-31");
  assert.equal(parseIllnessDate("2026-08-28", "2026-08-31"), "2026-08-28");
  assert.equal(parseIllnessDate("2026-09-01", "2026-08-31"), null);
  assert.equal(parseIllnessDate("2026-02-30", "2026-08-31"), null);
  assert.equal(parseIllnessDate("2026-05-01", "2026-08-31"), null);
});

test("only confirmed workouts advance the two return phases", () => {
  assert.equal(postIllnessPhase(0), 1);
  assert.equal(postIllnessPhase(1), 2);
  assert.equal(postIllnessPhase(2), null);
  assert.equal(postIllnessPhase(8), null);
});

test("return rules give Gemini the phase and decision criteria without fixed percentages", () => {
  assert.match(postIllnessRules(1).join(" "), /первая фактически выполняемая тренировка/i);
  assert.match(postIllnessRules(1).join(" "), /выбери.*reduced.*deload/i);
  assert.match(postIllnessRules(2).join(" "), /предыдущей тренировки/i);
  assert.doesNotMatch(postIllnessRules(1).join(" "), /70-80%/);
  assert.doesNotMatch(postIllnessRules(2).join(" "), /80-90%/);
});

const workout: GeneratedWorkout = {
  title: "Тренировка спины",
  warmup: [],
  exercises: [{ name: "Пуловер", sets: 4, reps: "12-15", weightGuidance: "50 кг", restSeconds: 90, notes: "ровный темп" }],
  cooldown: [],
  safetyNotes: [],
  programmingRationale: ["прогрессия"],
};

test("post-illness safety guard preserves Gemini programming and adds medical stop signs", () => {
  const result = applyPostIllnessSafetyGuard(workout, 1);
  assert.equal(result.exercises[0].sets, 4);
  assert.equal(result.exercises[0].weightGuidance, "50 кг");
  assert.equal(result.exercises[0].notes, "ровный темп");
  assert.match(result.safetyNotes.join(" "), /прекрати тренировку/);
  assert.match(result.title, /возвращение после болезни, фаза 1/i);
  assert.equal(workout.exercises[0].sets, 4);
});

test("post-illness safety note is idempotent", () => {
  const once = applyPostIllnessSafetyGuard(workout, 2);
  const twice = applyPostIllnessSafetyGuard(once, 2);
  assert.deepEqual(twice.safetyNotes, once.safetyNotes);
});
