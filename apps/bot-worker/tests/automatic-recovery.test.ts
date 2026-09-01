import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRecoveryLoadGuard,
  assessRecoverySafety,
  compactRecoveryContext,
  type AutomaticRecoveryInput,
} from "../src/automatic-recovery.ts";
import type { GeneratedWorkout } from "../src/gemini.ts";
import { applyPostIllnessGuard } from "../src/illness.ts";

const baseline = (): AutomaticRecoveryInput => ({
  readiness: {
    sleepQuality: 4,
    energy: 4,
    pain: 0,
    hasNewSwelling: false,
    hasInstability: false,
    feelsUnwell: false,
  },
  illnessActive: false,
  postIllnessPhase: null,
  scheduledDeloadActive: false,
  completedHardWeeks: 0,
  consecutivePerformanceDeclines: 0,
  recentCheckins: [],
});

const advisoryCases: Array<{ name: string; input: AutomaticRecoveryInput }> = [
  { name: "normal recovery facts", input: baseline() },
  {
    name: "low sleep and energy",
    input: { ...baseline(), readiness: { ...baseline().readiness, sleepQuality: 2, energy: 2 } },
  },
  {
    name: "six completed hard weeks",
    input: { ...baseline(), completedHardWeeks: 6 },
  },
  {
    name: "an already scheduled deload",
    input: { ...baseline(), scheduledDeloadActive: true },
  },
  {
    name: "persistent poor checkins and performance decline",
    input: {
      ...baseline(),
      completedHardWeeks: 4,
      consecutivePerformanceDeclines: 2,
      recentCheckins: [
        { effort: 9, rir: 0, wellbeing: 2, painReported: true, techniqueStable: false },
        { effort: 9, rir: 0, wellbeing: 2, painReported: true, techniqueStable: false },
      ],
    },
  },
  { name: "first post-illness session", input: { ...baseline(), postIllnessPhase: 1 } },
];

for (const item of advisoryCases) {
  test(`recovery safety leaves ${item.name} to Gemini`, () => {
    assert.deepEqual(assessRecoverySafety(item.input), { allowed: true, reasons: [] });
  });
}

const stopCases: Array<{ name: string; input: AutomaticRecoveryInput; reason: RegExp }> = [
  {
    name: "new swelling",
    input: { ...baseline(), readiness: { ...baseline().readiness, hasNewSwelling: true } },
    reason: /отёк/i,
  },
  { name: "active illness", input: { ...baseline(), illnessActive: true }, reason: /болезнь/i },
  { name: "severe pain", input: { ...baseline(), readiness: { ...baseline().readiness, pain: 7 } }, reason: /боль/i },
];

for (const item of stopCases) {
  test(`recovery safety stops for ${item.name}`, () => {
    const result = assessRecoverySafety(item.input);
    assert.equal(result.allowed, false);
    assert.match(result.reasons.join(" "), item.reason);
  });
}

test("compact recovery context gives Gemini facts instead of a code decision", () => {
  const context = compactRecoveryContext({
    ...baseline(),
    postIllnessPhase: 1,
    completedHardWeeks: 5,
    consecutivePerformanceDeclines: 2,
    recentCheckins: [{ effort: 9, rir: 0, wellbeing: 2, painReported: false, techniqueStable: true }],
  });

  assert.match(context, /после болезни: этап 1/i);
  assert.match(context, /тяжёлых недель: 5/i);
  assert.match(context, /снижений результата подряд: 2/i);
  assert.doesNotMatch(context, /решение кода/i);
});

const generatedWorkout = (): GeneratedWorkout => ({
  title: "План Gemini",
  warmup: [],
  exercises: Array.from({ length: 7 }, (_, index) => ({
    name: `Упражнение ${index + 1}`,
    sets: 5,
    reps: "8-12",
    weightGuidance: "Повысить вес и работать до отказа",
    restSeconds: 90,
    notes: "Дроп-сет в конце",
  })),
  cooldown: [],
  safetyNotes: [],
  programmingRationale: ["test"],
});

test("reduced guard deterministically caps volume and forbids load increase", () => {
  const guarded = applyRecoveryLoadGuard(generatedWorkout(), "reduced");

  assert.equal(guarded.exercises.length, 5);
  assert.ok(guarded.exercises.every((exercise) => exercise.sets <= 3));
  assert.ok(guarded.exercises.every((exercise) => /не выше последнего подтверждённого/i.test(exercise.weightGuidance)));
  assert.ok(guarded.exercises.every((exercise) => /RIR 2–3/.test(exercise.weightGuidance)));
});

test("deload guard deterministically caps volume and replaces Gemini load advice", () => {
  const guarded = applyRecoveryLoadGuard(generatedWorkout(), "deload");

  assert.equal(guarded.exercises.length, 4);
  assert.ok(guarded.exercises.every((exercise) => exercise.sets === 3));
  assert.ok(guarded.exercises.every((exercise) => /80–90%/.test(exercise.weightGuidance)));
  assert.ok(guarded.exercises.every((exercise) => /RIR 3–5/.test(exercise.weightGuidance)));
  assert.doesNotMatch(JSON.stringify(guarded), /Повысить вес и работать до отказа/);
});

test("stop decision cannot produce a workout", () => {
  assert.throws(() => applyRecoveryLoadGuard(generatedWorkout(), "stop"), /остановлена/i);
});

test("post-illness guard stays stricter than the general reduced guard", () => {
  const recoveryGuarded = applyRecoveryLoadGuard(generatedWorkout(), "reduced");
  const guarded = applyPostIllnessGuard(recoveryGuarded, 1);

  assert.ok(guarded.exercises.every((exercise) => /70-80%/.test(exercise.weightGuidance)));
  assert.ok(guarded.exercises.every((exercise) => /RIR 3-4/.test(exercise.notes)));
});
