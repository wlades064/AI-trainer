import test from "node:test"; import assert from "node:assert/strict";
import { parseGoalCommand, GOAL_LABELS } from "../src/goal.ts";
test("goal command accepts Russian aliases",()=>{assert.equal(parseGoalCommand("/goal рекомпозиция"),"recomposition");assert.equal(parseGoalCommand("/goal снижение жира"),"fat_loss")});
test("unknown goal is rejected",()=>assert.equal(parseGoalCommand("/goal пресс к лету"),null));
test("recomposition label states both parts of the goal",()=>{assert.match(GOAL_LABELS.recomposition,/снижение жира/);assert.match(GOAL_LABELS.recomposition,/мышц/)});
