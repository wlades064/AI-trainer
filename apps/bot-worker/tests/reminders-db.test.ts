import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";
import { MEASUREMENT_KINDS } from "../src/body-tracking.ts";
import { runDueReminders } from "../src/reminders-db.ts";

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

test("automatic measurement reminder is delivered once when cron repeats", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  const messages: string[] = [];
  const deliver = async (telegramUserId: string, text: string) => { messages.push(`${telegramUserId}:${text}`); };
  const instant = new Date("2026-10-03T06:00:00Z");

  assert.equal(await runDueReminders(db, instant, "Europe/Samara", deliver), 1);
  assert.equal(await runDueReminders(db, instant, "Europe/Samara", deliver), 0);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /ежемесячные замеры/i);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM reminder_deliveries").get()!.count, 1);
  sqlite.close();
});

test("complete monthly measurement set suppresses the automatic reminder", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  for (const [kind] of MEASUREMENT_KINDS) {
    sqlite.prepare(`INSERT INTO body_measurements(user_id,measured_at,kind,value,unit,source)
      VALUES(1,'2026-10-01',?,100,'cm','telegram_manual')`).run(kind);
  }
  let deliveries = 0;

  const delivered = await runDueReminders(db, new Date("2026-10-03T06:00:00Z"), "Europe/Samara", async () => { deliveries += 1; });

  assert.equal(delivered, 0);
  assert.equal(deliveries, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM reminder_deliveries").get()!.count, 0);
  sqlite.close();
});
