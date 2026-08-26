export type TrainingFocus = "chest" | "back" | "legs" | "rest";

export interface LocalDate { year: number; month: number; day: number }

export interface ScheduledTraining {
  date: string;
  focus: TrainingFocus;
  label: string;
}

export interface ScheduleRule {
  weekday: number;
  focus: TrainingFocus;
}

const LABELS: Record<TrainingFocus, string> = {
  chest: "грудь",
  back: "спина",
  legs: "ноги",
  rest: "восстановление",
};

export const DEFAULT_SCHEDULE: ScheduleRule[] = [
  { weekday: 1, focus: "chest" },
  { weekday: 3, focus: "back" },
  { weekday: 5, focus: "legs" },
];

export function localDateAt(instant: Date, timeZone = "Europe/Samara"): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function addCalendarDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function toIsoDate(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function weekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

export function trainingForDate(date: LocalDate, rules: ScheduleRule[] = DEFAULT_SCHEDULE): ScheduledTraining {
  const focus = rules.find((rule) => rule.weekday === weekday(date))?.focus ?? "rest";
  return { date: toIsoDate(date), focus, label: LABELS[focus] };
}

export function requestedDayOffset(text: string): 0 | 1 | null {
  const normalized = text.trim().toLocaleLowerCase("ru-RU");
  if (normalized === "/today" || normalized.includes("на сегодня")) return 0;
  if (normalized === "/tomorrow" || normalized.includes("на завтра")) return 1;
  return null;
}
