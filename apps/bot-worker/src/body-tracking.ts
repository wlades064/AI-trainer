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

export interface NutritionTrendDay {
  local_date: string;
  calories_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
}

export interface NutritionWindow {
  days: number;
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbohydrateG: number | null;
}

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function nutritionWindow(rows: NutritionTrendDay[]): NutritionWindow {
  const average = (key: keyof Omit<NutritionTrendDay, "local_date">): number | null => {
    const values = rows.map((row) => row[key]).filter((value): value is number => value !== null);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  return {
    days: rows.length,
    caloriesKcal: average("calories_kcal"),
    proteinG: average("protein_g"),
    fatG: average("fat_g"),
    carbohydrateG: average("carbohydrate_g"),
  };
}

export function nutritionTrendWindows(rows: NutritionTrendDay[], targetDate: string): { recent: NutritionWindow; previous: NutritionWindow } {
  const recentStart = dateOffset(targetDate, -6);
  const previousStart = dateOffset(targetDate, -13);
  return {
    recent: nutritionWindow(rows.filter((row) => row.local_date >= recentStart && row.local_date <= targetDate)),
    previous: nutritionWindow(rows.filter((row) => row.local_date >= previousStart && row.local_date < recentStart)),
  };
}
