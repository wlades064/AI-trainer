export interface NutritionAggregateDraft {
  date: string;
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbohydrateG: number;
  confidence: number;
  warnings: string[];
}

interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const NUTRITION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    date: { type: "string" }, caloriesKcal: { type: "number" }, proteinG: { type: "number" },
    fatG: { type: "number" }, carbohydrateG: { type: "number" }, confidence: { type: "number" },
    warnings: { type: "array", items: { type: "string" }, maxItems: 4 },
  },
  required: ["date", "caloriesKcal", "proteinG", "fatG", "carbohydrateG", "confidence", "warnings"],
} as const;

export function validateNutritionAggregate(value: unknown): NutritionAggregateDraft {
  if (!value || typeof value !== "object") throw new Error("Некорректный результат распознавания КБЖУ");
  const draft = value as Partial<NutritionAggregateDraft>;
  if (typeof draft.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw new Error("Дата не распознана");
  const limits = [[draft.caloriesKcal, 10000], [draft.proteinG, 1000], [draft.fatG, 1000], [draft.carbohydrateG, 1500]] as const;
  if (limits.some(([value, max]) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max)) {
    throw new Error("КБЖУ вышло за допустимые пределы");
  }
  if (typeof draft.confidence !== "number" || draft.confidence < 0 || draft.confidence > 1 || !Array.isArray(draft.warnings)
    || !draft.warnings.every((item) => typeof item === "string")) throw new Error("Некорректная уверенность распознавания");
  return draft as NutritionAggregateDraft;
}

export async function parseNutritionScreenshot(apiKey: string, model: string, image: { data: string; mimeType: string }, today: string, fetchImpl: typeof fetch = fetch) {
  const prompt = `Извлеки только общий дневной итог КБЖУ со скриншота FatSecret. Не извлекай продукты. Сегодня по часовому поясу владельца: ${today}. Если на экране написано «Сегодня», используй эту дату. Не додумывай скрытые значения; при сомнении добавь warning и снизь confidence. Все числа верни в ккал и граммах.`;
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: image.mimeType, data: image.data } }, { text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: NUTRITION_SCHEMA } }),
  });
  if (!response.ok) throw new Error(`Gemini nutrition parser error: ${response.status}`);
  const generated = await response.json<GenerateContentResponse>();
  const text = generated.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) throw new Error("Gemini не вернул результат КБЖУ");
  return { draft: validateNutritionAggregate(JSON.parse(text)), inputTokens: generated.usageMetadata?.promptTokenCount ?? 0, outputTokens: generated.usageMetadata?.candidatesTokenCount ?? 0 };
}

export function formatNutritionDraft(draft: NutritionAggregateDraft): string {
  return [`Черновик КБЖУ за ${draft.date}:`, `• ${Math.round(draft.caloriesKcal)} ккал`, `• белки ${draft.proteinG} г`,
    `• жиры ${draft.fatG} г`, `• углеводы ${draft.carbohydrateG} г`,
    ...(draft.warnings.length ? [`Предупреждения: ${draft.warnings.join("; ")}`] : []),
    "Если всё верно — /confirm. Отмена — /cancel."].join("\n");
}
