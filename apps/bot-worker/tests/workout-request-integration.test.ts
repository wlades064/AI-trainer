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

async function sendText(db: D1Database, updateId: number, text: string, geminiResponse?: unknown, deletedBatches?: number[][], media: Partial<import('../src/telegram.ts').TelegramMessage> = {}): Promise<string> {
  const originalFetch = globalThis.fetch;
  let sentText = "";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/sendDocument')) return Response.json({ok:true,result:{message_id:updateId+2000}});
    if ((media.photo || media.document) && url.includes('/getFile')) return Response.json({ok:true,result:{file_path:'fixture.jpg'}});
    if ((media.photo || media.document) && url.includes('/file/bot')) return new Response(media.document
      ? 'Date,Calories,Fat,Carbs,Protein\n2026-09-07,2000,70,230,110\n'
      : new Uint8Array([255,216,255,217]), {headers:{'content-type':media.document?'text/csv':'image/jpeg'}});
    if (url.startsWith("https://api.telegram.org/") && url.endsWith("/deleteMessages")) {
      deletedBatches?.push(JSON.parse(String(init?.body)).message_ids);
      return Response.json({ ok: true, result: true });
    }
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
        message: { message_id: updateId, from: { id: 123 }, chat: { id: 123 }, text, ...media },
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

test("menu deletes its command, replaces itself and disappears after cancel", async () => {
  const { db, sqlite } = testDatabase();
  const deleted: number[][] = [];
  try {
    assert.equal(await sendText(db, 500, "/menu", undefined, deleted), "Меню");
    assert.deepEqual(deleted.flat(), [500]);
    await sendText(db, 501, "/menu", undefined, deleted);
    assert.ok(deleted.flat().includes(1500));
    await sendText(db, 502, "🤒 Болезнь", undefined, deleted);
    assert.ok(!deleted.flat().includes(1501));
    await sendText(db, 503, "❌ Отмена", undefined, deleted);
    assert.ok(deleted.flat().includes(1501));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM illness_episodes").get()!.count, 0);
  } finally { sqlite.close(); }
});

test("a completed informational action removes menu but preserves its result", async () => {
  const { db, sqlite } = testDatabase();
  const deleted: number[][] = [];
  try {
    await sendText(db, 520, "/menu", undefined, deleted);
    const reply = await sendText(db, 521, "🤖 ИИ-лимит", undefined, deleted);
    assert.ok(reply.length > 0);
    assert.ok(deleted.flat().includes(1520));
    assert.ok(!deleted.flat().includes(1521));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 0);
  } finally { sqlite.close(); }
});

test("illness button followed by cancel closes the dialog and deletes its messages", async () => {
  const { db, sqlite } = testDatabase();
  const deleted: number[][] = [];
  try {
    assert.match(await sendText(db, 511, "🤒 Болезнь"), /заболел.*выздоровел/);
    await sendText(db, 512, "❌ Отмена", undefined, deleted);
    assert.deepEqual(deleted.flat().sort((a, b) => a - b), [511, 512, 1511, 1512]);
    assert.equal(sqlite.prepare("SELECT status FROM illness_conversations").get()!.status, "cancelled");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM transient_dialog_messages").get()!.count, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM illness_episodes").get()!.count, 0);
  } finally { sqlite.close(); }
});

test("weight button accepts a plain number and cleans up only after saving", async () => {
  const { db, sqlite } = testDatabase();
  const deleted: number[][] = [];
  try {
    assert.match(await sendText(db, 530, "⚖️ Вес", undefined, deleted), /вес.*кг/i);
    const reply = await sendText(db, 531, "78", undefined, deleted);
    assert.match(reply, /78.*сохран/i);
    assert.equal(sqlite.prepare("SELECT value FROM body_measurements WHERE kind='weight'").get()!.value, 78);
    assert.deepEqual(deleted.flat().sort((a,b)=>a-b), [530,531,1530,1531]);
  } finally { sqlite.close(); }
});

test("weight input validates, supports comma and units, and can be cancelled", async () => {
  const { db, sqlite } = testDatabase();
  try {
    await sendText(db, 540, "⚖️ Вес");
    assert.match(await sendText(db, 541, "500"), /30.*300/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM body_measurements").get()!.count, 0);
    assert.match(await sendText(db, 542, "78,5 кг"), /78.5.*сохран/i);
    await sendText(db, 543, "⚖️ Вес");
    assert.match(await sendText(db, 544, "❌ Отмена"), /вес.*отмен/i);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM body_measurements").get()!.count, 1);
  } finally { sqlite.close(); }
});

for (const [button, answer, table] of [
  ["🎯 Цель", "рекомпозиция", "goal_periods"],
  ["💊 Добавки", "Креатин | 5 г | ежедневно", "supplements"],
  ["🧪 Анализы", "Гемоглобин | 150 | г/л | 130–170", "lab_results"],
] as const) {
  test(`${button} routes an unprefixed answer and removes the completed dialog`, async () => {
    const { db, sqlite } = testDatabase();
    const deleted: number[][] = [];
    try {
      await sendText(db, 600, button, undefined, deleted);
      const reply = await sendText(db, 601, answer, undefined, deleted);
      assert.doesNotMatch(reply, /отправленный план|фактический отчёт/);
      assert.match(reply, /сохранено|цель обновлена/i);
      assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count, 1);
      assert.deepEqual(deleted.flat().sort((a,b)=>a-b), [600,601,1600,1601]);
    } finally { sqlite.close(); }
  });
}

for (const [button, draft, table] of [
  ['🍽 КБЖУ', {date:'2026-09-07',caloriesKcal:2000,proteinG:110,fatG:70,carbohydrateG:230,confidence:1,warnings:[]}, 'nutrition_days'],
  ['🧪 Анализы', {date:'2026-09-07',laboratory:'test',items:[{marker:'Гемоглобин',valueText:'150',unit:'г/л',reference:'130–170'}],confidence:1,warnings:[]}, 'lab_results'],
] as const) {
  test(`${button} accepts an uncaptioned photo only in its input dialog`, async () => {
    const {db,sqlite}=testDatabase();
    try {
      await sendText(db,610,button);
      assert.doesNotMatch(await sendText(db,611,'это файл'), /отправленный план|фактический отчёт/);
      const reply=await sendText(db,612,'',draft,undefined,{photo:[{file_id:'photo',file_unique_id:'photo-unique',width:600,height:800}]});
      assert.match(reply,/черновик/i);
      assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count,0);
      await sendText(db,613,'/confirm');
      assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count,1);
    } finally {sqlite.close();}
  });
}

test('FatSecret waits for an uncaptioned CSV and preserves explicit confirmation',async()=>{
  const {db,sqlite}=testDatabase();
  try {
    await sendText(db,620,'/fatsecret');
    const reply=await sendText(db,621,'',undefined,undefined,{document:{file_id:'csv',file_unique_id:'csv-unique',file_name:'food.csv'}});
    assert.match(reply,/черновик/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM nutrition_days').get()!.count,0);
    await sendText(db,622,'/confirm');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM nutrition_days').get()!.count,1);
  } finally {sqlite.close();}
});

test('another input button cannot steal an answer from illness',async()=>{
  const {db,sqlite}=testDatabase();
  try {
    await sendText(db,630,'🤒 Болезнь');
    assert.match(await sendText(db,631,'🎯 Цель'),/заверши текущий диалог/i);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM command_input_conversations').get()!.count,0);
    assert.doesNotMatch(await sendText(db,632,'не знаю'),/отправленный план|фактический отчёт/);
    await sendText(db,633,'❌ Отмена');
    assert.match(await sendText(db,634,'🎯 Цель'),/напиши цель/i);
  } finally {sqlite.close();}
});

for (const button of ['🎯 Цель','💊 Добавки','🧪 Анализы','🍽 КБЖУ','📦 Экспорт','⚖️ Вес','🦴 Травмы','🤒 Болезнь','🧪 Возврат упражнения','⚙️ Упражнения','/fatsecret','/supplement_stop','/lab_cancel','/labphoto']) {
  test(`${button} keeps an invalid answer in its dialog and supports cancel`,async()=>{
    const {db,sqlite}=testDatabase();
    try {
      await sendText(db,640,button);
      assert.doesNotMatch(await sendText(db,641,'???'),/отправленный план|фактический отчёт/);
      assert.doesNotMatch(await sendText(db,642,'❌ Отмена'),/нечего отменять/i);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM transient_dialog_messages').get()!.count,0);
    } finally {sqlite.close();}
  });
}
for (const button of ['📊 Прогресс','📈 Силовые','🧭 Итоги','🧠 Программа','🤖 ИИ-лимит']) {
  test(`${button} displays information without opening an input dialog`,async()=>{
    const {db,sqlite}=testDatabase();
    try {
      assert.ok((await sendText(db,650,button)).length>0);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM command_input_conversations').get()!.count,0);
    } finally {sqlite.close();}
  });
}
test('export requires explicit confirmation and keeps the export result',async()=>{
  const {db,sqlite}=testDatabase();
  const deleted:number[][]=[];
  try {
    await sendText(db,660,'📦 Экспорт',undefined,deleted);
    assert.match(await sendText(db,661,'подтверждаю экспорт',undefined,deleted),/экспорт|архив/i);
    assert.ok(!deleted.flat().includes(1661));
    assert.equal(sqlite.prepare("SELECT status FROM command_input_conversations").get()!.status,'completed');
  } finally {sqlite.close();}
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
