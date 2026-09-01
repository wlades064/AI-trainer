import test from "node:test";
import assert from "node:assert/strict";
import { applyProgressionGuard, assessExerciseProgression, parseTargetRepRange, progressionWeightGuidance } from "../src/exercise-progression.ts";
import type { GeneratedWorkout } from "../src/gemini.ts";

const base = {
  focus: "спина",
  date: "2026-08-26",
  name: "Пуловер",
  targetSets: 4,
  targetReps: "12-15",
  actualSets: [
    { reps: 15, weightKg: 50, loadBasis: "machine_display" },
    { reps: 15, weightKg: 50, loadBasis: "machine_display" },
    { reps: 15, weightKg: 50, loadBasis: "machine_display" },
    { reps: 15, weightKg: 50, loadBasis: "machine_display" },
  ],
  reportStatus: "completed" as const,
  replacementName: null,
  lastSetRir: 2,
  techniqueStable: true,
  painReported: false,
  loadMode: "normal" as const,
};

test("progression returns all five deterministic decisions", () => {
  const cases = [
    { input: base, expected: "increase_load" },
    {
      input: {
        ...base,
        actualSets: base.actualSets.map((set, index) => ({ ...set, reps: 12 + index })),
      },
      expected: "increase_reps",
    },
    { input: { ...base, lastSetRir: 0 }, expected: "hold" },
    { input: { ...base, techniqueStable: false }, expected: "reduce_load" },
    {
      input: { ...base, reportStatus: "substituted" as const, replacementName: "Тяга верхнего блока" },
      expected: "replace_exercise",
    },
  ];

  for (const item of cases) assert.equal(assessExerciseProgression(item.input).decision, item.expected);
});

test("progression allows load only after the full top range with reserve and stable technique", () => {
  const decision = assessExerciseProgression(base);
  assert.equal(decision.decision, "increase_load");
  assert.match(progressionWeightGuidance(decision), /минимальный доступный шаг/);
});

test("RIR zero, missing technique and incomplete volume block load progression", () => {
  assert.equal(assessExerciseProgression({ ...base, lastSetRir: 0 }).decision, "hold");
  assert.match(assessExerciseProgression({ ...base, lastSetRir: 0 }).reason, /RIR 0/);
  assert.equal(assessExerciseProgression({ ...base, techniqueStable: null }).decision, "hold");
  assert.equal(assessExerciseProgression({ ...base, actualSets: base.actualSets.slice(0, 3) }).decision, "hold");
  assert.equal(assessExerciseProgression({ ...base, reportStatus: "partial" }).decision, "hold");
});

test("a substituted report without a confirmed replacement fails closed", () => {
  const assessment = assessExerciseProgression({ ...base, reportStatus: "substituted", replacementName: null });
  assert.equal(assessment.decision, "hold");
  assert.match(assessment.reason, /замена не подтверждена/i);
});

test("pain, unstable technique and deload never authorize a load increase", () => {
  assert.equal(assessExerciseProgression({ ...base, painReported: true }).decision, "reduce_load");
  assert.equal(assessExerciseProgression({ ...base, techniqueStable: false }).decision, "reduce_load");
  assert.equal(assessExerciseProgression({ ...base, loadMode: "deload" }).decision, "hold");
  assert.equal(assessExerciseProgression({ ...base, loadMode: "reduced" }).decision, "hold");
});

test("mixed working weights or load bases cannot prove progression", () => {
  const mixedWeight = base.actualSets.map((set, index) => ({ ...set, weightKg: index < 2 ? 50 : 45 }));
  const mixedBasis = base.actualSets.map((set, index) => ({ ...set, loadBasis: index < 2 ? "machine_display" : "per_side" }));

  assert.equal(assessExerciseProgression({ ...base, actualSets: mixedWeight }).decision, "hold");
  assert.equal(assessExerciseProgression({ ...base, actualSets: mixedBasis }).decision, "hold");
});

test("extra working sets do not replace the confirmed base of the target sets", () => {
  const assessment = assessExerciseProgression({
    ...base,
    actualSets: [...base.actualSets, { reps: 12, weightKg: 40, loadBasis: "machine_display" }],
  });

  assert.equal(assessment.decision, "increase_load");
  assert.equal(assessment.latestWeightKg, 50);
  assert.match(progressionWeightGuidance(assessment), /50 кг/);
});

test("bodyweight and added-weight sets are compared as different loads", () => {
  const weighted = {
    ...base,
    name: "Подтягивания узким параллельным хватом",
    actualSets: base.actualSets.map((set) => ({ ...set, weightKg: 10, loadBasis: "bodyweight" })),
  };
  const mixed = weighted.actualSets.map((set, index) => ({ ...set, weightKg: index < 2 ? null : 10 }));

  const assessment = assessExerciseProgression(weighted);
  assert.equal(assessment.decision, "increase_load");
  assert.match(progressionWeightGuidance(assessment), /собственный вес \+ 10 кг/i);
  assert.equal(assessExerciseProgression({ ...weighted, actualSets: mixed }).decision, "hold");
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
