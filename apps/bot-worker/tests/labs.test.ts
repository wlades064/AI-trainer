import test from"node:test";import assert from"node:assert/strict";import{parseCancelLabCommand,parseLabCommand}from"../src/labs.ts";
test("lab command preserves units and reference",()=>assert.deepEqual(parseLabCommand("/lab Гемоглобин | 150 | г/л | 130–170 | 2026-08-20"),{marker:"Гемоглобин",valueText:"150",valueNumeric:150,unit:"г/л",reference:"130–170",date:"2026-08-20"}));
test("lab command supports textual results",()=>assert.deepEqual(parseLabCommand("/lab HBsAg | отрицательно | — | отрицательно"),{marker:"HBsAg",valueText:"отрицательно",unit:"—",reference:"отрицательно",date:undefined}));
test("invalid lab date is rejected",()=>{assert.equal(parseLabCommand("/lab X | 1 | u | 0-2 | вчера"),null);assert.equal(parseCancelLabCommand("/lab_cancel 4"),4)});
