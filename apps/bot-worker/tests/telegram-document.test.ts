import test from "node:test";
import assert from "node:assert/strict";
import { sendTelegramDocument } from "../src/telegram.ts";

test("Telegram document upload uses multipart data without putting the token in file content", async () => {
  let requestUrl = "";
  const request = { form: undefined as FormData | undefined };
  const fakeFetch: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    request.form = init?.body as FormData;
    return Response.json({ ok: true });
  };
  await sendTelegramDocument("secret-token", 123, "export.json", "{\"health\":true}", "private", fakeFetch);
  assert.match(requestUrl, /sendDocument$/);
  assert.ok(request.form);
  assert.equal(request.form.get("chat_id"), "123");
  assert.equal(request.form.get("caption"), "private");
  const file = request.form.get("document") as File;
  assert.equal(file.name, "export.json");
  assert.equal(await file.text(), "{\"health\":true}");
  assert.doesNotMatch(await file.text(), /secret-token/);
});
