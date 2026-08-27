import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHealthObservation } from "../src/health-observation.ts";

test("wearable observations normalize vendor units to one internal format", () => {
  const sleep = normalizeHealthObservation({ metric: "sleep_duration", value: 7.5, unit: "hours", observedStart: "2026-08-26T23:00:00+04:00", observedEnd: "2026-08-27T06:30:00+04:00", source: "apple_health", externalId: "sleep-1", quality: 0.9 });
  assert.equal(sleep.value, 450);
  assert.equal(sleep.unit, "min");
  assert.equal(sleep.dedupKey, "external:sleep_duration:sleep-1");
  const energy = normalizeHealthObservation({ metric: "active_energy", value: 418.4, unit: "kJ", observedStart: "2026-08-27T12:00:00Z", source: "garmin", quality: 0.8 });
  assert.equal(energy.value, 100);
  assert.equal(energy.unit, "kcal");
});

test("canonical dedup key is stable when a provider has no external id", () => {
  const input = { metric: "steps" as const, value: 10000, unit: "count", observedStart: "2026-08-27T00:00:00+04:00", observedEnd: "2026-08-27T23:59:59+04:00", source: "manual_export", quality: 0.7 };
  assert.equal(normalizeHealthObservation(input).dedupKey, normalizeHealthObservation(input).dedupKey);
});

test("wearable observations reject unsafe ranges, ambiguous time and missing quality", () => {
  assert.throws(() => normalizeHealthObservation({ metric: "resting_heart_rate", value: 400, unit: "bpm", observedStart: "2026-08-27T08:00:00+04:00", source: "garmin", quality: 1 }), /диапазона/);
  assert.throws(() => normalizeHealthObservation({ metric: "steps", value: 10.5, unit: "count", observedStart: "2026-08-27T08:00:00+04:00", source: "garmin", quality: 1 }), /целое число/);
  assert.throws(() => normalizeHealthObservation({ metric: "sleep_score", value: 80, unit: "score", observedStart: "2026-08-27T08:00:00", source: "garmin", quality: 1 }), /часовым поясом/);
  assert.throws(() => normalizeHealthObservation({ metric: "sleep_score", value: 80, unit: "score", observedStart: "2026-08-27T08:00:00Z", source: "garmin", quality: Number.NaN }), /Качество/);
  assert.throws(() => normalizeHealthObservation({ metric: "unknown" as never, value: 1, unit: "score", observedStart: "2026-08-27T08:00:00Z", source: "garmin", quality: 1 }), /Неподдерживаемый тип/);
});
