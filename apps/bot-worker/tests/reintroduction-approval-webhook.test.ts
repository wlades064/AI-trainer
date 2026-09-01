import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import worker from "../src/index.ts";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";

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

function seedPendingSafeCheckin(sqlite: DatabaseSync): void {
  sqlite.prepare("INSERT INTO users(telegram_user_id)VALUES('123')").run();
  sqlite.prepare("INSERT INTO exercises(name,muscle_group)VALUES('Тестовое упражнение','legs')").run();
  sqlite.prepare("INSERT INTO user_exercise_settings(user_id,exercise_id,availability)VALUES(1,1,'active')").run();
  sqlite.prepare(`INSERT INTO exercise_reintroduction_plans(user_id,exercise_id,status,load_policy,last_tested_on)
    VALUES(1,1,'testing','минимальный вес','2026-09-01')`).run();
  sqlite.prepare(`INSERT INTO workout_sessions(user_id,completed_at,local_date,focus,source_ref,confirmed_at)
    VALUES(1,CURRENT_TIMESTAMP,'2026-09-01','legs','tested-session',CURRENT_TIMESTAMP)`).run();
  sqlite.prepare("INSERT INTO workout_session_exercises(session_id,exercise_id,position)VALUES(1,1,1)").run();
  sqlite.prepare(`INSERT INTO post_workout_checkins(
    user_id,session_id,step,session_effort,last_set_rir,pain_json,wellbeing,status,expires_at
  )VALUES(1,1,4,7,2,'{"reported":true,"anyPain":false}',4,'pending','2099-01-01')`).run();
}

function env(db: D1Database) {
  return {
    DB: db,
    APP_TIMEZONE: "Europe/Samara",
    TELEGRAM_BOT_TOKEN: "telegram-secret",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    ALLOWED_TELEGRAM_USER_ID: "123",
    GEMINI_API_KEY: "gemini-secret",
    GEMINI_MODEL: "test-model",
  };
}

async function webhook(db: D1Database, update: unknown): Promise<Response> {
  return worker.fetch(new Request("https://worker.test/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "webhook-secret" },
    body: JSON.stringify(update),
  }), env(db));
}

test("safe post-workout checkin sends an inline approval after transient checkin cleanup", async () => {
  const { db, sqlite } = testDatabase();
  seedPendingSafeCheckin(sqlite);
  const sentBodies: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /sendMessage$/);
    sentBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ ok: true, result: { message_id: 800 + sentBodies.length } });
  };
  try {
    const response = await webhook(db, {
      update_id: 700,
      message: { message_id: 700, from: { id: 123 }, chat: { id: 123 }, text: "да" },
    });
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(sentBodies.length, 2);
  assert.match(String(sentBodies[1].text), /Тестовое упражнение/i);
  assert.match(String(sentBodies[1].text), /допустить упражнение/i);
  assert.deepEqual(sentBodies[1].reply_markup, {
    inline_keyboard: [[
      { text: "✅ Допустить", callback_data: "reintro:approve:1:1" },
      { text: "⏸ Оставить на паузе", callback_data: "reintro:pause:1:1" },
    ]],
  });
  sqlite.close();
});

test("callback saves approval before deleting its prompt and leaves only an ephemeral notice", async () => {
  const { db, sqlite } = testDatabase();
  seedPendingSafeCheckin(sqlite);
  sqlite.prepare("UPDATE post_workout_checkins SET technique_stable=1,status='completed',completed_at=CURRENT_TIMESTAMP").run();
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/deleteMessages")) {
      const status = (sqlite.prepare("SELECT status FROM exercise_reintroduction_plans").get() as { status: string }).status;
      assert.equal(status, "established");
      assert.deepEqual(JSON.parse(String(init?.body)), { chat_id: 123, message_ids: [900] });
      calls.push("delete");
      return Response.json({ ok: true, result: true });
    }
    if (url.endsWith("/answerCallbackQuery")) {
      const body = JSON.parse(String(init?.body)) as { text?: string };
      assert.match(body.text ?? "", /допущено/i);
      calls.push("answer");
      return Response.json({ ok: true, result: true });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };
  try {
    const response = await webhook(db, {
      update_id: 701,
      callback_query: {
        id: "callback-701",
        from: { id: 123 },
        data: "reintro:approve:1:1",
        message: { message_id: 900, chat: { id: 123 }, text: "Допустить?" },
      },
    });
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls, ["delete", "answer"]);
  assert.equal((sqlite.prepare("SELECT status FROM exercise_reintroduction_plans").get() as { status: string }).status, "established");
  sqlite.close();
});
