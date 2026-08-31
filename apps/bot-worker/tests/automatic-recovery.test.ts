import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRecoveryLoadGuard,
  assessAutomaticRecovery,
  type AutomaticRecoveryInput,
  type RecoveryLoadDecision,
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

const cases: Array<{ name: string; input: AutomaticRecoveryInput; expected: RecoveryLoadDecision }> = [
  { name: "normal load", input: baseline(), expected: "normal" },
  {
    name: "reduced load after acute low sleep and energy",
    input: { ...baseline(), readiness: { ...baseline().readiness, sleepQuality: 2, energy: 2 } },
    expected: "reduced",
  },
  {
    name: "deload after six completed hard weeks",
    input: { ...baseline(), completedHardWeeks: 6 },
    expected: "deload",
  },
  {
    name: "an already scheduled deload",
    input: { ...baseline(), scheduledDeloadActive: true },
    expected: "deload",
  },
  {
    name: "deload when persistent poor checkins accompany performance decline",
    input: {
      ...baseline(),
      completedHardWeeks: 4,
      consecutivePerformanceDeclines: 2,
      recentCheckins: [
        { effort: 9, rir: 0, wellbeing: 2, painReported: true, techniqueStable: false },
        { effort: 9, rir: 0, wellbeing: 2, painReported: true, techniqueStable: false },
      ],
    },
    expected: "deload",
  },
  {
    name: "stop for a current safety red flag",
    input: { ...baseline(), readiness: { ...baseline().readiness, hasNewSwelling: true } },
    expected: "stop",
  },
  { name: "stop during active illness", input: { ...baseline(), illnessActive: true }, expected: "stop" },
];

for (const item of cases) {
  test(`automatic recovery selects ${item.name}`, () => {
    assert.equal(assessAutomaticRecovery(item.input).decision, item.expected);
  });
}

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
