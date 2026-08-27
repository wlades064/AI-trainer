import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { restoreAndInspect } from "./verify-sqlite.mjs";

test("SQL export restores into an isolated SQLite database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-trainer-sql-verify-"));
  try {
    const sqlPath = join(directory, "export.sql");
    const databasePath = join(directory, "restored.sqlite3");
    await writeFile(sqlPath, `
      CREATE TABLE users(id INTEGER PRIMARY KEY);
      CREATE TABLE set_logs(id INTEGER PRIMARY KEY, session_id INTEGER REFERENCES workout_sessions(id));
      INSERT INTO set_logs(id,session_id) VALUES(1,1);
      CREATE TABLE workout_sessions(id INTEGER PRIMARY KEY, confirmed_at TEXT);
      INSERT INTO users(id) VALUES(1);
      INSERT INTO workout_sessions(id,confirmed_at) VALUES(1,'2026-08-26'),(2,NULL);
    `);
    assert.deepEqual(await restoreAndInspect(sqlPath, databasePath), {
      tablesCount: 3,
      usersCount: 1,
      confirmedWorkouts: 1,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
