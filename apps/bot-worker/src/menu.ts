export const MENU_COMMANDS: Readonly<Record<string, string>> = {
  "🏋️ Сегодня": "/today",
  "❌ Отмена": "/cancel",
  "🎯 Цель": "/goal",
  "📊 Прогресс": "/progress",
  "📈 Силовые": "/strength",
  "📏 Замеры": "/measure",
  "⚖️ Вес": "/weight",
  "🍽 КБЖУ": "/nutrition",
  "💊 Добавки": "/supplements",
  "🧪 Анализы": "/labs",
  "🦴 Травмы": "/injuries",
  "🤒 Болезнь": "/illness",
  "🧪 Возврат упражнения": "/reintroductions",
  "⚙️ Упражнения": "/exercises",
  "🧭 Итоги": "/review",
  "🧠 Программа": "/program",
  "🤖 ИИ-лимит": "/usage",
  "📦 Экспорт": "/export",
};

export const MAIN_MENU_MARKUP = {
  keyboard: [
    [{ text: "🏋️ Сегодня" }, { text: "❌ Отмена" }],
    [{ text: "🎯 Цель" }, { text: "🧠 Программа" }],
    [{ text: "📊 Прогресс" }, { text: "📈 Силовые" }],
    [{ text: "📏 Замеры" }, { text: "⚖️ Вес" }],
    [{ text: "🍽 КБЖУ" }, { text: "💊 Добавки" }],
    [{ text: "🧪 Анализы" }, { text: "⚙️ Упражнения" }],
    [{ text: "🦴 Травмы" }, { text: "🤒 Болезнь" }],
    [{ text: "🧪 Возврат упражнения" }, { text: "🧭 Итоги" }],
    [{ text: "🤖 ИИ-лимит" }, { text: "📦 Экспорт" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Выбери действие или напиши сообщение",
} as const;

export function commandFromMenuText(text: string): string {
  return MENU_COMMANDS[text.trim()] ?? text.trim();
}
