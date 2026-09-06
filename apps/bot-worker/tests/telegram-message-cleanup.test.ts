import test from "node:test";
import assert from "node:assert/strict";
import { MAIN_MENU_MARKUP, MEASUREMENT_MENU_MARKUP } from "../src/menu.ts";
import { answerTelegramCallbackQuery, deleteTelegramMessages, sendTelegramMessage } from "../src/telegram.ts";

test("sendMessage returns the Telegram message id for later cleanup", async () => {
  const fakeFetch: typeof fetch = async () => Response.json({ ok: true, result: { message_id: 321 } });

  const messageId = await sendTelegramMessage("secret-token", 123, "Вопрос", undefined, fakeFetch);

  assert.equal(messageId, 321);
});

test("ordinary replies restore the current keyboard while inline submenus stay intact", async () => {
  const markups: unknown[] = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    markups.push(JSON.parse(String(init?.body)).reply_markup);
    return Response.json({ ok: true, result: { message_id: 321 } });
  };
  await sendTelegramMessage("test-token", 123, "Ответ", undefined, fakeFetch);
  await sendTelegramMessage("test-token", 123, "Замеры", MEASUREMENT_MENU_MARKUP, fakeFetch);
  assert.deepEqual(markups, [MAIN_MENU_MARKUP, MEASUREMENT_MENU_MARKUP]);
});

test("deleteMessages removes duplicates and sends no more than 100 ids per request", async () => {
  const batches: number[][] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.match(String(input), /deleteMessages$/);
    assert.match(String(input), /secret-token/);
    const body = JSON.parse(String(init?.body)) as { chat_id: number; message_ids: number[] };
    assert.equal(body.chat_id, 123);
    batches.push(body.message_ids);
    return Response.json({ ok: true, result: true });
  };
  const ids = [...Array.from({ length: 205 }, (_, index) => index + 1), 1, 2, -1, 1.5];

  await deleteTelegramMessages("secret-token", 123, ids, fakeFetch);

  assert.deepEqual(batches.map((batch) => batch.length), [100, 100, 5]);
  assert.deepEqual(batches.flat(), Array.from({ length: 205 }, (_, index) => index + 1));
  assert.doesNotMatch(JSON.stringify(batches), /secret-token/);
});

test("deleteMessages rejects a Telegram-level error even with HTTP 200", async () => {
  const fakeFetch: typeof fetch = async () => Response.json({ ok: false, description: "denied" });

  await assert.rejects(
    deleteTelegramMessages("secret-token", 123, [10], fakeFetch),
    /Telegram deleteMessages failed/,
  );
});

test("callback query is acknowledged without exposing the token in its body", async () => {
  let body = "";
  const fakeFetch: typeof fetch = async (_input, init) => {
    body = String(init?.body);
    return Response.json({ ok: true, result: true });
  };

  await answerTelegramCallbackQuery("secret-token", "callback-1", fakeFetch);

  assert.deepEqual(JSON.parse(body), { callback_query_id: "callback-1" });
  assert.doesNotMatch(body, /secret-token/);
});
