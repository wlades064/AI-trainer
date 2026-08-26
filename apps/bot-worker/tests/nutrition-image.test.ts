import test from "node:test"; import assert from "node:assert/strict";
import { validateNutritionAggregate, formatNutritionDraft } from "../src/nutrition-image.ts";
test("nutrition aggregate validates and formats without products", () => {
  const draft = validateNutritionAggregate({ date:"2026-08-26", caloriesKcal:2200, proteinG:180, fatG:70, carbohydrateG:210, confidence:.95, warnings:[] });
  const text = formatNutritionDraft(draft); assert.match(text,/2200 ккал/); assert.doesNotMatch(text,/продукт/i);
});
test("nutrition aggregate rejects implausible values", () => assert.throws(() => validateNutritionAggregate({ date:"2026-08-26", caloriesKcal:20000, proteinG:1, fatG:1, carbohydrateG:1, confidence:1, warnings:[] })));
