import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCurrentPain,
  parseReadinessScale,
  parseRedFlags,
  parseSleepMinutes,
} from "../src/pre-workout-readiness.ts";

test("sleep duration accepts hours, clock format and minutes", () => {
  assert.equal(parseSleepMinutes("7.5"), 450);
  assert.equal(parseSleepMinutes("7:30"), 450);
  assert.equal(parseSleepMinutes("450 минут"), 450);
  assert.equal(parseSleepMinutes("25"), null);
});

test("readiness scale accepts only integers from one to five", () => {
  assert.equal(parseReadinessScale("4/5"), 4);
  assert.equal(parseReadinessScale("0"), null);
  assert.equal(parseReadinessScale("6"), null);
});

test("current pain requires a level when symptoms are present", () => {
  assert.deepEqual(parseCurrentPain("нет"), { level: 0 });
  assert.deepEqual(parseCurrentPain("колено 3/10"), { level: 3, details: "колено 3/10" });
  assert.equal(parseCurrentPain("болит колено"), null);
});

test("red flags are parsed without an AI call", () => {
  assert.deepEqual(parseRedFlags("нет"), { hasNewSwelling: false, hasInstability: false, feelsUnwell: false });
  assert.deepEqual(parseRedFlags("новый отёк и нестабильность"), {
    hasNewSwelling: true,
    hasInstability: true,
    feelsUnwell: false,
  });
  assert.equal(parseRedFlags("да"), null);
});
