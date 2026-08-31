import test from "node:test";
import assert from "node:assert/strict";
import { buildPersonalDataExport, formatExportSize, serializePersonalDataExport } from "../src/data-export.ts";
import { PERSONAL_EXPORT_QUERIES } from "../src/data-export-db.ts";
import { loadPersonalDataExport } from "../src/data-export-db.ts";
import type { D1Database, D1PreparedStatement } from "../src/db.ts";

test("personal export is deterministic UTF-8 JSON with a dated filename", () => {
  const value = buildPersonalDataExport("2026-08-27T12:00:00.000Z", "Europe/Samara", {
    workouts: [{ name: "Подтягивания", weight: 0 }],
  });
  const file = serializePersonalDataExport(value);
  assert.equal(file.filename, "ai-trainer-export-2026-08-27.json");
  assert.equal(JSON.parse(file.content).sections.workouts[0].name, "Подтягивания");
  assert.equal(file.byteLength, new TextEncoder().encode(file.content).byteLength);
});

test("personal export excludes secrets and global webhook internals", () => {
  const sql = PERSONAL_EXPORT_QUERIES.map((query) => query.sql.toLowerCase()).join("\n");
  assert.doesNotMatch(sql, /token_reference/);
  assert.doesNotMatch(sql, /telegram_updates|system_events/);
  assert.ok(PERSONAL_EXPORT_QUERIES.some((query) => query.section === "workout_sessions"));
  assert.ok(PERSONAL_EXPORT_QUERIES.some((query) => query.section === "nutrition_days"));
  assert.ok(PERSONAL_EXPORT_QUERIES.some((query) => query.section === "lab_results"));
  assert.ok(PERSONAL_EXPORT_QUERIES.some((query) => query.section === "health_observations"));
  assert.ok(PERSONAL_EXPORT_QUERIES.some((query) => query.section === "illness_episodes"));
  assert.ok(PERSONAL_EXPORT_QUERIES.some((query) => query.section === "training_absences"));
});

test("export size is readable", () => {
  assert.equal(formatExportSize(900), "900 Б");
  assert.equal(formatExportSize(2048), "2 КБ");
  assert.equal(formatExportSize(1024 * 1024), "1.0 МБ");
});

test("personal export batches all D1 reads and binds only user-scoped queries", async () => {
  let batchSize = 0;
  let bindCount = 0;
  const statement = (): D1PreparedStatement => ({
    bind: () => { bindCount += 1; return statement(); },
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({}),
  });
  const db: D1Database = {
    prepare: () => statement(),
    batch: async (statements) => {
      batchSize = statements.length;
      return statements.map(() => ({ results: [] }));
    },
  };
  const result = await loadPersonalDataExport(db, 1, "2026-08-27T12:00:00.000Z", "Europe/Samara");
  assert.equal(batchSize, PERSONAL_EXPORT_QUERIES.length);
  assert.equal(bindCount, PERSONAL_EXPORT_QUERIES.filter((query) => query.userScoped !== false).length);
  assert.equal(Object.keys(result.sections).length, PERSONAL_EXPORT_QUERIES.length);
});
