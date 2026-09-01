import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";
import { loadAutomaticRecoveryInput, recordAutomaticRecoveryAssessment } from "../src/automatic-recovery-db.ts";
import type { ReadinessRecord } from "../src/pre-workout-readiness-db.ts";

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

const readiness = (overrides: Partial<ReadinessRecord> = {}): ReadinessRecord => ({
  completedAt: "2026-08-31 08:00:00",
  sleepMinutes: 480,
  sleepQuality: 4,
  energy: 4,
  pain: 0,
  hasNewSwelling: false,
  hasInstability: false,
  feelsUnwell: false,
  ...overrides,
});

test("recovery input exposes recent checkins and persists the decision made by Gemini", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  sqlite.prepare(`INSERT INTO training_load_state(user_id,current_block_started_on,completed_hard_weeks,baseline_reason)
    VALUES(1,'2026-07-01',4,'test')`).run();
  for (const [date, ref] of [["2026-08-24", "one"], ["2026-08-28", "two"]]) {
    sqlite.prepare(`INSERT INTO workout_sessions(
      user_id,local_date,focus,source_ref,confirmed_at,session_effort,last_set_rir,pain_json,
      post_workout_wellbeing,technique_stable,recovery_checkin_at
    )VALUES(1,?,'back',?,CURRENT_TIMESTAMP,9,0,'{"anyPain":true}',2,0,CURRENT_TIMESTAMP)`).run(date, ref);
  }

  const input = await loadAutomaticRecoveryInput(db, 1, "2026-08-31", readiness(), false, null);
  assert.equal(input.completedHardWeeks, 4);
  assert.equal(input.recentCheckins.length, 2);
  assert.equal(input.recentCheckins[0].painReported, true);

  await recordAutomaticRecoveryAssessment(db, 1, "2026-08-31", input, {
    decision: "deload",
    reasons: ["Gemini учёл накопленную усталость и два тяжёлых чекина"],
  });

  const assessment = sqlite.prepare(`SELECT recommendation,trigger_kind,completed_hard_weeks
    FROM deload_assessments WHERE user_id=1 AND assessed_on='2026-08-31'`).get() as {
      recommendation: string; trigger_kind: string; completed_hard_weeks: number;
    };
  assert.deepEqual({ ...assessment }, { recommendation: "deload", trigger_kind: "reactive", completed_hard_weeks: 4 });
  assert.equal((sqlite.prepare("SELECT deload_until FROM training_load_state WHERE user_id=1").get() as { deload_until: string }).deload_until, "2026-09-06");
  sqlite.close();
});

test("low sleep remains factual input until the Gemini decision is recorded", async () => {
  const { db, sqlite } = testDatabase();
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  sqlite.prepare(`INSERT INTO training_load_state(user_id,current_block_started_on,completed_hard_weeks,baseline_reason)
    VALUES(1,'2026-08-01',0,'test')`).run();

  const input = await loadAutomaticRecoveryInput(
    db,
    1,
    "2026-08-31",
    readiness({ sleepQuality: 2, energy: 2 }),
    false,
    null,
  );

  assert.equal(input.readiness.sleepQuality, 2);
  assert.equal(input.readiness.energy, 2);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM deload_assessments").get()!.count, 0);

  await recordAutomaticRecoveryAssessment(db, 1, "2026-08-31", input, {
    decision: "reduced",
    reasons: ["Gemini выбрал облегчённый режим после оценки общей картины"],
  });

  assert.equal((sqlite.prepare("SELECT recommendation FROM deload_assessments WHERE user_id=1").get() as { recommendation: string }).recommendation, "monitor");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM recovery_conversations").get()!.count, 0);
  sqlite.close();
});
