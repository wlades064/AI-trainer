import test from"node:test";import assert from"node:assert/strict";import{completedHardWeeks,recoveryTrigger,shouldRequestRecoveryAssessment,sundayOfWeek}from"../src/training-load.ts";
test("hard week needs two confirmed sessions",()=>assert.equal(completedHardWeeks(["2026-07-06","2026-07-08","2026-07-13","2026-07-20","2026-07-22"],"2026-07-27"),2));
test("current partial week is not counted",()=>assert.equal(completedHardWeeks(["2026-08-24","2026-08-26"],"2026-08-28"),0));
test("deload window ends on Sunday",()=>assert.equal(sundayOfWeek("2026-08-28"),"2026-08-30"));
test("recovery assessment starts at four weeks and is weekly",()=>{assert.equal(shouldRequestRecoveryAssessment(3,false),false);assert.equal(shouldRequestRecoveryAssessment(4,false),true);assert.equal(shouldRequestRecoveryAssessment(5,true),false)});
test("two performance declines request recovery before week four",()=>{assert.equal(recoveryTrigger(2,2,false),"performance_decline");assert.equal(recoveryTrigger(4,0,false),"training_block");assert.equal(recoveryTrigger(5,2,true),null)});
