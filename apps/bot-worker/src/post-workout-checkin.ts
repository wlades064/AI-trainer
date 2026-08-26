export type PostWorkoutCheckinStep = 1 | 2 | 3 | 4;

export interface PainAnswer {
  reported: true;
  anyPain: boolean;
  details?: string;
}

export function checkinQuestion(step: PostWorkoutCheckinStep): string {
  switch (step) {
    case 1:
      return "Чекин 1/4. Насколько тяжёлой была тренировка по шкале 1–10?";
    case 2:
      return "Чекин 2/4. Сколько повторений оставалось в запасе в последних рабочих подходах (RIR 0–10)?";
    case 3:
      return "Чекин 3/4. Была боль или неприятные ощущения? Ответь «нет» либо укажи область, уровень 0–10 и краткое описание.";
    case 4:
      return "Чекин 4/4. Как общее самочувствие после тренировки по шкале 1–5?";
  }
}

export function parseScaleAnswer(text: string, minimum: number, maximum: number): number | null {
  const normalized = text.trim().replace(",", ".");
  const match = normalized.match(/^(\d{1,2})(?:\s*\/\s*\d{1,2})?$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

export function parsePainAnswer(text: string): PainAnswer | null {
  const normalized = text.trim().toLocaleLowerCase("ru-RU").replace(/[.!]+$/g, "").trim();
  if (!normalized) return null;
  if (/^(нет|не было|без боли|ничего|0|боли не было|дискомфорта не было)$/.test(normalized)) {
    return { reported: true, anyPain: false };
  }
  if (/^(да|была|был|есть|было)$/.test(normalized)) return null;
  return { reported: true, anyPain: true, details: text.trim().slice(0, 500) };
}

export function invalidAnswerMessage(step: PostWorkoutCheckinStep): string {
  if (step === 1) return "Нужно одно целое число от 1 до 10. Например: 8.";
  if (step === 2) return "Нужно одно целое число от 0 до 10. RIR 0 означает, что повторений в запасе не осталось.";
  if (step === 3) return "Если боли не было, напиши «нет». Если была — область, уровень 0–10 и что именно ощущалось.";
  return "Нужно одно целое число от 1 до 5. Например: 4.";
}
