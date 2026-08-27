import test from "node:test";
import assert from "node:assert/strict";
import { calendarAge, formatDataStatus, type DataStatusSnapshot } from "../src/data-status.ts";
import { loadDataStatus } from "../src/data-status-db.ts";
import type { D1Database, D1PreparedStatement } from "../src/db.ts";

const complete: DataStatusSnapshot = {
  today: "2026-08-27",
  goal: { type: "recomposition", description: null },
  workouts: { latestDate: "2026-08-26", count28: 9 },
  nutrition: { latestDate: "2026-08-27", count7: 7, count28: 24, source: "fatsecret_user_export" },
  weight: { latestDate: "2026-08-24", valueKg: 87.5 },
  measurements: { latestDate: "2026-08-01" },
  readiness: { latestDate: "2026-08-26", count28: 8 },
  injuries: { active: 1, recovering: 1 },
  activeSupplements: 2,
  labs: { latestDate: "2026-08-10", activeCount: 12 },
  activeConnections: 0,
};

test("data pulse reports coverage without claiming medical interpretation", () => {
  const text = formatDataStatus(complete);
  assert.match(text, /тренировки: 9 за 28 дней/);
  assert.match(text, /питание: 7\/7 дней и 24\/28 дней/);
  assert.match(text, /источник: экспорт FatSecret/);
  assert.match(text, /травмы: активных 1, восстанавливающихся 1/);
  assert.match(text, /базовых данных достаточно/);
  assert.match(text, /не медицинская интерпретация/);
  assert.match(text, /Gemini не использовался/);
});

test("data pulse turns stale or missing information into explicit next actions", () => {
  const text = formatDataStatus({
    ...complete,
    goal: null,
    workouts: { latestDate: null, count28: 0 },
    nutrition: { latestDate: null, count7: 0, count28: 0, source: null },
    weight: { latestDate: "2026-08-01", valueKg: 88 },
    measurements: { latestDate: null },
  });
  assert.match(text, /задать актуальную цель/);
  assert.match(text, /первую фактически выполненную тренировку/);
  assert.match(text, /хотя бы 4 подтверждённых дня питания/);
  assert.match(text, /обновить вес в FatSecret/);
  assert.match(text, /контрольные замеры/);
});

test("calendar age uses calendar dates and does not return negative freshness", () => {
  assert.equal(calendarAge("2026-08-27", "2026-08-26"), 1);
  assert.equal(calendarAge("2026-08-27", "2026-08-28"), 0);
  assert.equal(calendarAge("2026-08-27", null), null);
});

test("data pulse batches its read-only database snapshot", async () => {
  let prepared = 0;
  let batchSize = 0;
  const statement = (): D1PreparedStatement => ({
    bind: () => statement(),
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({}),
  });
  const db: D1Database = {
    prepare: () => { prepared += 1; return statement(); },
    batch: async (statements) => {
      batchSize = statements.length;
      return statements.map(() => ({ results: [] }));
    },
  };
  const result = await loadDataStatus(db, 1, "2026-08-27");
  assert.equal(prepared, 11);
  assert.equal(batchSize, 11);
  assert.equal(result.today, "2026-08-27");
  assert.equal(result.nutrition.count7, 0);
  assert.equal(result.goal, null);
});
