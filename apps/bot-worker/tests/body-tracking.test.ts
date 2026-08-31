import test from "node:test"; import assert from "node:assert/strict";
import { formatDelta, formatMeasurementHistory, measurementQuestion, MEASUREMENT_KINDS, nutritionTrendWindows, parseCentimeters, parseWeightCommand } from "../src/body-tracking.ts";
test("measurement protocol separates breathing phases and uses thigh",()=>{assert.deepEqual(MEASUREMENT_KINDS,[
  ["shoulders_inhale_circumference","плечи на вдохе"],
  ["shoulders_exhale_circumference","плечи на выдохе"],
  ["chest_inhale_circumference","грудь на вдохе"],
  ["chest_exhale_circumference","грудь на выдохе"],
  ["abdomen_circumference","живот"],
  ["thigh_circumference","бедро"],
  ["biceps_circumference","бицепс"],
]);assert.match(measurementQuestion(7),/Замеры 7\/7.*бицепс.*сантиметрах/s)});
test("body values accept Russian decimal separators",()=>{assert.equal(parseCentimeters("102,5 см"),102.5);assert.equal(parseWeightCommand("/weight 87,35 кг"),87.35)});
test("body values reject implausible numbers",()=>{assert.equal(parseCentimeters("10"),null);assert.equal(parseWeightCommand("/weight 500"),null)});
test("measurement delta is signed",()=>{assert.equal(formatDelta(90,91.2),"-1.2");assert.equal(formatDelta(92,91.2),"+0.8")});
test("nutrition trend compares two calendar windows without inventing missing days",()=>{const trend=nutritionTrendWindows([
  {local_date:"2026-08-26",calories_kcal:2200,protein_g:160,fat_g:70,carbohydrate_g:230},
  {local_date:"2026-08-24",calories_kcal:2000,protein_g:140,fat_g:60,carbohydrate_g:220},
  {local_date:"2026-08-19",calories_kcal:2400,protein_g:130,fat_g:80,carbohydrate_g:260},
],"2026-08-26");assert.deepEqual(trend.recent,{days:2,caloriesKcal:2100,proteinG:150,fatG:65,carbohydrateG:225});assert.deepEqual(trend.previous,{days:1,caloriesKcal:2400,proteinG:130,fatG:80,carbohydrateG:260})});
test("measurement history shows all seven values and changes to the previous date",()=>{const text=formatMeasurementHistory([
  {date:"2026-08-31",values:{shoulders_inhale_circumference:121,shoulders_exhale_circumference:117,chest_inhale_circumference:109,chest_exhale_circumference:105,abdomen_circumference:91,thigh_circumference:62,biceps_circumference:39.5}},
  {date:"2026-07-31",values:{shoulders_inhale_circumference:120,shoulders_exhale_circumference:116,chest_inhale_circumference:108,chest_exhale_circumference:104,abdomen_circumference:92,thigh_circumference:61,biceps_circumference:39}},
]);assert.match(text,/2026-08-31/);assert.match(text,/плечи на вдохе: 121 см \(\+1\)/);assert.match(text,/живот: 91 см \(-1\)/);assert.match(text,/бицепс: 39\.5 см \(\+0\.5\)/);assert.match(text,/2026-07-31/)});
test("empty measurement history is explicit",()=>{assert.equal(formatMeasurementHistory([]),"История замеров пока пустая.")});
