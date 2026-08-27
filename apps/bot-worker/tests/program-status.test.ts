import test from "node:test";
import assert from "node:assert/strict";
import { formatProgramStatus, type ProgramStatusSnapshot } from "../src/program-status.ts";

const status: ProgramStatusSnapshot = {
  today: "2026-08-27",
  nextTraining: { date: "2026-08-28", focus: "legs" },
  cycles: [
    { focus: "chest", nextEmphasis: "lower_chest", lastCompletedDate: "2026-08-24", lastCompletedEmphasis: "upper_chest" },
    { focus: "back", nextEmphasis: "trapezius_rhomboids", lastCompletedDate: "2026-08-26", lastCompletedEmphasis: "lats" },
    { focus: "legs", nextEmphasis: "posterior_chain", lastCompletedDate: "2026-08-21", lastCompletedEmphasis: null },
  ],
  load: { blockStartedOn: "2026-08-24", completedHardWeeks: 0, deloadUntil: null, lastDeloadEndedOn: null },
  latestRecovery: null,
};

test("program screen makes the next deterministic cycle visible", () => {
  const text = formatProgramStatus(status);
  assert.match(text, /2026-08-28 — ноги; акцент: задняя поверхность бедра и ягодицы/);
  assert.match(text, /грудь: следующий — низ груди/);
  assert.match(text, /спина: следующий — трапеции и ромбовидные — широкий хват/);
  assert.match(text, /последняя — 2026-08-26, акцент: широчайшие/);
  assert.match(text, /Запрос плана или пропуск дня цикл не меняет/);
  assert.match(text, /Gemini не использовался/);
});

test("program screen shows an active deload and safety stop explicitly", () => {
  const text = formatProgramStatus({ ...status, load: { ...status.load, completedHardWeeks: 6, deloadUntil: "2026-08-30" }, latestRecovery: { date: "2026-08-27", decision: "stop_and_review" } });
  assert.match(text, /действует разгрузка до 2026-08-30/);
  assert.match(text, /остановка до повторной проверки состояния/);
});

test("program screen refuses to invent an uninitialized emphasis", () => {
  const text = formatProgramStatus({ ...status, cycles: status.cycles.map((cycle) => ({ ...cycle, nextEmphasis: null })) });
  assert.match(text, /не задан — случайный выбор запрещён/);
});
