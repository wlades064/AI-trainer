import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";
import { answerMeasurementConversation, startMeasurementConversation } from "../src/body-tracking-db.ts";
import { MEASUREMENT_KINDS } from "../src/body-tracking.ts";

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
