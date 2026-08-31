import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";
import { answerIllnessConversation, loadIllnessTrainingState, startIllnessConversation } from "../src/illness-db.ts";
import { answerScheduleConversation, startScheduleConversation } from "../src/schedule-management-db.ts";

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

test("ordinary cancellation becomes an illness absence and confirmed sessions are not marked missed", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  sqlite.exec("INSERT INTO schedule_rules(user_id,weekday,focus)VALUES(1,1,'chest'),(1,3,'back'),(1,5,'legs')");
  sqlite.prepare("INSERT INTO workout_sessions(user_id,local_date,focus,source_ref,confirmed_at)VALUES(1,'2026-08-28','legs','completed-friday','2026-08-28T18:00:00Z')").run();
  sqlite.prepare("INSERT INTO workout_plans(user_id,planned_for,focus,status,generated_json)VALUES(1,'2026-08-31','chest','sent','{}')").run();

  await startScheduleConversation(db, 1, "2026-08-31");
  assert.match(await answerScheduleConversation(db, 1, "отменить", "2026-08-31") ?? "", /днём отдыха/);
  assert.match(await answerScheduleConversation(db, 1, "сегодня", "2026-08-31") ?? "", /обычный/);
  assert.equal((sqlite.prepare("SELECT reason FROM training_absences WHERE local_date='2026-08-31'").get() as { reason: string }).reason, "ordinary");

  await startIllnessConversation(db, 1);
  assert.match(await answerIllnessConversation(db, 1, "заболел", "2026-08-31") ?? "", /Когда началась/);
  assert.match(await answerIllnessConversation(db, 1, "2026-08-28", "2026-08-31") ?? "", /Пропусков по болезни учтено: 1/);
  const absence = sqlite.prepare("SELECT local_date,focus,reason FROM training_absences").get() as { local_date: string; focus: string; reason: string };
  assert.deepEqual({ ...absence }, { local_date: "2026-08-31", focus: "chest", reason: "illness" });
  assert.equal((sqlite.prepare("SELECT status FROM workout_plans WHERE planned_for='2026-08-31'").get() as { status: string }).status, "skipped");
  assert.ok((await loadIllnessTrainingState(db, 1, "2026-09-02")).active);
  sqlite.close();
});

test("two confirmed workouts, not calendar skips, complete the return ramp", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  sqlite.exec("INSERT INTO schedule_rules(user_id,weekday,focus)VALUES(1,1,'chest'),(1,3,'back'),(1,5,'legs')");
  sqlite.prepare("INSERT INTO illness_episodes(user_id,started_on)VALUES(1,'2026-08-28')").run();
  await startIllnessConversation(db, 1);
  await answerIllnessConversation(db, 1, "выздоровел", "2026-09-01");
  assert.match(await answerIllnessConversation(db, 1, "сегодня", "2026-09-01") ?? "", /Следующие две/);

  assert.equal((await loadIllnessTrainingState(db, 1, "2026-09-02")).phase, 1);
  assert.equal((await loadIllnessTrainingState(db, 1, "2026-09-09")).phase, 1);
  sqlite.prepare("INSERT INTO workout_sessions(user_id,local_date,focus,source_ref,confirmed_at)VALUES(1,'2026-09-02','back','return-1','2026-09-02T18:00:00Z')").run();
  assert.equal((await loadIllnessTrainingState(db, 1, "2026-09-04")).phase, 2);
  sqlite.prepare("INSERT INTO workout_sessions(user_id,local_date,focus,source_ref,confirmed_at)VALUES(1,'2026-09-04','legs','return-2','2026-09-04T18:00:00Z')").run();
  assert.equal((await loadIllnessTrainingState(db, 1, "2026-09-07")).phase, null);
  sqlite.close();
});
