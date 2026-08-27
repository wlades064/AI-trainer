import test from "node:test";
import assert from "node:assert/strict";
import { applyProgressionGuard, assessExerciseProgression, parseTargetRepRange, progressionWeightGuidance } from "../src/exercise-progression.ts";
import type { GeneratedWorkout } from "../src/gemini.ts";

const base = { focus: "спина", date: "2026-08-26", name: "Пуловер", targetSets: 4, targetReps: "12-15", actualReps: [15, 15, 15, 15], latestWeightKg: 50, loadBasis: "machine_display", lastSetRir: 2, techniqueStable: true, painReported: false, loadMode: "normal" as const };

test("progression allows load only after the full top range with reserve and stable technique", () => {
  const decision = assessExerciseProgression(base);
  assert.equal(decision.decision, "increase_load");
  assert.match(progressionWeightGuidance(decision), /минимальный доступный шаг/);
});

test("RIR zero, missing technique and incomplete volume block load progression", () => {
  assert.equal(assessExerciseProgression({ ...base, lastSetRir: 0 }).decision, "hold");
  assert.match(assessExerciseProgression({ ...base, lastSetRir: 0 }).reason, /RIR 0/);
  assert.equal(assessExerciseProgression({ ...base, techniqueStable: null }).decision, "hold");
  assert.equal(assessExerciseProgression({ ...base, actualReps: [15, 15, 15] }).decision, "hold");
});

test("pain, unstable technique and deload never authorize a load increase", () => {
  assert.equal(assessExerciseProgression({ ...base, painReported: true }).decision, "reduce_or_replace");
  assert.equal(assessExerciseProgression({ ...base, techniqueStable: false }).decision, "reduce_or_replace");
  assert.equal(assessExerciseProgression({ ...base, loadMode: "deload" }).decision, "hold");
});

test("progression guard replaces Gemini weight guidance with the deterministic limit", () => {
  const workout: GeneratedWorkout = { title: "test", warmup: [], exercises: [{ name: "Пуловер", sets: 4, reps: "12-15", weightGuidance: "Поднять вес как угодно", restSeconds: 90, notes: "контроль" }], cooldown: [], safetyNotes: [], programmingRationale: ["test"] };
  const guarded = applyProgressionGuard(workout, [assessExerciseProgression({ ...base, lastSetRir: 0 })]);
  assert.doesNotMatch(guarded.exercises[0].weightGuidance, /как угодно/);
  assert.match(guarded.exercises[0].weightGuidance, /повышение веса пока не разрешено/);
});

test("an exercise without a comparable passport gets a conservative test load", () => {
  const workout: GeneratedWorkout = { title: "test", warmup: [], exercises: [{ name: "Новое упражнение", sets: 3, reps: "12", weightGuidance: "Сразу повысить вес", restSeconds: 90, notes: "" }], cooldown: [], safetyNotes: [], programmingRationale: ["test"] };
  const guarded = applyProgressionGuard(workout, []);
  assert.match(guarded.exercises[0].weightGuidance, /консервативного тестового веса/);
  assert.doesNotMatch(guarded.exercises[0].weightGuidance, /Сразу повысить/);
});

test("target repetition parser accepts explicit ranges only", () => {
  assert.deepEqual(parseTargetRepRange("12–15"), { minimum: 12, maximum: 15 });
  assert.deepEqual(parseTargetRepRange("12"), { minimum: 12, maximum: 12 });
  assert.equal(parseTargetRepRange("до отказа"), null);
});
