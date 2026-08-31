import test from "node:test";
import assert from "node:assert/strict";
import { commandFromMenuText, MAIN_MENU_MARKUP, MEASUREMENT_MENU_MARKUP } from "../src/menu.ts";

test("menu buttons map to existing commands", () => {
  assert.equal(commandFromMenuText("🏋️ Сегодня"), "/today");
  assert.equal(commandFromMenuText("📊 Прогресс"), "/progress");
  assert.equal(commandFromMenuText("📈 Силовые"), "/strength");
  assert.equal(commandFromMenuText("🦴 Травмы"), "/injuries");
  assert.equal(commandFromMenuText("🤒 Болезнь"), "/illness");
  assert.equal(commandFromMenuText("🧪 Возврат упражнения"), "/reintroductions");
  assert.equal(commandFromMenuText("❌ Отмена"), "/cancel");
  assert.equal(commandFromMenuText("⚙️ Упражнения"), "/exercises");
  assert.equal(commandFromMenuText("🧭 Итоги"), "/review");
  assert.equal(commandFromMenuText("🧠 Программа"), "/program");
  assert.equal(commandFromMenuText("🤖 ИИ-лимит"), "/usage");
  assert.equal(commandFromMenuText("📦 Экспорт"), "/export");
  assert.equal(commandFromMenuText("📅 Завтра"), "📅 Завтра");
  assert.equal(commandFromMenuText("🩺 Восстановление"), "🩺 Восстановление");
  assert.equal(commandFromMenuText("🗓 Расписание"), "🗓 Расписание");
  assert.equal(commandFromMenuText("⏰ Напоминания"), "⏰ Напоминания");
  assert.equal(commandFromMenuText("📐 Прогрессия"), "📐 Прогрессия");
  assert.equal(commandFromMenuText("📋 Данные"), "📋 Данные");
  assert.equal(commandFromMenuText("❓ Помощь"), "❓ Помощь");
  assert.equal(commandFromMenuText("обычный отчёт"), "обычный отчёт");
});

test("main menu stays compact and persistent", () => {
  assert.equal(MAIN_MENU_MARKUP.keyboard.length, 9);
  assert.equal(MAIN_MENU_MARKUP.is_persistent, true);
  assert.ok(MAIN_MENU_MARKUP.keyboard.every((row) => row.length === 2));
  assert.deepEqual(MAIN_MENU_MARKUP.keyboard[0], [{ text: "🏋️ Сегодня" }, { text: "❌ Отмена" }]);
});

test("measurement submenu has only create and history actions", () => {
  assert.deepEqual(MEASUREMENT_MENU_MARKUP.inline_keyboard, [[
    { text: "Сделать замеры", callback_data: "measure:new" },
    { text: "История замеров", callback_data: "measure:history" },
  ]]);
  assert.equal(JSON.stringify(MEASUREMENT_MENU_MARKUP).includes("Отмена"), false);
});
