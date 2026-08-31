import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";
import { answerMeasurementConversation, measurementHistory, startMeasurementConversation } from "../src/body-tracking-db.ts";
import { MEASUREMENT_KINDS } from "../src/body-tracking.ts";
import { runMeasurementMenuAction } from "../src/measurement-menu.ts";

function testDatabase(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDirectory = resolve(import.meta.dirname, "../../../db/migrations");
  for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(resolve(migrationsDirectory, filename), "utf8"));
  }
  function statement(sql: string, values: unknown[] = []): D1PreparedStatement {
    return {
      bind: (...next) => statement(sql, next),
      first: async <T>() => (sqlite.prepare(sql).get(...values as SQLInputValue[]) as T | undefined) ?? null,
      all: async <T>(): Promise<D1Result<T>> => ({ results: sqlite.prepare(sql).all(...values as SQLInputValue[]) as T[] }),
      run: async () => sqlite.prepare(sql).run(...values as SQLInputValue[]),
    };
  }
  return { db: { prepare: (sql) => statement(sql) }, sqlite };
}

test("seven measurement answers are stored independently in centimeters", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  assert.match(await startMeasurementConversation(db, 1), /Замеры 1\/7/);
  const values = [120, 116, 108, 104, 92, 61, 39];
  for (const value of values) await answerMeasurementConversation(db, 1, String(value), "2026-08-31");
  const rows = sqlite.prepare("SELECT kind,value,unit FROM body_measurements ORDER BY id").all() as Array<{ kind: string; value: number; unit: string }>;
  assert.deepEqual(rows.map((row) => row.kind), MEASUREMENT_KINDS.map(([kind]) => kind));
  assert.deepEqual(rows.map((row) => row.value), values);
  assert.ok(rows.every((row) => row.unit === "cm"));
  sqlite.close();
});

test("measurement history reads at most six latest dates without changing data", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  for (let month = 1; month <= 7; month += 1) {
    sqlite.prepare(`INSERT INTO body_measurements(user_id,measured_at,kind,value,unit,source)
      VALUES(1,?,'abdomen_circumference',?,'cm','telegram_manual')`)
      .run(`2026-${String(month).padStart(2,"0")}-01`, 100 - month);
  }
  const before = sqlite.prepare("SELECT COUNT(*) AS count FROM body_measurements").get()!.count;

  const history = await measurementHistory(db, 1);

  assert.match(history, /2026-07-01/);
  assert.doesNotMatch(history, /2026-01-01/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM body_measurements").get()!.count, before);
  sqlite.close();
});

test("measurement submenu starts input or reads history without a cancel branch", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();

  const history = await runMeasurementMenuAction(db, 1, "measure:history");
  assert.equal(history?.kind, "history");
  assert.equal(history?.reply, "История замеров пока пустая.");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM measurement_conversations").get()!.count, 0);

  const input = await runMeasurementMenuAction(db, 1, "measure:new");
  assert.equal(input?.kind, "input");
  assert.match(input?.reply ?? "", /Замеры 1\/7/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM measurement_conversations WHERE status='pending'").get()!.count, 1);
  assert.equal(await runMeasurementMenuAction(db, 1, "measure:cancel"), null);
  sqlite.close();
});
