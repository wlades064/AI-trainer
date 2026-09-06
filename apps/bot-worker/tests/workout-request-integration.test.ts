import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import worker from "../src/index.ts";
import type { D1Database, D1PreparedStatement, D1Result } from "../src/db.ts";
import { localDateAt, toIsoDate } from "../src/domain/schedule.ts";

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
  title: "Сохранённая тренировка",
  warmup: [],
  exercises: [],
  cooldown: [],
  safetyNotes: [],
  programmingRationale: ["test"],
});

function seedCachedWorkout(sqlite: DatabaseSync): string {
  const today = toIsoDate(localDateAt(new Date(), "Europe/Samara"));
  sqlite.prepare("INSERT INTO users(telegram_user_id,timezone)VALUES('123','Europe/Samara')").run();
  sqlite.prepare("INSERT INTO schedule_exceptions(user_id,local_date,focus,reason)VALUES(1,?,'chest','test')").run(today);
  sqlite.prepare(`INSERT INTO workout_plans(user_id,planned_for,focus,status,generated_json,created_at)
    VALUES(1,?,'chest','sent',?,'2000-01-01 00:00:00')`).run(today, cachedWorkout);
  return today;
}

async function sendText(db: D1Database, updateId: number, text: string, geminiResponse?: unknown): Promise<string> {
  const originalFetch = globalThis.fetch;
  let sentText = "";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("generativelanguage.googleapis.com")) {
      if (!geminiResponse) throw new Error(`Unexpected external request: ${url}`);
      return Response.json({
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80 },
        candidates: [{ content: { parts: [{ text: JSON.stringify(geminiResponse) }] } }],
      });
    }
    if (!url.includes("api.telegram.org") || !url.endsWith("/sendMessage")) {
      throw new Error(`Unexpected external request: ${url}`);
    }
    sentText = (JSON.parse(String(init?.body)) as { text: string }).text;
    return Response.json({ ok: true, result: { message_id: updateId + 1000 } });
  };
  try {
    const request = new Request("https://worker.test/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "webhook-secret",
      },
      body: JSON.stringify({
        update_id: updateId,
        message: { message_id: updateId, from: { id: 123 }, chat: { id: 123 }, text },
      }),
    });
    const response = await worker.fetch(request, {
      DB: db,
      APP_TIMEZONE: "Europe/Samara",
      TELEGRAM_BOT_TOKEN: "telegram-secret",
      TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
      ALLOWED_TELEGRAM_USER_ID: "123",
      GEMINI_API_KEY: "gemini-secret",
      GEMINI_MODEL: "test-model",
    });
    assert.equal(response.status, 200);
    return sentText;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("menu opens buttons with a short illness hint instead of obsolete commands", async () => {
  const { db, sqlite } = testDatabase();
  try {
    const reply = await sendText(db, 500, "/menu");
    assert.match(reply, /🤒 Болезнь/);
    assert.match(reply, /выздоровел/);
    assert.ok(reply.length < 200);
    assert.doesNotMatch(reply, /\/tomorrow|\/progression|\/schedule|\/recovery|\/status|\/help/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM illness_episodes").get()!.count, 0);
  } finally { sqlite.close(); }
});

test("webhook rejects tomorrow before creating a user or calling an external generator", async () => {
  const { db, sqlite } = testDatabase();

  const reply = await sendText(db, 501, "/tomorrow");

  assert.match(reply, /только в день тренировки/i);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM users").get()!.count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM workout_plans").get()!.count, 0);
  sqlite.close();
});

test("cached workout cannot bypass an active illness", async () => {
  const { db, sqlite } = testDatabase();
  const today = seedCachedWorkout(sqlite);
  sqlite.prepare("INSERT INTO illness_episodes(user_id,started_on)VALUES(1,?)").run(today);

  const reply = await sendText(db, 502, "/today");

  assert.match(reply, /болезнь отмечена активной/i);
  assert.doesNotMatch(reply, /Сохранённая тренировка/);
  sqlite.close();
});

test("cached workout cannot bypass readiness red flags", async () => {
  const { db, sqlite } = testDatabase();
  const today = seedCachedWorkout(sqlite);
  sqlite.prepare(`INSERT INTO readiness_checkins(
    user_id,local_date,sleep_minutes,sleep_quality,energy,pain,has_new_swelling,
    source,decision,reasons_json,completed_at
  )VALUES(1,?,480,4,4,0,1,'telegram','blocked','["новый отёк"]',CURRENT_TIMESTAMP)`).run(today);

  const reply = await sendText(db, 503, "/today");

  assert.match(reply, /тренировку не составляю/i);
  assert.match(reply, /отёк/i);
  assert.doesNotMatch(reply, /Сохранённая тренировка/);
  sqlite.close();
});

test("cached workout cannot bypass a missing completed checkin", async () => {
  const { db, sqlite } = testDatabase();
  seedCachedWorkout(sqlite);

  const reply = await sendText(db, 504, "/today");

  assert.match(reply, /чекин 1\/5/i);
  assert.doesNotMatch(reply, /восстановлени[ея] 1\/6/i);
  assert.doesNotMatch(reply, /Сохранённая тренировка/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM readiness_conversations WHERE status='pending'").get()!.count, 1);
  sqlite.close();
});

test("today lets Gemini choose recovery mode without starting a recovery questionnaire", async () => {
  const { db, sqlite } = testDatabase();
  const today = seedCachedWorkout(sqlite);
  sqlite.prepare(`INSERT INTO readiness_checkins(
    user_id,local_date,sleep_minutes,sleep_quality,energy,pain,has_new_swelling,
    has_instability,feels_unwell,source,decision,reasons_json,completed_at
  )VALUES(1,?,360,2,2,0,0,0,0,'telegram','allowed','[]',CURRENT_TIMESTAMP)`).run(today);
  sqlite.prepare("INSERT INTO exercises(name,muscle_group)VALUES('Жим гантелей лёжа','chest')").run();
  sqlite.prepare("INSERT INTO user_exercise_settings(user_id,exercise_id,workout_role)VALUES(1,1,'main')").run();
  sqlite.prepare("INSERT INTO training_program_state(user_id,focus,next_emphasis)VALUES(1,'chest','upper_chest')").run();

  const reply = await sendText(db, 505, "/today", {
    loadMode: "normal",
    recoveryRationale: ["Gemini оценил совокупность данных и оставил обычный режим"],
    title: "Тренировка по решению Gemini",
    warmup: [],
    exercises: [{
      name: "Жим гантелей лёжа",
      sets: 3,
      reps: "10-12",
      weightGuidance: "Подобрать по технике",
      restSeconds: 90,
      notes: "Оставить запас повторений",
    }],
    cooldown: [],
    safetyNotes: ["Прекратить при боли"],
    programmingRationale: ["Режим выбран по текущему восстановлению"],
  });

  assert.match(reply, /Тренировка по решению Gemini/);
  assert.doesNotMatch(reply, /восстановлени[ея] 1\/6/i);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM recovery_conversations").get()!.count, 0);
  const assessment = sqlite.prepare(
    "SELECT recommendation,trigger_kind FROM deload_assessments WHERE user_id=1 AND assessed_on=?",
  ).get(today) as { recommendation: string; trigger_kind: string };
  assert.deepEqual({ ...assessment }, { recommendation: "normal", trigger_kind: "none" });
  sqlite.close();
});
