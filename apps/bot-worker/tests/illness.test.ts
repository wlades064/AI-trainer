import test from "node:test";
import assert from "node:assert/strict";
import { applyPostIllnessGuard, parseIllnessAction, parseIllnessDate, postIllnessPhase, postIllnessRules } from "../src/illness.ts";
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

test("return rules explain conservative progression without diagnosis", () => {
  assert.match(postIllnessRules(1).join(" "), /70-80%/);
  assert.match(postIllnessRules(1).join(" "), /3-4 повторения/);
  assert.match(postIllnessRules(2).join(" "), /80-90%/);
  assert.match(postIllnessRules(2).join(" "), /2-3 повторения/);
});

const workout: GeneratedWorkout = {
  title: "Тренировка спины",
  warmup: [],
  exercises: [{ name: "Пуловер", sets: 4, reps: "12-15", weightGuidance: "50 кг", restSeconds: 90, notes: "ровный темп" }],
  cooldown: [],
  safetyNotes: [],
  programmingRationale: ["прогрессия"],
};

test("phase one guard overrides Gemini volume and weight guidance", () => {
  const result = applyPostIllnessGuard(workout, 1);
  assert.equal(result.exercises[0].sets, 3);
  assert.match(result.exercises[0].weightGuidance, /70-80%/);
  assert.match(result.exercises[0].notes, /RIR 3-4/);
  assert.match(result.safetyNotes.join(" "), /прекрати тренировку/);
  assert.equal(workout.exercises[0].sets, 4);
});

test("phase two guard remains conservative but moves toward normal load", () => {
  const result = applyPostIllnessGuard(workout, 2);
  assert.equal(result.exercises[0].sets, 3);
  assert.match(result.exercises[0].weightGuidance, /80-90%/);
  assert.match(result.exercises[0].notes, /RIR 2-3/);
});
