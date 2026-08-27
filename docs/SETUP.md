# Первое подключение

Секреты нельзя отправлять в чат или добавлять в Git. Локально они хранятся только в `apps/bot-worker/.dev.vars`; файл уже исключён из Git.

## 1. Telegram

1. Открыть официального бота `@BotFather`.
2. Выполнить `/newbot` и сохранить выданный токен в `TELEGRAM_BOT_TOKEN`.
3. Написать новому боту любое сообщение.
4. Узнать свой числовой Telegram ID через метод `getUpdates` Bot API и сохранить его в `ALLOWED_TELEGRAM_USER_ID`.
5. Создать случайную строку длиной 32–64 символа для `TELEGRAM_WEBHOOK_SECRET`.

## 2. Gemini

1. Создать бесплатный API key в Google AI Studio.
2. Записать его в `GEMINI_API_KEY`.

Используется `gemini-3.6-flash` через `generateContent`; в модель передаётся минимальный контекст без истории чата. Фактический расход токенов записывается в `ai_usage`.

Worker также применяет локальный дневной предохранитель: `AI_DAILY_REQUEST_LIMIT` и `AI_DAILY_TOKEN_LIMIT`. Текущие значения по умолчанию — 20 успешных вызовов и 100 000 учтённых токенов за день по Самаре. Это внутренний предел экономии, а не обещание или копия квоты Google; статистика доступна владельцу через `/usage`.

Голосовой фактический отчёт отправляется обычным voice-сообщением Telegram без команды. Worker принимает не более 120 секунд и 4 МБ, использует один структурированный вызов Gemini и не сохраняет исходное аудио. Для проверки реального кодека Telegram после развёртывания нужен один настоящий голосовой отчёт владельца; до `/confirm` выполненная тренировка в историю не переносится.

Персональный экспорт запускается кнопкой «📦 Экспорт» или `/export`, но файл не формируется до отдельной команды `/export_confirm`. Полученный JSON содержит конфиденциальные данные о здоровье и не должен пересылаться посторонним. Для аварийного восстановления используется не JSON, а проверенная зашифрованная SQL-копия из `tools/backup`.

Кнопка «📋 Данные» (`/status`) показывает полноту и свежесть информации и следующие действия для улучшения качества рекомендаций. Запрос не расходует токены Gemini и не выполняет медицинскую интерпретацию.

## 3. Локальная проверка

В каталоге `apps/bot-worker`:

```powershell
pnpm run typecheck
pnpm test
pnpm exec wrangler d1 migrations apply ai-trainer --local
pnpm exec wrangler dev
```

Проверка в другом окне:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

## 4. Бесплатное облако Cloudflare

Следующие команды меняют облачное состояние и выполняются только после входа пользователя:

```powershell
pnpm exec wrangler login
pnpm exec wrangler d1 create ai-trainer
```

Полученный `database_id` нужно заменить в `wrangler.jsonc`, затем:

```powershell
pnpm exec wrangler d1 migrations apply ai-trainer --remote
pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET
pnpm exec wrangler secret put ALLOWED_TELEGRAM_USER_ID
pnpm exec wrangler secret put GEMINI_API_KEY
pnpm exec wrangler deploy
```

После deploy URL Worker регистрируется в Telegram как webhook с путём `/telegram/webhook` и тем же `TELEGRAM_WEBHOOK_SECRET`.

## 5. Что ещё не включено

- Gemini вызывается только для генерации тренировок и явно разрешённых разборов; детерминированные команды не расходуют его токены.
- FatSecret не подключается к постоянному архиву до получения разрешения на хранение либо настройки официального пользовательского экспорта.
- Нейтральная таблица и нормализация носимых показателей уже готовы; Garmin, Xiaomi и Apple Health получат отдельные адаптеры после появления устройства.
