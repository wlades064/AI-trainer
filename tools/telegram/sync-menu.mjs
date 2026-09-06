import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { MAIN_MENU_MARKUP, MENU_INTRO, TELEGRAM_MENU_COMMANDS } from "../../apps/bot-worker/src/menu.ts";

const env = parseEnv(await readFile(new URL("../../apps/bot-worker/.dev.vars", import.meta.url), "utf8"));
const token = env.TELEGRAM_BOT_TOKEN;
const chatId = Number(env.ALLOWED_TELEGRAM_USER_ID);
if (!token || !Number.isSafeInteger(chatId) || chatId <= 0) throw new Error("Missing Telegram configuration");

async function api(method, body) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new Error(`Telegram ${method}: network request failed`); }
  if (!response.ok) throw new Error(`Telegram ${method}: HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(`Telegram ${method}: API rejected request`);
  return payload.result;
}

const apply = process.argv.includes("--apply");
const scopes = [{ type: "default" }, { type: "all_private_chats" }, { type: "chat", chat_id: chatId }];
for (const scope of scopes) {
  for (const language_code of ["", "ru", "en"]) {
    const options = { scope, language_code };
    if (apply) await api("setMyCommands", { ...options, commands: TELEGRAM_MENU_COMMANDS });
    const commands = await api("getMyCommands", options);
    if (apply && JSON.stringify(commands) !== JSON.stringify(TELEGRAM_MENU_COMMANDS)) throw new Error("Telegram menu verification failed");
    console.log(JSON.stringify({ scope: scope.type, language: language_code || "default", commands }));
  }
}
if (apply) {
  await api("setChatMenuButton", { chat_id: chatId, menu_button: { type: "commands" } });
  const button = await api("getChatMenuButton", { chat_id: chatId });
  if (button.type !== "commands") throw new Error("Telegram menu button verification failed");
  const sent = await api("sendMessage", { chat_id: chatId, text: MENU_INTRO, reply_markup: MAIN_MENU_MARKUP });
  if (!Number.isSafeInteger(sent.message_id)) throw new Error("Telegram keyboard delivery failed");
  console.log("Current keyboard delivered to owner; no health records changed.");
}
