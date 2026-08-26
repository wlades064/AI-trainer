export type ReadinessStep = 1 | 2 | 3 | 4 | 5;

export interface CurrentPainAnswer {
  level: number;
  details?: string;
}

export interface RedFlagAnswer {
  hasNewSwelling: boolean;
  hasInstability: boolean;
  feelsUnwell: boolean;
}

export function readinessQuestion(step: ReadinessStep): string {
  switch (step) {
    case 1:
      return "Предтренировочный чекин 1/5. Сколько ты спал? Например: 7:30 или 7.5.";
    case 2:
      return "Чекин 2/5. Качество сна по шкале 1–5?";
    case 3:
      return "Чекин 3/5. Текущий уровень энергии по шкале 1–5?";
    case 4:
      return "Чекин 4/5. Есть сейчас боль или неприятные ощущения? Напиши «нет» либо область и уровень 0–10, например: колено 3/10.";
    case 5:
      return "Чекин 5/5. Есть новый отёк, нестабильность сустава или общее недомогание? Напиши «нет» либо перечисли симптомы.";
  }
}

export function parseSleepMinutes(text: string): number | null {
  const normalized = text.trim().toLocaleLowerCase("ru-RU").replace(",", ".");
  const clock = normalized.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) {
    const minutes = Number(clock[1]) * 60 + Number(clock[2]);
    return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
  }
  const minutesMatch = normalized.match(/^(\d{1,4})\s*(?:мин|минут|минуты)$/);
  if (minutesMatch) {
    const minutes = Number(minutesMatch[1]);
    return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
  }
  const hoursMatch = normalized.match(/^(\d{1,2}(?:\.\d{1,2})?)\s*(?:ч|час|часа|часов)?$/);
  if (!hoursMatch) return null;
  const minutes = Math.round(Number(hoursMatch[1]) * 60);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
}

export function parseReadinessScale(text: string): number | null {
  const match = text.trim().match(/^([1-5])(?:\s*\/\s*5)?$/);
  return match ? Number(match[1]) : null;
}

export function parseCurrentPain(text: string): CurrentPainAnswer | null {
  const normalized = text.trim().toLocaleLowerCase("ru-RU").replace(/[.!]+$/g, "").trim();
  if (/^(нет|не было|без боли|ничего|0|боли нет)$/.test(normalized)) return { level: 0 };
  const match = normalized.match(/(?:^|\s)(10|[0-9])(?:\s*\/\s*10)?(?:\s|$|[,;:])/);
  if (!match) return null;
  return { level: Number(match[1]), details: text.trim().slice(0, 500) };
}

export function parseRedFlags(text: string): RedFlagAnswer | null {
  const normalized = text.trim().toLocaleLowerCase("ru-RU").replace(/[.!]+$/g, "").trim();
  if (/^(нет|ничего|всё нормально|все нормально|отсутствуют|не было)$/.test(normalized)) {
    return { hasNewSwelling: false, hasInstability: false, feelsUnwell: false };
  }
  if (/^(да|есть|было)$/.test(normalized)) return null;
  const hasNewSwelling = /от[её]к/.test(normalized);
  const hasInstability = /нестабил|подкаш|неустойчив/.test(normalized);
  const feelsUnwell = /недомог|плохо|слабост|тошн|температур|головокруж/.test(normalized);
  return hasNewSwelling || hasInstability || feelsUnwell
    ? { hasNewSwelling, hasInstability, feelsUnwell }
    : null;
}

export function invalidReadinessAnswer(step: ReadinessStep): string {
  if (step === 1) return "Укажи длительность сна, например 7:30, 7.5 или 450 минут.";
  if (step === 2 || step === 3) return "Нужно одно целое число от 1 до 5.";
  if (step === 4) return "Напиши «нет» либо область и уровень боли 0–10, например: колено 3/10.";
  return "Напиши «нет» либо перечисли: отёк, нестабильность и/или недомогание.";
}
