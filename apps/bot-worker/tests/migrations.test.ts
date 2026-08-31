import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrationsDirectory = resolve(import.meta.dirname, "../../../db/migrations");
const migrationFiles = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort();

test("all migrations build a fresh database and enforce illness invariants", () => {
  const database = new DatabaseSync(":memory:");
  for (const filename of migrationFiles) {
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

test("measurement migration expires only unfinished legacy dialogs", () => {
  const database = new DatabaseSync(":memory:");
  for (const filename of migrationFiles.filter((name) => name < "0037")) {
    database.exec(readFileSync(resolve(migrationsDirectory, filename), "utf8"));
  }
  database.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  database.prepare("INSERT INTO measurement_conversations(user_id,step,values_json,status,expires_at)VALUES(1,3,'{}','pending','2099-01-01')").run();
  database.prepare("INSERT INTO measurement_conversations(user_id,step,values_json,status,expires_at)VALUES(1,5,'{}','completed','2099-01-01')").run();
  database.exec(readFileSync(resolve(migrationsDirectory, "0037_measurement_breathing_phases.sql"), "utf8"));
  const statuses = database.prepare("SELECT status FROM measurement_conversations ORDER BY id").all().map((row) => row.status);
  assert.deepEqual(statuses, ["expired", "completed"]);
  database.prepare("INSERT INTO measurement_conversations(user_id,step,status,expires_at)VALUES(1,7,'pending','2099-01-01')").run();
  assert.throws(
    () => database.prepare("INSERT INTO measurement_conversations(user_id,step,status,expires_at)VALUES(1,8,'pending','2099-01-01')").run(),
    /CHECK constraint failed/,
  );
  database.close();
});

test("transient Telegram messages are unique per chat and message", () => {
  const database = new DatabaseSync(":memory:");
  for (const filename of migrationFiles) {
    database.exec(readFileSync(resolve(migrationsDirectory, filename), "utf8"));
  }
  database.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  database.prepare(`INSERT INTO transient_dialog_messages(
    user_id,chat_id,message_id,dialog_key,direction
  )VALUES(1,123,10,'measurement:1','incoming')`).run();
  assert.throws(
    () => database.prepare(`INSERT INTO transient_dialog_messages(
      user_id,chat_id,message_id,dialog_key,direction
    )VALUES(1,123,10,'measurement:1','incoming')`).run(),
    /UNIQUE constraint failed/,
  );
  database.close();
});
