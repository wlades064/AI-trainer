import { addCalendarDays, localDateAt, requestedDayOffset, toIsoDate, trainingForDate } from "./domain/schedule.ts";
import {
  claimTelegramUpdate,
  completeTelegramUpdate,
  ensureUser,
  failTelegramUpdate,
  loadActiveRestrictions,
  loadExistingGeneratedPlan,
  loadExerciseCandidates,
  loadNextTrainingEmphasis,
  loadRecentSummary,
  loadSchedule,
  saveGeneratedPlan,
  type D1Database,
} from "./db.ts";
import { filterSafeExercises } from "./domain/safety.ts";
import { programmingRules } from "./domain/programming.ts";
import { generateWorkout, type GeneratedWorkout } from "./gemini.ts";
import { sendTelegramMessage, type TelegramUpdate } from "./telegram.ts";
import {
  cancelPendingReportDraft,
  confirmPendingReportDraft,
  loadCatalogExerciseNames,
  loadReportPlan,
  saveReportDraft,
} from "./workout-report-db.ts";
import { formatWorkoutReportDraft, parseEditedPlanReport, parseWorkoutReport } from "./workout-report.ts";
import {
  answerPostWorkoutCheckin,
  cancelPostWorkoutCheckin,
  pendingPostWorkoutQuestion,
  startPostWorkoutCheckin,
} from "./post-workout-checkin-db.ts";

interface Env {
  DB: D1Database;
  APP_TIMEZONE: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_TELEGRAM_USER_ID: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
}

const GUIDANCE = {
  chest: ["4 упражнения на грудь", "дополнительно средние дельты и трицепс", "акцент плеч: средние дельты"],
  back: ["4 упражнения на спину", "дополнительно задние дельты и бицепс", "не дублировать одинаковые тяги без причины"],
  legs: ["4 упражнения на ноги", "дополнительно средние дельты", "не использовать упражнения со статусом постепенного возврата без отдельного разрешения", "для коленей только консервативная нагрузка"],
} as const;

function formatWorkout(date: string, workout: GeneratedWorkout, reused = false): string {
  const sections = [
    `${date} — ${workout.title}${reused ? " (уже составлена)" : ""}`,
    workout.warmup.length ? `Разминка:\n${workout.warmup.map((item) => `• ${item}`).join("\n")}` : "",
    workout.exercises.map((exercise, index) => [
      `${index + 1}. ${exercise.name}`,
      `${exercise.sets} подх. × ${exercise.reps}; отдых ${exercise.restSeconds} сек`,
      `Вес: ${exercise.weightGuidance}`,
      exercise.notes,
    ].filter(Boolean).join("\n")).join("\n\n"),
    workout.cooldown.length ? `Завершение:\n${workout.cooldown.map((item) => `• ${item}`).join("\n")}` : "",
    workout.safetyNotes.length ? `Контроль:\n${workout.safetyNotes.map((item) => `• ${item}`).join("\n")}` : "",
  ].filter(Boolean);
  const text = sections.join("\n\n");
  return text.length <= 4000 ? text : `${text.slice(0, 3950)}\n…`;
}

async function workoutReply(offset: 0 | 1, env: Env, telegramUserId: string): Promise<string> {
  const timeZone = env.APP_TIMEZONE || "Europe/Samara";
  const user = await ensureUser(env.DB, telegramUserId, timeZone);
  const schedule = await loadSchedule(env.DB, user.id);
  const local = addCalendarDays(localDateAt(new Date(), timeZone), offset);
  const training = trainingForDate(local, schedule);
  if (training.focus === "rest") {
    return `${training.date}: по базовому расписанию день восстановления.`;
  }
  const existing = await loadExistingGeneratedPlan(env.DB, user.id, training.date, training.focus);
  if (existing) return formatWorkout(training.date, existing, true);

  const emphasis = await loadNextTrainingEmphasis(env.DB, user.id, training.focus);
  if (!emphasis) {
    return `${training.date}: для группы «${training.label}» ещё не задан следующий программный акцент. План не создан, чтобы не выбирать его случайно.`;
  }

  const [candidates, restrictions, recentSummary] = await Promise.all([
    loadExerciseCandidates(env.DB, user.id, training.focus),
    loadActiveRestrictions(env.DB, user.id),
    loadRecentSummary(env.DB, user.id, training.focus),
  ]);
  const safe = filterSafeExercises(candidates, restrictions);
  if (safe.allowed.length === 0) {
    return `${training.date}: не нашлось разрешённых упражнений для группы «${training.label}». План не создан.`;
  }
  try {
    const generated = await generateWorkout(env.GEMINI_API_KEY, env.GEMINI_MODEL, {
      date: training.date,
      focus: training.label,
      emphasis,
      durationMinutes: 90,
      exercises: safe.allowed,
      restrictions,
      recentSummary,
      selectionGuidance: [...GUIDANCE[training.focus], ...programmingRules(training.focus, emphasis)],
    });
    await saveGeneratedPlan(
      env.DB,
      user.id,
      training.date,
      training.focus,
      emphasis,
      env.GEMINI_MODEL,
      generated.workout,
      generated.inputTokens,
      generated.outputTokens,
    );
    return formatWorkout(training.date, generated.workout);
  } catch (error) {
    await env.DB.prepare("INSERT INTO system_events(event_type, payload_json) VALUES ('gemini_generation_failed', ?)")
      .bind(JSON.stringify({ date: training.date, focus: training.focus, error: error instanceof Error ? error.message : "unknown" }))
      .run();
    const last = recentSummary ? `\n\nПоследние выполненные тренировки этой группы:\n${recentSummary}` : "";
    return `${training.date}: Gemini сейчас не смог составить тренировку. Ошибка сохранена без раскрытия ключа.${last}`;
  }
}

async function reportReply(update: TelegramUpdate, env: Env, telegramUserId: string, rawText: string): Promise<string> {
  const timeZone = env.APP_TIMEZONE || "Europe/Samara";
  const user = await ensureUser(env.DB, telegramUserId, timeZone);
  const today = localDateAt(new Date(), timeZone);
  const plan = await loadReportPlan(env.DB, user.id, toIsoDate(today))
    ?? await loadReportPlan(env.DB, user.id, toIsoDate(addCalendarDays(today, -1)));
  if (!plan) return "Не нашёл отправленный план за сегодня или вчера. Сначала запроси тренировку, затем пришли фактический отчёт.";
  try {
    const deterministic = parseEditedPlanReport({ date: plan.plannedFor, plan: plan.workout, reportText: rawText });
    const parsed = deterministic
      ? { report: deterministic, inputTokens: 0, outputTokens: 0, model: "deterministic-edited-plan-v1" }
      : await (async () => {
        const catalogExerciseNames = await loadCatalogExerciseNames(env.DB);
        const result = await parseWorkoutReport(env.GEMINI_API_KEY, env.GEMINI_MODEL, {
          date: plan.plannedFor,
          plan: plan.workout,
          reportText: rawText,
          catalogExerciseNames,
        });
        return { ...result, model: env.GEMINI_MODEL };
      })();
    await saveReportDraft(
      env.DB,
      user.id,
      plan.id,
      update.update_id,
      rawText,
      parsed.report,
      parsed.model,
      parsed.inputTokens,
      parsed.outputTokens,
    );
    return formatWorkoutReportDraft(parsed.report);
  } catch (error) {
    await env.DB.prepare("INSERT INTO system_events(event_type, payload_json) VALUES ('workout_report_parsing_failed', ?)")
      .bind(JSON.stringify({
        date: plan.plannedFor,
        error: error instanceof Error ? error.message : "unknown",
      }))
      .run();
    return "Не смог надёжно разобрать отчёт. Ничего не записано как выполненная тренировка. Пришли его ещё раз списком: упражнение, вес и повторения каждого подхода.";
  }
}

async function freeTextReply(update: TelegramUpdate, env: Env, telegramUserId: string, text: string): Promise<string> {
  const user = await ensureUser(env.DB, telegramUserId, env.APP_TIMEZONE || "Europe/Samara");
  const checkinReply = await answerPostWorkoutCheckin(env.DB, user.id, text);
  if (checkinReply !== null) return checkinReply;
  return reportReply(update, env, telegramUserId, text);
}

async function handleUpdate(update: TelegramUpdate, env: Env): Promise<Response> {
  const message = update.message;
  if (!message?.from || !message.text) return new Response("ok");
  if (String(message.from.id) !== env.ALLOWED_TELEGRAM_USER_ID) return new Response("forbidden", { status: 403 });

  const text = message.text.trim();
  const offset = requestedDayOffset(text);
  let reply: string;
  if (text === "/start" || text === "/help") {
    reply = "Команды: /today — тренировка на сегодня, /tomorrow — на завтра, /confirm — подтвердить распознанный отчёт, /checkin — продолжить послетренировочный чекин, /cancel — отменить текущий черновик или чекин. После тренировки можно прислать фактические подходы обычным сообщением.";
  } else if (text === "/confirm") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    try {
      const confirmed = await confirmPendingReportDraft(env.DB, user.id);
      try {
        const question = await startPostWorkoutCheckin(env.DB, user.id, confirmed.sessionId);
        reply = `${confirmed.date}: выполненная тренировка подтверждена и сохранена в истории.\n\n${question}`;
      } catch (checkinError) {
        await env.DB.prepare("INSERT INTO system_events(event_type, payload_json) VALUES ('post_workout_checkin_start_failed', ?)")
          .bind(JSON.stringify({ sessionId: confirmed.sessionId, error: checkinError instanceof Error ? checkinError.message : "unknown" }))
          .run();
        reply = `${confirmed.date}: выполненная тренировка подтверждена и сохранена в истории. Чекин пока не запустился; техническая ошибка записана.`;
      }
    } catch (error) {
      await env.DB.prepare("INSERT INTO system_events(event_type, payload_json) VALUES ('workout_report_confirmation_failed', ?)")
        .bind(JSON.stringify({ error: error instanceof Error ? error.message : "unknown" }))
        .run();
      reply = "Не удалось завершить запись. Черновик сохранён и не подтверждён; техническая ошибка записана без раскрытия служебных данных.";
    }
  } else if (text === "/cancel") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    if (await cancelPostWorkoutCheckin(env.DB, user.id)) {
      reply = "Послетренировочный чекин отменён. Сама подтверждённая тренировка осталась в истории.";
    } else {
      reply = await cancelPendingReportDraft(env.DB, user.id) ? "Черновик тренировки отменён." : "Нет ожидающего подтверждения черновика или чекина.";
    }
  } else if (text === "/checkin") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    reply = await pendingPostWorkoutQuestion(env.DB, user.id) ?? "Нет незавершённого послетренировочного чекина.";
  } else if (offset !== null) {
    reply = await workoutReply(offset, env, String(message.from.id));
  } else {
    reply = await freeTextReply(update, env, String(message.from.id), text);
  }
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, reply);
  return new Response("ok");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return Response.json({ status: "ok" });
    if (request.method !== "POST" || url.pathname !== "/telegram/webhook") return new Response("not found", { status: 404 });
    if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    const update = await request.json<TelegramUpdate>();
    if (!Number.isSafeInteger(update.update_id)) return new Response("bad request", { status: 400 });
    if (!(await claimTelegramUpdate(env.DB, update.update_id))) return new Response("ok");
    try {
      const response = await handleUpdate(update, env);
      await completeTelegramUpdate(env.DB, update.update_id);
      return response;
    } catch (error) {
      await failTelegramUpdate(env.DB, update.update_id, error instanceof Error ? error.message : "unknown");
      throw error;
    }
  },

  async scheduled(controller: { cron: string; scheduledTime: number }, env: Env): Promise<void> {
    await env.DB.prepare("INSERT INTO system_events (event_type, scheduled_for, payload_json) VALUES (?, ?, ?)")
      .bind("cron_fired", new Date(controller.scheduledTime).toISOString(), JSON.stringify({ cron: controller.cron }))
      .run();
  },
};
