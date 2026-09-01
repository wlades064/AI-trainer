import test from "node:test";
import assert from "node:assert/strict";
import { decideProgression, nextEmphasis, programmingRules, pullUpVariant } from "../src/domain/programming.ts";

test("training emphasis advances only from the last completed emphasis", () => {
  assert.equal(nextEmphasis("chest", "upper_chest", "upper_chest"), "lower_chest");
  assert.equal(nextEmphasis("back", "trapezius_rhomboids", "lats"), "lats");
  assert.equal(nextEmphasis("legs", "quadriceps", "quadriceps"), "posterior_chain");
});

test("an unknown history requires an explicit initial emphasis", () => {
  assert.equal(nextEmphasis("back", null, "trapezius_rhomboids"), "trapezius_rhomboids");
  assert.throws(() => nextEmphasis("back", null, "upper_chest"), /не относится/);
});

test("pull-up grips follow the owner's emphasis mapping", () => {
  assert.equal(pullUpVariant("lats"), "узким параллельным хватом");
  assert.equal(pullUpVariant("trapezius_rhomboids"), "широким хватом");
});

test("load increases only after all sets reach the top with target reserve", () => {
  assert.equal(decideProgression({
    completedReps: [12, 12, 12, 12], targetMinReps: 10, targetMaxReps: 12,
    targetRirReached: true, techniqueStable: true, jointPain: false,
  }), "increase_load");
  assert.equal(decideProgression({
    completedReps: [12, 11, 10, 10], targetMinReps: 10, targetMaxReps: 12,
    targetRirReached: true, techniqueStable: true, jointPain: false,
  }), "increase_reps");
  assert.equal(decideProgression({
    completedReps: [12, 12, 12, 12], targetMinReps: 10, targetMaxReps: 12,
    targetRirReached: false, techniqueStable: true, jointPain: false,
  }), "hold");
});

test("pain or unstable technique blocks progression", () => {
  assert.equal(decideProgression({
    completedReps: [12, 12, 12], targetMinReps: 10, targetMaxReps: 12,
    targetRirReached: true, techniqueStable: true, jointPain: true,
  }), "reduce_load");
});

test("programming rules explicitly prohibit random selection", () => {
  const rules = programmingRules("back", "lats").join(" ");
  assert.match(rules, /Не усредняй и не выбирай случайно/);
  assert.match(rules, /узким параллельным хватом/);
  assert.match(rules, /фактически выполненной/);
});

test("deload prompt removes failure and substantially reduces volume", () => {
  const rules = programmingRules("chest", "lower_chest", "deload").join(" ");
  assert.match(rules, /45–60%/);
  assert.match(rules, /исключи отказ/);
  assert.match(rules, /3–5 повторений в запасе/);
});
