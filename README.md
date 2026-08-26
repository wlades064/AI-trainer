# AI-тренер

Персональный Telegram-бот для планирования тренировок и накопления данных о тренировках, восстановлении и питании.

Полные продуктовые требования находятся в [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## Структура

- `apps/bot-worker` — круглосуточный Telegram webhook на Cloudflare Workers;
- `db/migrations` — схема Cloudflare D1 / SQLite;
- `docs` — архитектурные решения;
- `tools` — локальные импортёры и резервное копирование.

## Реализовано

Первый вертикальный контур включает:

1. проверка Telegram webhook;
2. ограничение доступа одним Telegram ID;
3. профиль и расписание Пн/Ср/Пт в D1;
4. определение тренировочного дня по `Europe/Samara`;
5. фильтр упражнений по ограничениям травм;
6. Gemini Interactions API со структурированным JSON и `store: false`;
7. проверка ответа Gemini по разрешённому каталогу;
8. импорт `.docx` в подтверждаемый JSON-черновик;
9. миграции истории тренировок, питания, замеров и восстановления.

Секреты не должны попадать в Git. Образец переменных находится в `apps/bot-worker/.dev.vars.example`.

## Разработка

В каталоге `apps/bot-worker`:

```powershell
pnpm run typecheck
pnpm test
pnpm exec wrangler d1 migrations apply ai-trainer --local
pnpm exec wrangler dev
```

Подробное первое подключение описано в [docs/SETUP.md](docs/SETUP.md).
