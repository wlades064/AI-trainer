import test from "node:test"; import assert from "node:assert/strict";
import { formatDelta, nutritionTrendWindows, parseCentimeters, parseWeightCommand } from "../src/body-tracking.ts";
test("body values accept Russian decimal separators",()=>{assert.equal(parseCentimeters("102,5 см"),102.5);assert.equal(parseWeightCommand("/weight 87,35 кг"),87.35)});
test("body values reject implausible numbers",()=>{assert.equal(parseCentimeters("10"),null);assert.equal(parseWeightCommand("/weight 500"),null)});
test("measurement delta is signed",()=>{assert.equal(formatDelta(90,91.2),"-1.2");assert.equal(formatDelta(92,91.2),"+0.8")});
test("nutrition trend compares two calendar windows without inventing missing days",()=>{const trend=nutritionTrendWindows([
  {local_date:"2026-08-26",calories_kcal:2200,protein_g:160,fat_g:70,carbohydrate_g:230},
  {local_date:"2026-08-24",calories_kcal:2000,protein_g:140,fat_g:60,carbohydrate_g:220},
  {local_date:"2026-08-19",calories_kcal:2400,protein_g:130,fat_g:80,carbohydrate_g:260},
],"2026-08-26");assert.deepEqual(trend.recent,{days:2,caloriesKcal:2100,proteinG:150,fatG:65,carbohydrateG:225});assert.deepEqual(trend.previous,{days:1,caloriesKcal:2400,proteinG:130,fatG:80,carbohydrateG:260})});
