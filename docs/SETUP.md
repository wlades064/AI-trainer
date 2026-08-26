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

Используется `gemini-3.7-flash` и новый Interactions API. Запросы отправляются с `store: false`; в модель передаётся минимальный контекст. Расход токенов будет записываться в `ai_usage`.

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

- Gemini пока подготовлен и протестирован через имитацию ответа, но не вызывается ботом до появления каталога разрешённых упражнений.
- FatSecret не подключается к постоянному архиву до получения разрешения на хранение либо настройки официального пользовательского экспорта.
- Garmin, Xiaomi и Apple Health будут отдельными адаптерами после появления устройства.
