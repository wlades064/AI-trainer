import test from "node:test"; import assert from "node:assert/strict";
import { formatDelta, parseCentimeters, parseWeightCommand } from "../src/body-tracking.ts";
test("body values accept Russian decimal separators",()=>{assert.equal(parseCentimeters("102,5 см"),102.5);assert.equal(parseWeightCommand("/weight 87,35 кг"),87.35)});
test("body values reject implausible numbers",()=>{assert.equal(parseCentimeters("10"),null);assert.equal(parseWeightCommand("/weight 500"),null)});
test("measurement delta is signed",()=>{assert.equal(formatDelta(90,91.2),"-1.2");assert.equal(formatDelta(92,91.2),"+0.8")});
