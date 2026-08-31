import test from "node:test";
import assert from "node:assert/strict";
import { deleteTelegramMessages, sendTelegramMessage } from "../src/telegram.ts";

test("sendMessage returns the Telegram message id for later cleanup", async () => {
  const fakeFetch: typeof fetch = async () => Response.json({ ok: true, result: { message_id: 321 } });

  const messageId = await sendTelegramMessage("secret-token", 123, "Вопрос", undefined, fakeFetch);

  assert.equal(messageId, 321);
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
