import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement } from "../src/db.ts";
import {
  forgetTransientDialogs,
  loadActiveTransientDialogs,
  loadOrphanedTransientDialogKeys,
  loadTransientMessagesForCleanup,
  recordTransientMessage,
} from "../src/transient-dialog-db.ts";
import { cleanupTransientDialogs } from "../src/transient-dialog-cleanup.ts";
import { deliverReplyWithTransientCleanup } from "../src/transient-dialog-delivery.ts";

function sqliteD1(database: DatabaseSync): D1Database {
  return {
    prepare(query: string): D1PreparedStatement {
      let values: SQLInputValue[] = [];
      return {
        bind(...bound: unknown[]) { values = bound as SQLInputValue[]; return this; },
        async first<T>() { return (database.prepare(query).get(...values) as T | undefined) ?? null; },
        async all<T>() { return { results: database.prepare(query).all(...values) as T[] }; },
        async run() { database.prepare(query).run(...values); return {}; },
      };
    },
  };
}

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  const directory = resolve(import.meta.dirname, "../../../db/migrations");
  for (const filename of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(resolve(directory, filename), "utf8"));
  }
  database.prepare("INSERT INTO users(telegram_user_id)VALUES('owner')").run();
  return database;
}

test("active transient dialogs use stable flow keys and exclude workout report drafts", async () => {
  const database = migratedDatabase();
  const db = sqliteD1(database);
  database.prepare("INSERT INTO measurement_conversations(user_id,step,status,expires_at)VALUES(1,1,'pending','2099-01-01')").run();
  database.prepare("INSERT INTO readiness_conversations(user_id,requested_date,step,status,expires_at)VALUES(1,'2099-01-01',1,'pending','2099-01-01')").run();
  database.prepare("INSERT INTO workout_plans(user_id,planned_for,focus,status,generated_json)VALUES(1,'2099-01-01','chest','sent','{}')").run();
  database.prepare("INSERT INTO workout_report_drafts(user_id,plan_id,source_update_id,raw_text,parsed_json,status,expires_at)VALUES(1,1,10,'report','{}','pending','2099-01-01')").run();

  const dialogs = await loadActiveTransientDialogs(db, 1);

  assert.deepEqual(dialogs.map((item) => item.flowType), ["readiness", "measurement"]);
  assert.ok(dialogs.every((item) => item.dialogKey === `${item.flowType}:${item.flowId}`));
  database.close();
});

test("message registry keeps one row per Telegram message and returns only deletable messages", async () => {
  const database = migratedDatabase();
  const db = sqliteD1(database);
  await recordTransientMessage(db, 1, 123, 10, "measurement:1", "incoming");
  await recordTransientMessage(db, 1, 123, 11, "measurement:1", "outgoing");
  await recordTransientMessage(db, 1, 123, 11, "measurement:1", "outgoing");
  database.prepare(`INSERT INTO transient_dialog_messages(
    user_id,chat_id,message_id,dialog_key,direction,created_at
  )VALUES(1,123,12,'measurement:1','incoming',datetime('now','-3 days'))`).run();

  const messages = await loadTransientMessagesForCleanup(db, 1, ["measurement:1"]);

  assert.deepEqual(messages.map((item) => item.messageId), [10, 11]);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 3);
  await forgetTransientDialogs(db, 1, ["measurement:1"]);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 0);
  database.close();
});

test("cleanup forgets registry rows only after Telegram deletion succeeds", async () => {
  const database = migratedDatabase();
  const db = sqliteD1(database);
  await recordTransientMessage(db, 1, 123, 20, "measurement:2", "incoming");
  await recordTransientMessage(db, 1, 123, 21, "measurement:2", "outgoing");
  const calls: Array<{ chatId: number; messageIds: number[] }> = [];

  const deleted = await cleanupTransientDialogs(db, 1, ["measurement:2"], async (chatId, messageIds) => {
    calls.push({ chatId, messageIds });
  });

  assert.equal(deleted, 2);
  assert.deepEqual(calls, [{ chatId: 123, messageIds: [20, 21] }]);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 0);
  database.close();
});

test("cleanup failure preserves registry rows for a safe retry", async () => {
  const database = migratedDatabase();
  const db = sqliteD1(database);
  await recordTransientMessage(db, 1, 123, 30, "measurement:3", "incoming");

  await assert.rejects(
    cleanupTransientDialogs(db, 1, ["measurement:3"], async () => { throw new Error("Telegram unavailable"); }),
    /Telegram unavailable/,
  );

  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 1);
  database.close();
});

test("retry selection excludes the currently active dialog", async () => {
  const database = migratedDatabase();
  const db = sqliteD1(database);
  await recordTransientMessage(db, 1, 123, 31, "measurement:active", "incoming");
  await recordTransientMessage(db, 1, 123, 32, "direct:old", "incoming");

  const keys = await loadOrphanedTransientDialogKeys(db, 1, ["measurement:active"]);

  assert.deepEqual(keys, ["direct:old"]);
  database.close();
});

test("reply delivery registers both sides before deleting a completed dialog", async () => {
  const database = migratedDatabase();
  const db = sqliteD1(database);
  await recordTransientMessage(db, 1, 123, 40, "measurement:4", "outgoing");
  const deletedBatches: number[][] = [];

  await deliverReplyWithTransientCleanup({
    db,
    userId: 1,
    chatId: 123,
    incomingMessageId: 41,
    reply: "Замеры сохранены",
    plan: {
      incomingDialogKey: "measurement:4",
      outgoingDialogKey: "measurement:4",
      cleanupDialogKeys: ["measurement:4"],
    },
    sendMessage: async () => 42,
    deleteMessages: async (_chatId, messageIds) => {
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 3);
      deletedBatches.push(messageIds);
    },
    onCleanupFailure: async () => assert.fail("cleanup should not fail"),
  });

  assert.deepEqual(deletedBatches, [[40, 41, 42]]);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 0);
  database.close();
});

test("a readiness result stays in chat while prior checkin messages are deleted", async () => {
  const database = migratedDatabase();
  const db = sqliteD1(database);
  await recordTransientMessage(db, 1, 123, 50, "readiness:5", "outgoing");
  let deleted: number[] = [];

  await deliverReplyWithTransientCleanup({
    db,
    userId: 1,
    chatId: 123,
    incomingMessageId: 51,
    reply: "Готовая тренировка",
    plan: { incomingDialogKey: "readiness:5", cleanupDialogKeys: ["readiness:5"] },
    sendMessage: async () => 52,
    deleteMessages: async (_chatId, messageIds) => { deleted = messageIds; },
    onCleanupFailure: async () => assert.fail("cleanup should not fail"),
  });

  assert.deepEqual(deleted, [50, 51]);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages WHERE message_id=52").get()!.count, 0);
  database.close();
});

test("delivery reports cleanup errors without failing the saved interaction", async () => {
  const database = migratedDatabase();
  const db = sqliteD1(database);
  let logged = "";

  await deliverReplyWithTransientCleanup({
    db,
    userId: 1,
    chatId: 123,
    incomingMessageId: 60,
    reply: "Сохранено",
    plan: {
      incomingDialogKey: "direct:60",
      outgoingDialogKey: "direct:60",
      cleanupDialogKeys: ["direct:60"],
    },
    sendMessage: async () => 61,
    deleteMessages: async () => { throw new Error("Telegram unavailable"); },
    onCleanupFailure: async (error) => { logged = error instanceof Error ? error.message : "unknown"; },
  });

  assert.equal(logged, "Telegram unavailable");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 2);
  database.close();
});
