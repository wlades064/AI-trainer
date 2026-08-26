export const MENU_COMMANDS: Readonly<Record<string, string>> = {
  "🏋️ Сегодня": "/today",
  "📅 Завтра": "/tomorrow",
  "🎯 Цель": "/goal",
  "📊 Прогресс": "/progress",
  "📈 Силовые": "/strength",
  "📏 Замеры": "/measure",
  "⚖️ Вес": "/weight",
  "🍽 КБЖУ": "/nutrition",
  "💊 Добавки": "/supplements",
  "🧪 Анализы": "/labs",
  "🩺 Восстановление": "/recovery",
  "🦴 Травмы": "/injuries",
  "🔄 Возврат": "/reintroductions",
  "⚙️ Упражнения": "/exercises",
  "🗓 Расписание": "/schedule",
  "⏰ Напоминания": "/reminders",
  "❓ Помощь": "/help",
};

export const MAIN_MENU_MARKUP = {
  keyboard: [
    [{ text: "🏋️ Сегодня" }, { text: "📅 Завтра" }],
    [{ text: "🎯 Цель" }, { text: "📊 Прогресс" }],
    [{ text: "📈 Силовые" }, { text: "🩺 Восстановление" }],
    [{ text: "📏 Замеры" }, { text: "⚖️ Вес" }],
    [{ text: "🍽 КБЖУ" }, { text: "💊 Добавки" }],
    [{ text: "🧪 Анализы" }, { text: "⚙️ Упражнения" }],
    [{ text: "🦴 Травмы" }, { text: "🔄 Возврат" }],
    [{ text: "🗓 Расписание" }, { text: "⏰ Напоминания" }],
    [{ text: "❓ Помощь" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Выбери действие или напиши сообщение",
} as const;

export function commandFromMenuText(text: string): string {
  return MENU_COMMANDS[text.trim()] ?? text.trim();
}
