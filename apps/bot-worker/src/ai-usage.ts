export interface AiUsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AiUsageOverview {
  today: AiUsageTotals;
  sevenDays: AiUsageTotals;
  thirtyDays: AiUsageTotals;
  todayByPurpose: Array<{ purpose: string; requests: number; tokens: number }>;
}

export interface AiUsageLimits {
  requests: number;
  tokens: number;
}

const PURPOSE_LABELS: Readonly<Record<string, string>> = {
  workout_generation: "тренировки",
  workout_report_parsing: "разбор отчётов",
  voice_workout_report_parsing: "голосовые отчёты",
  nutrition_screenshot_parsing: "скриншоты КБЖУ",
  lab_screenshot_parsing: "фото анализов",
};

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseAiUsageLimits(requests: string | undefined, tokens: string | undefined): AiUsageLimits {
  return {
    requests: positiveInteger(requests, 20),
    tokens: positiveInteger(tokens, 100_000),
  };
}

export function aiUsageLimitMessage(today: AiUsageTotals, limits: AiUsageLimits): string | null {
  if (today.requests >= limits.requests) {
    return `Дневной предохранитель Gemini сработал: уже выполнено ${today.requests} из ${limits.requests} разрешённых запросов. Новые вызовы модели доступны после начала следующего дня по Самаре.`;
  }
  const tokens = today.inputTokens + today.outputTokens;
  if (tokens >= limits.tokens) {
    return `Дневной предохранитель Gemini сработал: уже использовано ${tokens.toLocaleString("ru-RU")} из ${limits.tokens.toLocaleString("ru-RU")} токенов. Новые вызовы модели доступны после начала следующего дня по Самаре.`;
  }
  return null;
}

function formatTotals(label: string, totals: AiUsageTotals): string {
  const tokens = totals.inputTokens + totals.outputTokens;
  return `${label}: ${totals.requests} запросов, ${tokens.toLocaleString("ru-RU")} токенов (вход ${totals.inputTokens.toLocaleString("ru-RU")}, выход ${totals.outputTokens.toLocaleString("ru-RU")})`;
}

export function formatAiUsageOverview(overview: AiUsageOverview, limits: AiUsageLimits): string {
  const purpose = overview.todayByPurpose.length
    ? overview.todayByPurpose.map((row) => `• ${PURPOSE_LABELS[row.purpose] ?? row.purpose}: ${row.requests}, ${row.tokens.toLocaleString("ru-RU")} токенов`).join("\n")
    : "• вызовов Gemini ещё не было";
  return [
    "Расход Gemini:",
    formatTotals("Сегодня", overview.today),
    formatTotals("За 7 дней", overview.sevenDays),
    formatTotals("За 30 дней", overview.thirtyDays),
    "",
    "Сегодня по задачам:",
    purpose,
    "",
    `Локальный дневной предел: ${limits.requests} запросов или ${limits.tokens.toLocaleString("ru-RU")} токенов. Повторная выдача сохранённого плана и команды без Gemini токены не расходуют.`,
  ].join("\n");
}
