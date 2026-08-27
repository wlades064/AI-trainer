import test from "node:test";
import assert from "node:assert/strict";
import { aiUsageLimitMessage, formatAiUsageOverview, parseAiUsageLimits } from "../src/ai-usage.ts";

test("AI usage limits use safe defaults and reject invalid configuration", () => {
  assert.deepEqual(parseAiUsageLimits(undefined, undefined), { requests: 20, tokens: 100_000 });
  assert.deepEqual(parseAiUsageLimits("12", "50000"), { requests: 12, tokens: 50_000 });
  assert.deepEqual(parseAiUsageLimits("0", "broken"), { requests: 20, tokens: 100_000 });
});

test("AI usage guard blocks either request or token limit", () => {
  const limits = { requests: 20, tokens: 100_000 };
  assert.equal(aiUsageLimitMessage({ requests: 19, inputTokens: 80_000, outputTokens: 10_000 }, limits), null);
  assert.match(aiUsageLimitMessage({ requests: 20, inputTokens: 1, outputTokens: 1 }, limits) ?? "", /20 из 20/);
  assert.match(aiUsageLimitMessage({ requests: 2, inputTokens: 90_000, outputTokens: 10_000 }, limits) ?? "", /100\s000/);
});

test("AI usage summary explains deterministic zero-token paths", () => {
  const text = formatAiUsageOverview({
    today: { requests: 2, inputTokens: 1200, outputTokens: 300 },
    sevenDays: { requests: 3, inputTokens: 2000, outputTokens: 500 },
    thirtyDays: { requests: 4, inputTokens: 3000, outputTokens: 700 },
    todayByPurpose: [{ purpose: "workout_generation", requests: 2, tokens: 1500 }],
  }, { requests: 20, tokens: 100_000 });
  assert.match(text, /Сегодня: 2 запросов/);
  assert.match(text, /тренировки: 2/);
  assert.match(text, /команды без Gemini токены не расходуют/);
});
