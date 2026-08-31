import test from"node:test";import assert from"node:assert/strict";import{completedHardWeeks,sundayOfWeek}from"../src/training-load.ts";
test("hard week needs two confirmed sessions",()=>assert.equal(completedHardWeeks(["2026-07-06","2026-07-08","2026-07-13","2026-07-20","2026-07-22"],"2026-07-27"),2));
test("current partial week is not counted",()=>assert.equal(completedHardWeeks(["2026-08-24","2026-08-26"],"2026-08-28"),0));
test("deload window ends on Sunday",()=>assert.equal(sundayOfWeek("2026-08-28"),"2026-08-30"));
