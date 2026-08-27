import test from "node:test";
import assert from "node:assert/strict";
import { formatProgressReview, type ReviewWindow } from "../src/progress-review.ts";

const empty=():ReviewWindow=>({workouts:0,focusCounts:{},nutritionDays:0,caloriesKcal:null,proteinG:null,readinessDays:0,sleepMinutes:null,sleepQuality:null,energy:null,readinessPain:null,blockedReadiness:0,recoveryCheckins:0,effort:null,wellbeing:null,painReports:0});

test("review compares fixed calendar windows without inventing trends",()=>{const current={...empty(),workouts:6,focusCounts:{chest:2,back:2,legs:2},nutritionDays:20,caloriesKcal:2400,proteinG:170,readinessDays:6,sleepMinutes:450,sleepQuality:4,energy:4,readinessPain:1,recoveryCheckins:6,effort:7.5,wellbeing:4,painReports:0};const text=formatProgressReview({currentStart:"2026-08-01",currentEnd:"2026-08-28",previousStart:"2026-07-04",previousEnd:"2026-07-31",current,previous:{...empty(),workouts:4},weights:[{date:"2026-08-01",value:88},{date:"2026-08-28",value:87.2}]});assert.match(text,/Тренировки: 6 \(\+2/);assert.match(text,/Вес: 88 → 87.2 кг \(-0,8 кг\)/);assert.doesNotMatch(text,/рандом|причина улучшения/i)});
test("review reports insufficient data honestly",()=>{const text=formatProgressReview({currentStart:"2026-08-01",currentEnd:"2026-08-28",previousStart:"2026-07-04",previousEnd:"2026-07-31",current:empty(),previous:empty(),weights:[]});assert.match(text,/тренд не определяется/);assert.match(text,/хотя бы 14 заполненных дней/);assert.match(text,/данных сна и готовности пока мало/i)});
