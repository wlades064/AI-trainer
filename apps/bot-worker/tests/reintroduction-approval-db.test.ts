import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";
import { applyReintroductionApproval, findReintroductionApprovalOffer } from "../src/reintroduction-approval-db.ts";

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

function seedTestedExercise(sqlite: DatabaseSync, options: { pain?: boolean; stable?: boolean; catalogPause?: boolean } = {}): void {
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('123')").run();
  sqlite.prepare("INSERT INTO exercises(name,muscle_group)VALUES('Тестовое упражнение','legs')").run();
  sqlite.prepare("INSERT INTO user_exercise_settings(user_id,exercise_id,availability)VALUES(1,1,?)")
    .run(options.catalogPause ? "paused" : "active");
  if (!options.catalogPause) {
    sqlite.prepare(`INSERT INTO exercise_reintroduction_plans(user_id,exercise_id,status,load_policy,last_tested_on)
      VALUES(1,1,'testing','минимальный вес','2026-09-01')`).run();
  }
  sqlite.prepare(`INSERT INTO workout_sessions(user_id,completed_at,local_date,focus,source_ref,confirmed_at)
    VALUES(1,CURRENT_TIMESTAMP,'2026-09-01','legs','tested-session',CURRENT_TIMESTAMP)`).run();
  sqlite.prepare("INSERT INTO workout_session_exercises(session_id,exercise_id,position)VALUES(1,1,1)").run();
  sqlite.prepare(`INSERT INTO post_workout_checkins(
    user_id,session_id,step,session_effort,last_set_rir,pain_json,wellbeing,technique_stable,status,expires_at,completed_at
  )VALUES(1,1,4,7,2,?,4,?,'completed','2099-01-01',CURRENT_TIMESTAMP)`).run(
    JSON.stringify({ reported: true, anyPain: options.pain ?? false }),
    Number(options.stable ?? true),
  );
}

test("a safe completed checkin offers approval for the tested exercise", async () => {
  const { db, sqlite } = testDatabase();
  seedTestedExercise(sqlite);

  const offer = await findReintroductionApprovalOffer(db, 1, 1);

  assert.deepEqual(offer, { checkinId: 1, exerciseId: 1, exerciseName: "Тестовое упражнение" });
  sqlite.close();
});

test("a manually performed exercise paused in the catalog also offers approval", async () => {
  const { db, sqlite } = testDatabase();
  seedTestedExercise(sqlite, { catalogPause: true });

  const offer = await findReintroductionApprovalOffer(db, 1, 1);

  assert.equal(offer?.exerciseName, "Тестовое упражнение");
  const result = await applyReintroductionApproval(db, 1, "reintro:approve:1:1");
  assert.equal(result.applied, true);
  assert.equal((sqlite.prepare("SELECT availability FROM user_exercise_settings").get() as { availability: string }).availability, "active");
  sqlite.close();
});

test("pain, unstable technique or an active medical restriction suppresses approval", async () => {
  for (const unsafe of [{ pain: true }, { stable: false }]) {
    const { db, sqlite } = testDatabase();
    seedTestedExercise(sqlite, unsafe);
    assert.equal(await findReintroductionApprovalOffer(db, 1, 1), null);
    sqlite.close();
  }

  const { db, sqlite } = testDatabase();
  seedTestedExercise(sqlite);
  sqlite.prepare("INSERT INTO exercise_risk_tags(exercise_id,risk_tag)VALUES(1,'knee_load')").run();
  sqlite.prepare(`INSERT INTO injury_episodes(user_id,body_area,status,avoid_json,starts_on)
    VALUES(1,'колено','active','["knee_load"]','2026-08-01')`).run();
  assert.equal(await findReintroductionApprovalOffer(db, 1, 1), null);
  sqlite.close();
});

test("approval activates the exercise while pause keeps it out of future plans", async () => {
  for (const [action, expectedStatus, expectedAvailability] of [
    ["approve", "established", "active"],
    ["pause", "paused", "paused"],
  ] as const) {
    const { db, sqlite } = testDatabase();
    seedTestedExercise(sqlite);

    const result = await applyReintroductionApproval(db, 1, `reintro:${action}:1:1`);

    assert.equal(result.applied, true);
    assert.match(result.notification, action === "approve" ? /допущено/i : /паузе/i);
    assert.equal((sqlite.prepare("SELECT status FROM exercise_reintroduction_plans").get() as { status: string }).status, expectedStatus);
    assert.equal((sqlite.prepare("SELECT availability FROM user_exercise_settings").get() as { availability: string }).availability, expectedAvailability);
    sqlite.close();
  }
});

test("a callback for another user or an already approved offer cannot change state", async () => {
  const { db, sqlite } = testDatabase();
  seedTestedExercise(sqlite);

  const foreign = await applyReintroductionApproval(db, 999, "reintro:approve:1:1");
  assert.equal(foreign.applied, false);
  assert.equal((sqlite.prepare("SELECT status FROM exercise_reintroduction_plans").get() as { status: string }).status, "testing");

  assert.equal((await applyReintroductionApproval(db, 1, "reintro:approve:1:1")).applied, true);
  assert.equal((await applyReintroductionApproval(db, 1, "reintro:approve:1:1")).applied, false);
  sqlite.close();
});
