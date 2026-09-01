import test from"node:test";import assert from"node:assert/strict";import{isAutomaticMeasurementReminderDue,parseReminderInput}from"../src/reminders.ts";
test("reminders parse explicit local schedules",()=>{assert.deepEqual(parseReminderInput("вес 09:00"),{kind:"weight",hour:9});assert.deepEqual(parseReminderInput("замеры 15 08:00"),{kind:"measurements",day:15,hour:8})});
test("reminders reject unsupported minutes and dates",()=>{assert.equal(parseReminderInput("вес 09:30"),null);assert.equal(parseReminderInput("замеры 31 09:00"),null);assert.deepEqual(parseReminderInput("выключить вес"),{kind:"disable",type:"weight"})});

test("automatic measurements are due at 10:00 Samara on the first Saturday from October 2026",()=>{
  assert.equal(isAutomaticMeasurementReminderDue(new Date("2026-10-03T06:00:00Z"),"Europe/Samara"),true);
  assert.equal(isAutomaticMeasurementReminderDue(new Date("2026-11-07T06:00:00Z"),"Europe/Samara"),true);
});

test("automatic measurements reject earlier months, later Saturdays and timezone boundaries",()=>{
  assert.equal(isAutomaticMeasurementReminderDue(new Date("2026-09-05T06:00:00Z"),"Europe/Samara"),false);
  assert.equal(isAutomaticMeasurementReminderDue(new Date("2026-10-10T06:00:00Z"),"Europe/Samara"),false);
  assert.equal(isAutomaticMeasurementReminderDue(new Date("2026-10-03T05:59:00Z"),"Europe/Samara"),false);
  assert.equal(isAutomaticMeasurementReminderDue(new Date("2026-10-02T20:00:00Z"),"Europe/Samara"),false);
});
