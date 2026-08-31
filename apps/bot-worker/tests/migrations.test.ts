import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

test("all migrations build a fresh database and enforce illness invariants", () => {
  const database = new DatabaseSync(":memory:");
  const migrationsDirectory = resolve(import.meta.dirname, "../../../db/migrations");
  for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(resolve(migrationsDirectory, filename), "utf8"));
  }
  database.prepare("INSERT INTO users(telegram_user_id)VALUES(?)").run("owner");
  database.prepare("INSERT INTO illness_episodes(user_id,started_on)VALUES(1,'2026-08-28')").run();
  assert.throws(
    () => database.prepare("INSERT INTO illness_episodes(user_id,started_on)VALUES(1,'2026-08-30')").run(),
    /UNIQUE constraint failed/,
  );
  database.prepare("INSERT INTO training_absences(user_id,local_date,focus,reason,illness_episode_id,source_kind)VALUES(1,'2026-08-31','chest','illness',1,'illness_backfill')").run();
  assert.throws(
    () => database.prepare("INSERT INTO training_absences(user_id,local_date,focus,reason)VALUES(1,'2026-08-31','chest','ordinary')").run(),
    /UNIQUE constraint failed/,
  );
  assert.throws(
    () => database.prepare("INSERT INTO training_absences(user_id,local_date,focus,reason)VALUES(1,'2026-09-02','back','illness')").run(),
    /CHECK constraint failed/,
  );
  database.close();
});
