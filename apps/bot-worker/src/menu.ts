export const MENU_INTRO = "Выбери действие на кнопках ниже. Чтобы отметить выздоровление: «🤒 Болезнь» → напиши «выздоровел».";

// The native Telegram menu opens commands, not the reply keyboard.
export const TELEGRAM_MENU_COMMANDS = [{ command: "menu", description: "Показать кнопки" }] as const;

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

export const MEASUREMENT_MENU_MARKUP = {
  inline_keyboard: [[
    { text: "Сделать замеры", callback_data: "measure:new" },
    { text: "История замеров", callback_data: "measure:history" },
  ]],
} as const;

export function commandFromMenuText(text: string): string {
  return MENU_COMMANDS[text.trim()] ?? text.trim();
}
