import test from "node:test";
import assert from "node:assert/strict";
import { commandFromMenuText, MAIN_MENU_MARKUP } from "../src/menu.ts";

test("menu buttons map to existing commands", () => {
  assert.equal(commandFromMenuText("🏋️ Сегодня"), "/today");
  assert.equal(commandFromMenuText("📊 Прогресс"), "/progress");
  assert.equal(commandFromMenuText("📈 Силовые"), "/strength");
  assert.equal(commandFromMenuText("🦴 Травмы"), "/injuries");
  assert.equal(commandFromMenuText("🔄 Возврат"), "/reintroductions");
  assert.equal(commandFromMenuText("⚙️ Упражнения"), "/exercises");
  assert.equal(commandFromMenuText("🗓 Расписание"), "/schedule");
  assert.equal(commandFromMenuText("⏰ Напоминания"), "/reminders");
  assert.equal(commandFromMenuText("🧭 Итоги"), "/review");
  assert.equal(commandFromMenuText("🧠 Программа"), "/program");
  assert.equal(commandFromMenuText("📋 Данные"), "/status");
  assert.equal(commandFromMenuText("🤖 ИИ-лимит"), "/usage");
  assert.equal(commandFromMenuText("📦 Экспорт"), "/export");
  assert.equal(commandFromMenuText("обычный отчёт"), "обычный отчёт");
});

test("main menu stays compact and persistent", () => {
  assert.equal(MAIN_MENU_MARKUP.keyboard.length, 11);
  assert.equal(MAIN_MENU_MARKUP.is_persistent, true);
  assert.ok(MAIN_MENU_MARKUP.keyboard.every((row) => row.length >= 1 && row.length <= 2));
});
