import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReadiness, filterSafeExercises } from "../src/domain/safety.ts";

test("blocks exercises matching active injury risk tags", () => {
  const result = filterSafeExercises(
    [
      { id: 1, name: "Жим лёжа", riskTags: [] },
      { id: 2, name: "Прыжки", riskTags: ["impact", "ankle_instability"] },
      { id: 3, name: "Тяжёлые приседания", riskTags: ["knee_high_load"] },
    ],
    [
      { bodyArea: "голеностоп", avoidTags: ["impact", "ankle_instability"] },
      { bodyArea: "колено", avoidTags: ["knee_high_load"] },
    ],
  );
  assert.deepEqual(result.allowed.map(({ name }) => name), ["Жим лёжа"]);
  assert.deepEqual(result.blocked.map(({ name }) => name), ["Прыжки", "Тяжёлые приседания"]);
});

test("stops generation for red-flag readiness answers", () => {
  assert.equal(evaluateReadiness({ pain: 7, hasNewSwelling: false, hasInstability: false, feelsUnwell: false }).allowed, false);
  assert.equal(evaluateReadiness({ pain: 1, hasNewSwelling: false, hasInstability: false, feelsUnwell: false }).allowed, true);
});
