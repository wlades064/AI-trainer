export type MeasurementStep = 1 | 2 | 3 | 4 | 5;

export const MEASUREMENT_KINDS = [
  ["chest_circumference", "грудь"],
  ["abdomen_circumference", "живот"],
  ["biceps_circumference", "бицепс"],
  ["shoulders_circumference", "плечи"],
  ["leg_circumference", "нога"],
] as const;

export function measurementQuestion(step: MeasurementStep): string {
  const label = MEASUREMENT_KINDS[step - 1][1];
  return `Замеры ${step}/5. Укажи обхват «${label}» в сантиметрах, например 102.5.`;
}

export function parseCentimeters(text: string): number | null {
  const match = text.trim().toLocaleLowerCase("ru-RU").replace(",", ".").match(/^(\d{1,3}(?:\.\d)?)\s*(?:см)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 20 && value <= 250 ? value : null;
}

export function parseWeightCommand(text: string): number | null {
  const match = text.trim().toLocaleLowerCase("ru-RU").replace(",", ".").match(/^\/weight(?:@\w+)?\s+(\d{2,3}(?:\.\d{1,2})?)\s*(?:кг)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 30 && value <= 300 ? value : null;
}

export function formatDelta(value: number, previous: number): string {
  const delta = Math.round((value - previous) * 10) / 10;
  return `${delta > 0 ? "+" : ""}${delta}`;
}
