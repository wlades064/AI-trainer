import type { TrainingEmphasis } from "./domain/programming.ts";

export type ProgramFocus = "chest" | "back" | "legs";

export interface ProgramCycleStatus {
  focus: ProgramFocus;
  nextEmphasis: TrainingEmphasis | null;
  lastCompletedDate: string | null;
  lastCompletedEmphasis: TrainingEmphasis | null;
}

export interface ProgramStatusSnapshot {
  today: string;
  nextTraining: { date: string; focus: ProgramFocus } | null;
  cycles: ProgramCycleStatus[];
  load: {
    blockStartedOn: string | null;
    completedHardWeeks: number;
    deloadUntil: string | null;
    lastDeloadEndedOn: string | null;
  };
  latestRecovery: { date: string; decision: "normal" | "monitor" | "deload" | "stop_and_review" } | null;
}

const FOCUS_LABELS: Record<ProgramFocus, string> = { chest: "грудь", back: "спина", legs: "ноги" };
const EMPHASIS_LABELS: Record<TrainingEmphasis, string> = {
  upper_chest: "верх груди",
  lower_chest: "низ груди",
  lats: "широчайшие — узкий параллельный хват в подтягиваниях",
  trapezius_rhomboids: "трапеции и ромбовидные — широкий хват в подтягиваниях",
  quadriceps: "квадрицепсы",
  posterior_chain: "задняя поверхность бедра и ягодицы",
};
const RECOVERY_LABELS: Record<NonNullable<ProgramStatusSnapshot["latestRecovery"]>["decision"], string> = {
  normal: "обычный режим",
  monitor: "наблюдение без форсирования",
  deload: "разгрузка",
  stop_and_review: "остановка до повторной проверки состояния",
};

function emphasis(value: TrainingEmphasis | null): string {
  return value ? EMPHASIS_LABELS[value] : "не задан — случайный выбор запрещён";
}

export function formatProgramStatus(value: ProgramStatusSnapshot): string {
  const byFocus = new Map(value.cycles.map((cycle) => [cycle.focus, cycle]));
  const lines = [`Состояние программы на ${value.today}:`, ""];
  if (value.nextTraining) {
    const cycle = byFocus.get(value.nextTraining.focus);
    lines.push(`Ближайшая тренировка: ${value.nextTraining.date} — ${FOCUS_LABELS[value.nextTraining.focus]}; акцент: ${emphasis(cycle?.nextEmphasis ?? null)}.`);
  } else {
    lines.push("Ближайшая тренировка: в следующих 28 днях по расписанию не найдена.");
  }
  lines.push("", "Циклы по группам:");
  for (const focus of ["chest", "back", "legs"] as const) {
    const cycle = byFocus.get(focus);
    const last = cycle?.lastCompletedDate
      ? `${cycle.lastCompletedDate}${cycle.lastCompletedEmphasis ? `, акцент: ${EMPHASIS_LABELS[cycle.lastCompletedEmphasis]}` : ", акцент в истории не зафиксирован"}`
      : "нет подтверждённой тренировки";
    lines.push(`• ${FOCUS_LABELS[focus]}: следующий — ${emphasis(cycle?.nextEmphasis ?? null)}; последняя — ${last}`);
  }
  lines.push("", "Нагрузка и восстановление:");
  lines.push(`• завершённых тяжёлых недель: ${value.load.completedHardWeeks} из 6 до плановой разгрузки${value.load.blockStartedOn ? `; блок начат ${value.load.blockStartedOn}` : "; отсчёт блока ещё не начат"}`);
  if (value.load.deloadUntil && value.load.deloadUntil >= value.today) lines.push(`• сейчас действует разгрузка до ${value.load.deloadUntil} включительно`);
  else lines.push(`• активной разгрузки нет${value.load.lastDeloadEndedOn ? `; предыдущая завершилась ${value.load.lastDeloadEndedOn}` : ""}`);
  if (value.latestRecovery) lines.push(`• последняя оценка восстановления ${value.latestRecovery.date}: ${RECOVERY_LABELS[value.latestRecovery.decision]}`);
  else lines.push("• отдельной оценки восстановления пока нет");
  lines.push("", "Акцент переключается только после подтверждённой выполненной тренировки. Запрос плана или пропуск дня цикл не меняет. Gemini не использовался.");
  return lines.join("\n");
}
