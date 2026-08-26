import test from"node:test";import assert from"node:assert/strict";import{parseSupplementCommand,parseStopSupplementCommand}from"../src/supplements.ts";
test("supplement command parses dose and schedule",()=>assert.deepEqual(parseSupplementCommand("/supplement Креатин | 5 г | ежедневно"),{name:"Креатин",doseValue:5,doseUnit:"г",schedule:"ежедневно"}));
test("invalid supplement commands are rejected",()=>{assert.equal(parseSupplementCommand("/supplement что-то"),null);assert.equal(parseSupplementCommand("/supplement X | -5 г | день"),null)});
test("supplement stop parses an id",()=>assert.equal(parseStopSupplementCommand("/supplement_stop 12"),12));
