import test from"node:test";import assert from"node:assert/strict";import{parseFive,parseHours,parseJointFlags,parseYesNo}from"../src/recovery.ts";
test("recovery answers parse without Gemini",()=>{assert.equal(parseFive("4/5"),4);assert.equal(parseHours("72 ч"),72);assert.equal(parseYesNo("нет"),false);assert.deepEqual(parseJointFlags("отёк и нестабильность"),{swelling:true,instability:true})});
