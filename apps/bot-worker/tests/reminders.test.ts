import test from"node:test";import assert from"node:assert/strict";import{parseReminderInput}from"../src/reminders.ts";
test("reminders parse explicit local schedules",()=>{assert.deepEqual(parseReminderInput("вес 09:00"),{kind:"weight",hour:9});assert.deepEqual(parseReminderInput("замеры 15 08:00"),{kind:"measurements",day:15,hour:8})});
test("reminders reject unsupported minutes and dates",()=>{assert.equal(parseReminderInput("вес 09:30"),null);assert.equal(parseReminderInput("замеры 31 09:00"),null);assert.deepEqual(parseReminderInput("выключить вес"),{kind:"disable",type:"weight"})});
