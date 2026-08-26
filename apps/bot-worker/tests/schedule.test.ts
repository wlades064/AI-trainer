import test from "node:test";
import assert from "node:assert/strict";
import { addCalendarDays, localDateAt, requestedDayOffset, trainingForDate } from "../src/domain/schedule.ts";

test("uses Samara calendar date", () => {
  assert.deepEqual(localDateAt(new Date("2026-08-23T21:30:00Z")), { year: 2026, month: 8, day: 24 });
});

test("maps Monday, Wednesday and Friday", () => {
  assert.equal(trainingForDate({ year: 2026, month: 8, day: 24 }).focus, "chest");
  assert.equal(trainingForDate({ year: 2026, month: 8, day: 26 }).focus, "back");
  assert.equal(trainingForDate({ year: 2026, month: 8, day: 28 }).focus, "legs");
  assert.equal(trainingForDate({ year: 2026, month: 8, day: 25 }).focus, "rest");
});

test("accepts schedule rules loaded from the database", () => {
  const tuesdayOnly = [{ weekday: 2, focus: "back" as const }];
  assert.equal(trainingForDate({ year: 2026, month: 8, day: 25 }, tuesdayOnly).focus, "back");
  assert.equal(trainingForDate({ year: 2026, month: 8, day: 24 }, tuesdayOnly).focus, "rest");
});

test("adds a calendar day across a month boundary", () => {
  assert.deepEqual(addCalendarDays({ year: 2026, month: 8, day: 31 }, 1), { year: 2026, month: 9, day: 1 });
});

test("parses Russian and slash commands", () => {
  assert.equal(requestedDayOffset("Скинь тренировку на сегодня"), 0);
  assert.equal(requestedDayOffset("/tomorrow"), 1);
  assert.equal(requestedDayOffset("как дела?"), null);
});
