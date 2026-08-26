import test from "node:test";
import assert from "node:assert/strict";
import { commandFromMenuText, MAIN_MENU_MARKUP } from "../src/menu.ts";

test("menu buttons map to existing commands", () => {
  assert.equal(commandFromMenuText("🏋️ Сегодня"), "/today");
  assert.equal(commandFromMenuText("📊 Прогресс"), "/progress");
  assert.equal(commandFromMenuText("📈 Силовые"), "/strength");
  assert.equal(commandFromMenuText("🦴 Травмы"), "/injuries");
  assert.equal(commandFromMenuText("🔄 Возврат"), "/reintroductions");
  assert.equal(commandFromMenuText("обычный отчёт"), "обычный отчёт");
});

test("main menu stays compact and persistent", () => {
  assert.equal(MAIN_MENU_MARKUP.keyboard.length, 8);
  assert.equal(MAIN_MENU_MARKUP.is_persistent, true);
  assert.ok(MAIN_MENU_MARKUP.keyboard.every((row) => row.length >= 1 && row.length <= 2));
});
