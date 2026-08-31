import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";
import { loadExistingGeneratedPlan } from "../src/db.ts";
import { loadReadinessForDate } from "../src/pre-workout-readiness-db.ts";

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

const cachedWorkout = JSON.stringify({
  title: "Старый план",
  warmup: [],
  exercises: [],
  cooldown: [],
  safetyNotes: [],
  programmingRationale: ["test"],
});

test("a cached plan created before today's checkin is not reusable", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  sqlite.prepare(`INSERT INTO workout_plans(user_id,planned_for,focus,status,generated_json,created_at)
    VALUES(1,'2026-08-31','chest','sent',?,'2026-08-31 07:00:00')`).run(cachedWorkout);

  const plan = await loadExistingGeneratedPlan(db, 1, "2026-08-31", "chest", "2026-08-31 08:00:00");

  assert.equal(plan, null);
  sqlite.close();
});

test("a cached plan created after today's checkin remains reusable", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  sqlite.prepare(`INSERT INTO workout_plans(user_id,planned_for,focus,status,generated_json,created_at)
    VALUES(1,'2026-08-31','chest','sent',?,'2026-08-31 09:00:00')`).run(cachedWorkout);

  const plan = await loadExistingGeneratedPlan(db, 1, "2026-08-31", "chest", "2026-08-31 08:00:00");

  assert.equal(plan?.title, "Старый план");
  sqlite.close();
});

test("an incomplete readiness row cannot unlock a cached workout", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  sqlite.prepare(`INSERT INTO readiness_checkins(
    user_id,local_date,sleep_minutes,sleep_quality,energy,pain,source,decision,completed_at
  )VALUES(1,'2026-08-31',480,4,4,0,'telegram','allowed',NULL)`).run();

  const incomplete = await loadReadinessForDate(db, 1, "2026-08-31");

  assert.equal(incomplete, null);
  sqlite.prepare("UPDATE readiness_checkins SET completed_at='2026-08-31 08:00:00' WHERE user_id=1").run();
  const completed = await loadReadinessForDate(db, 1, "2026-08-31");
  assert.equal(completed?.completedAt, "2026-08-31 08:00:00");
  sqlite.close();
});
