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
import { downloadTelegramPhoto, downloadTelegramTextDocument, downloadTelegramVoice, selectEfficientPhoto, sendTelegramDocument, sendTelegramMessage, type TelegramUpdate } from "./telegram.ts";
import {
  cancelPendingReportDraft,
  confirmPendingReportDraft,
  loadCatalogExerciseNames,
  loadPendingReportDraft,
  loadReportDraftByVoiceFile,
  loadReportPlan,
  saveReportDraft,
} from "./workout-report-db.ts";
import { formatWorkoutReportDraft, parseEditedPlanReport, parseWorkoutReport, parseWorkoutVoiceReport } from "./workout-report.ts";
import {
  answerPostWorkoutCheckin,
  cancelPostWorkoutCheckin,
  pendingPostWorkoutQuestion,
  startPostWorkoutCheckin,
} from "./post-workout-checkin-db.ts";
import {
  answerReadinessConversation,
  cancelReadinessConversation,
  compactReadiness,
  loadReadinessForDate,
  pendingReadinessQuestion,
  startReadinessConversation,
} from "./pre-workout-readiness-db.ts";
import { evaluateReadiness } from "./domain/safety.ts";
import { formatNutritionDraft, parseNutritionScreenshot } from "./nutrition-image.ts";
import { cancelNutritionDraft, confirmNutritionDraft, findNutritionImage, loadPendingNutritionDraft, saveNutritionDraft } from "./nutrition-db.ts";
import { parseWeightCommand } from "./body-tracking.ts";
import { answerMeasurementConversation, cancelMeasurementConversation, progressSummary, saveEmergencyWeight, startMeasurementConversation } from "./body-tracking-db.ts";
import { goalHelp, GOAL_LABELS, parseGoalCommand } from "./goal.ts";
import { loadCompactCoachingContext, loadCurrentGoal, setCurrentGoal } from "./goal-db.ts";
import { commandFromMenuText, MAIN_MENU_MARKUP } from "./menu.ts";
import { parseStopSupplementCommand, parseSupplementCommand, SUPPLEMENT_HELP } from "./supplements.ts";
import { addSupplement, listSupplements, stopSupplement } from "./supplements-db.ts";
import { LAB_HELP, parseCancelLabCommand, parseLabCommand } from "./labs.ts";
import { addLabResult, cancelLabResult, listLabResults } from "./labs-db.ts";
import { formatLabImageDraft, parseLabScreenshot } from "./lab-image.ts";
import { cancelLabImageDraft, confirmLabImageDraft, findLabImage, pendingLabImageDraft, saveLabImageDraft } from "./lab-image-db.ts";
import { loadModeForDate, recoveryAssessmentDue } from "./training-load-db.ts";
import { activeRecoveryStop, answerRecovery, cancelRecovery, startRecovery } from "./recovery-db.ts";
import { compactStrengthContext, strengthProgressSummary } from "./strength-analytics-db.ts";
import { answerInjuryConversation, cancelInjuryConversation, startInjuryConversation } from "./injuries-db.ts";
import { answerReintroductionConversation, cancelReintroductionConversation, startReintroductionConversation } from "./reintroduction-db.ts";
import { answerExerciseCatalogConversation, cancelExerciseCatalogConversation, startExerciseCatalogConversation } from "./exercise-catalog-db.ts";
import { answerExerciseAddConversation, cancelExerciseAddConversation } from "./exercise-add-db.ts";
import { answerScheduleConversation, cancelScheduleConversation, loadScheduleOverride, startScheduleConversation } from "./schedule-management-db.ts";
import { answerReminderConversation, cancelReminderConversation, runDueReminders, startReminderConversation } from "./reminders-db.ts";
import { progressReview } from "./progress-review-db.ts";
import { formatNutritionCsvDraft, parseNutritionCsv } from "./nutrition-csv.ts";
import { cancelNutritionCsv, confirmNutritionCsv, findNutritionCsv, pendingNutritionCsv, saveNutritionCsvDraft } from "./nutrition-csv-db.ts";
import { aiUsageLimitMessage, formatAiUsageOverview, parseAiUsageLimits } from "./ai-usage.ts";
import { loadAiUsageOverview } from "./ai-usage-db.ts";
import { formatExportSize, serializePersonalDataExport } from "./data-export.ts";
import { loadPersonalDataExport } from "./data-export-db.ts";
import { dataStatus } from "./data-status-db.ts";
import { programStatus } from "./program-status-db.ts";
import { compactExerciseProgression, exerciseProgressionSummary } from "./exercise-progression-db.ts";
import { applyProgressionGuard } from "./exercise-progression.ts";
import { applyPostIllnessGuard, postIllnessRules } from "./illness.ts";
import { answerIllnessConversation, cancelIllnessConversation, loadIllnessTrainingState, startIllnessConversation } from "./illness-db.ts";

interface Env {
  DB: D1Database;
  APP_TIMEZONE: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_TELEGRAM_USER_ID: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  AI_DAILY_REQUEST_LIMIT?: string;
  AI_DAILY_TOKEN_LIMIT?: string;
}

const GUIDANCE = {
  chest: ["4 упражнения на грудь", "дополнительно средние дельты и трицепс", "акцент плеч: средние дельты"],
  back: ["4 упражнения на спину", "дополнительно задние дельты и бицепс", "не дублировать одинаковые тяги без причины"],
  legs: ["4 упражнения на ноги", "дополнительно средние дельты", "не использовать упражнения со статусом постепенного возврата без отдельного разрешения", "для коленей только консервативная нагрузка"],
} as const;

async function currentAiUsage(env: Env, userId: number) {
  const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
  const overview = await loadAiUsageOverview(env.DB, userId, today);
  const limits = parseAiUsageLimits(env.AI_DAILY_REQUEST_LIMIT, env.AI_DAILY_TOKEN_LIMIT);
  return { overview, limits };
}

async function aiUsageBlock(env: Env, userId: number): Promise<string | null> {
  const { overview, limits } = await currentAiUsage(env, userId);
  return aiUsageLimitMessage(overview.today, limits);
}

async function sendPersonalExport(env: Env, telegramUserId: string, chatId: number): Promise<string> {
  const timezone = env.APP_TIMEZONE || "Europe/Samara";
  const user = await ensureUser(env.DB, telegramUserId, timezone);
  const data = await loadPersonalDataExport(env.DB, user.id, new Date().toISOString(), timezone);
  const file = serializePersonalDataExport(data);
  if (file.byteLength > 8 * 1024 * 1024) {
    return `Экспорт получился слишком большим для безопасной отправки Worker: ${formatExportSize(file.byteLength)}. Данные не удалены; используй локальную резервную копию.`;
  }
  await sendTelegramDocument(
    env.TELEGRAM_BOT_TOKEN,
    chatId,
    file.filename,
    file.content,
    "Персональный экспорт AI-тренера. Файл содержит конфиденциальные данные о здоровье — не пересылай его посторонним.",
  );
  return `Экспорт отправлен: ${file.filename}, ${formatExportSize(file.byteLength)}. Gemini не использовался.`;
}

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
  const localDate=toIsoDate(local);
  const override=await loadScheduleOverride(env.DB,user.id,localDate);
  const training = trainingForDate(local, schedule,override);
  if (training.focus === "rest") {
    return `${training.date}: по базовому расписанию день восстановления.`;
  }
  const illnessState = await loadIllnessTrainingState(env.DB, user.id, training.date);
  if (illnessState.active) {
    return `${training.date}: тренировку не составляю, потому что болезнь отмечена активной с ${illnessState.active.started_on}. Когда восстановишься, открой «🤒 Болезнь» и выбери «выздоровел».`;
  }
  const readiness = offset === 0 ? await loadReadinessForDate(env.DB, user.id, training.date) : null;
  if (offset === 0 && !readiness) return startReadinessConversation(env.DB, user.id, training.date);
  if (readiness) {
    const decision = evaluateReadiness(readiness);
    if (!decision.allowed) {
      return `${training.date}: тренировку не составляю: ${decision.reasons.join(", ")}. При резком или необычном ухудшении состояния обратись за медицинской помощью.`;
    }
  }
  const recoveryStop=await activeRecoveryStop(env.DB,user.id);
  if(recoveryStop)return`${training.date}: тренировку не составляю — действует блок восстановления: ${recoveryStop.join(", ")}. Пройди «🩺 Восстановление» повторно после проверки состояния; при тревожных симптомах обратись за медицинской помощью.`;
  const existing = await loadExistingGeneratedPlan(env.DB, user.id, training.date, training.focus);
  if (existing) return formatWorkout(training.date, existing, true);

  const emphasis = await loadNextTrainingEmphasis(env.DB, user.id, training.focus);
  if (!emphasis) {
    return `${training.date}: для группы «${training.label}» ещё не задан следующий программный акцент. План не создан, чтобы не выбирать его случайно.`;
  }
  const loadMode=await loadModeForDate(env.DB,user.id,training.date);
  const recoveryTrigger=loadMode==="normal"?await recoveryAssessmentDue(env.DB,user.id,training.date):null;
  if(recoveryTrigger){
    const question=await startRecovery(env.DB,user.id);
    const reason=recoveryTrigger==="performance_decline"?"зафиксировано устойчивое снижение результатов на двух последовательных сопоставимых тренировках":"завершено минимум четыре тяжёлые недели";
    return`Перед следующей тренировкой нужна оценка восстановления: ${reason}. После чекина снова нажми «🏋️ Сегодня» или «📅 Завтра».\n\n${question}`;
  }

  const [candidates, restrictions, recentSummary, coachingContext,strengthContext,progression] = await Promise.all([
    loadExerciseCandidates(env.DB, user.id, training.focus),
    loadActiveRestrictions(env.DB, user.id),
    loadRecentSummary(env.DB, user.id, training.focus),
    loadCompactCoachingContext(env.DB, user.id),
    compactStrengthContext(env.DB,user.id,training.focus,training.date),
    compactExerciseProgression(env.DB,user.id,training.focus),
  ]);
  const safe = filterSafeExercises(candidates, restrictions);
  if (safe.allowed.length === 0) {
    return `${training.date}: не нашлось разрешённых упражнений для группы «${training.label}». План не создан.`;
  }
  const testing = safe.allowed.filter((exercise) => exercise.reintroductionStatus === "testing");
  const rare = safe.allowed.filter((exercise) => exercise.availability === "rare").map((exercise) => exercise.name);
  const preferred = safe.allowed.filter((exercise) => (exercise.priority ?? 0) > 0).map((exercise) => exercise.name);
  const deprioritized = safe.allowed.filter((exercise) => (exercise.priority ?? 0) < 0).map((exercise) => exercise.name);
  if (testing.length > 1) return `${training.date}: одновременно отмечено несколько тестируемых упражнений. Оставь одно через «🔄 Возврат», чтобы тест был контролируемым.`;
  const usageBlock = await aiUsageBlock(env, user.id);
  if (usageBlock) return usageBlock;
  try {
    const generated = await generateWorkout(env.GEMINI_API_KEY, env.GEMINI_MODEL, {
      date: training.date,
      focus: training.label,
      emphasis,
      durationMinutes: 90,
      exercises: safe.allowed,
      restrictions,
      recentSummary,
      selectionGuidance: [
        ...GUIDANCE[training.focus],
        ...programmingRules(training.focus, emphasis,loadMode),
        ...(illnessState.phase ? postIllnessRules(illnessState.phase) : []),
        ...(testing.length ? [`Обязательно включи единственное тестируемое упражнение «${testing[0].name}» с минимальной консервативной нагрузкой. Политика: ${testing[0].reintroductionLoadPolicy ?? "без повышения веса"}. Прекратить при боли, отёке или нестабильности.`] : []),
        ...(preferred.length ? [`Предпочтительные упражнения владельца: ${preferred.join(", ")}. При прочих равных сохраняй их в программе.`] : []),
        ...(deprioritized.length ? [`Упражнения с пониженным приоритетом: ${deprioritized.join(", ")}. Используй только при программной причине.`] : []),
        ...(rare.length ? [`Редкие упражнения: ${rare.join(", ")}. Не выбирай их без конкретной причины замены или вариативности.`] : []),
        `Контекст цели и восстановления ресурсов: ${coachingContext}. Не компенсируй питание чрезмерным тренировочным объёмом.`,
        `Фактическая силовая динамика по совместимым типам веса: ${strengthContext}. Используй её как сигнал, но не повышай нагрузку без целевого RIR и стабильной техники.`,
        `Детерминированный паспорт прогрессии обязателен: ${progression.context}. Не предлагай повышение веса вопреки этому решению.`,
        "Добавки перечислены только как фактический контекст. Не назначай, не отменяй и не меняй их дозировку; не делай медицинских выводов.",
        ...(readiness ? [`Актуальный предтренировочный чекин: ${compactReadiness(readiness)}.`] : []),
      ],
    });
    const progressionGuarded = applyProgressionGuard(generated.workout, progression.assessments);
    const workout = illnessState.phase ? applyPostIllnessGuard(progressionGuarded, illnessState.phase) : progressionGuarded;
    if (testing.length && !workout.exercises.some((exercise) => exercise.name === testing[0].name)) {
      throw new Error("Gemini пропустил обязательное тестируемое упражнение");
    }
    await saveGeneratedPlan(
      env.DB,
      user.id,
      training.date,
      training.focus,
      emphasis,
      loadMode,
      env.GEMINI_MODEL,
      workout,
      generated.inputTokens,
      generated.outputTokens,
    );
    if (illnessState.phase) {
      await env.DB.prepare("INSERT INTO system_events(event_type,payload_json)VALUES('post_illness_guard_applied',?)")
        .bind(JSON.stringify({ phase: illnessState.phase })).run();
    }
    return formatWorkout(training.date, workout);
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
    const catalogExerciseNames = await loadCatalogExerciseNames(env.DB);
    const deterministic = parseEditedPlanReport({ date: plan.plannedFor, plan: plan.workout, reportText: rawText, catalogExerciseNames });
    let parsed;
    if (deterministic) {
      parsed = { report: deterministic, inputTokens: 0, outputTokens: 0, model: "deterministic-edited-plan-v1" };
    } else {
      const usageBlock = await aiUsageBlock(env, user.id);
      if (usageBlock) return usageBlock;
      const result = await parseWorkoutReport(env.GEMINI_API_KEY, env.GEMINI_MODEL, {
        date: plan.plannedFor,
        plan: plan.workout,
        reportText: rawText,
        catalogExerciseNames,
      });
      parsed = { ...result, model: env.GEMINI_MODEL };
    }
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

async function voiceReportReply(update: TelegramUpdate, env: Env, telegramUserId: string): Promise<string> {
  const voice = update.message?.voice;
  if (!voice) throw new Error("Голосовое сообщение отсутствует");
  if (!Number.isFinite(voice.duration) || voice.duration < 1 || voice.duration > 120) {
    return "Голосовой отчёт должен быть не длиннее 2 минут. Для длинного отчёта отправь несколько фактических строк текстом.";
  }
  if ((voice.file_size ?? 0) > 4 * 1024 * 1024) return "Голосовой отчёт превышает безопасный лимит 4 МБ.";

  const timeZone = env.APP_TIMEZONE || "Europe/Samara";
  const user = await ensureUser(env.DB, telegramUserId, timeZone);
  const existing = await loadReportDraftByVoiceFile(env.DB, user.id, voice.file_unique_id);
  if (existing) {
    if (existing.status === "pending") return formatWorkoutReportDraft(existing.report);
    if (existing.status === "confirmed") return "Этот голосовой отчёт уже подтверждён и сохранён.";
    return "Этот голосовой файл уже обрабатывался и повторно в Gemini не отправляется. Пришли новый голосовой отчёт или текст.";
  }

  const today = localDateAt(new Date(), timeZone);
  const plan = await loadReportPlan(env.DB, user.id, toIsoDate(today))
    ?? await loadReportPlan(env.DB, user.id, toIsoDate(addCalendarDays(today, -1)));
  if (!plan) return "Не нашёл отправленный план за сегодня или вчера. Голос не отправлялся в Gemini.";
  const usageBlock = await aiUsageBlock(env, user.id);
  if (usageBlock) return usageBlock;

  try {
    const [audio, catalogExerciseNames] = await Promise.all([
      downloadTelegramVoice(env.TELEGRAM_BOT_TOKEN, voice.file_id, voice.mime_type),
      loadCatalogExerciseNames(env.DB),
    ]);
    const parsed = await parseWorkoutVoiceReport(env.GEMINI_API_KEY, env.GEMINI_MODEL, {
      date: plan.plannedFor,
      plan: plan.workout,
      catalogExerciseNames,
      audio,
    });
    await saveReportDraft(
      env.DB,
      user.id,
      plan.id,
      update.update_id,
      `[голосовой отчёт, ${voice.duration} сек]`,
      parsed.report,
      env.GEMINI_MODEL,
      parsed.inputTokens,
      parsed.outputTokens,
      voice.file_unique_id,
    );
    return formatWorkoutReportDraft(parsed.report);
  } catch (error) {
    await env.DB.prepare("INSERT INTO system_events(event_type, payload_json) VALUES ('voice_workout_report_failed', ?)")
      .bind(JSON.stringify({ fileUniqueId: voice.file_unique_id, error: error instanceof Error ? error.message : "unknown" })).run();
    return "Не смог надёжно разобрать голосовой отчёт. Ничего не записано как выполненная тренировка. Само аудио не сохранялось; пришли отчёт текстом или новым голосовым сообщением до 2 минут.";
  }
}

async function freeTextReply(update: TelegramUpdate, env: Env, telegramUserId: string, text: string): Promise<string> {
  const user = await ensureUser(env.DB, telegramUserId, env.APP_TIMEZONE || "Europe/Samara");
  const checkinReply = await answerPostWorkoutCheckin(env.DB, user.id, text);
  if (checkinReply !== null) return checkinReply;
  const readinessReply = await answerReadinessConversation(env.DB, user.id, text);
  if (readinessReply !== null) {
    if (readinessReply.completed && readinessReply.allowed) {
      const workout = await workoutReply(0, env, telegramUserId);
      return `${readinessReply.reply}\n\n${workout}`;
    }
    return readinessReply.reply;
  }
  const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
  const illnessReply = await answerIllnessConversation(env.DB, user.id, text, today);
  if (illnessReply !== null) return illnessReply;
  const measurementReply = await answerMeasurementConversation(env.DB, user.id, text, today);
  if (measurementReply !== null) return measurementReply;
  const recoveryReply=await answerRecovery(env.DB,user.id,text,today);if(recoveryReply!==null)return recoveryReply;
  const injuryReply=await answerInjuryConversation(env.DB,user.id,text,today);if(injuryReply!==null)return injuryReply;
  const reintroductionReply=await answerReintroductionConversation(env.DB,user.id,text,today);if(reintroductionReply!==null)return reintroductionReply;
  const catalogReply=await answerExerciseCatalogConversation(env.DB,user.id,text);if(catalogReply!==null)return catalogReply;
  const exerciseAddReply=await answerExerciseAddConversation(env.DB,user.id,text);if(exerciseAddReply!==null)return exerciseAddReply;
  const scheduleReply=await answerScheduleConversation(env.DB,user.id,text,today);if(scheduleReply!==null)return scheduleReply;
  const reminderReply=await answerReminderConversation(env.DB,user.id,text);if(reminderReply!==null)return reminderReply;
  return reportReply(update, env, telegramUserId, text);
}

async function nutritionPhotoReply(update: TelegramUpdate, env: Env, telegramUserId: string): Promise<string> {
  const message = update.message;
  if (!message?.photo?.length) throw new Error("Фото отсутствует");
  const user = await ensureUser(env.DB, telegramUserId, env.APP_TIMEZONE || "Europe/Samara");
  const selected = selectEfficientPhoto(message.photo);
  const existing = await findNutritionImage(env.DB, user.id, selected.file_unique_id);
  if (existing) {
    const draft = JSON.parse(existing.parsed_json);
    return existing.status === "confirmed" ? "Этот скриншот КБЖУ уже сохранён." : formatNutritionDraft(draft);
  }
  const usageBlock = await aiUsageBlock(env, user.id);
  if (usageBlock) return usageBlock;
  try {
    const image = await downloadTelegramPhoto(env.TELEGRAM_BOT_TOKEN, selected.file_id);
    const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
    const parsed = await parseNutritionScreenshot(env.GEMINI_API_KEY, env.GEMINI_MODEL, image, today);
    await saveNutritionDraft(env.DB, user.id, update.update_id, selected.file_unique_id, parsed.draft, env.GEMINI_MODEL, parsed.inputTokens, parsed.outputTokens);
    return formatNutritionDraft(parsed.draft);
  } catch (error) {
    await env.DB.prepare("INSERT INTO system_events(event_type, payload_json) VALUES ('nutrition_screenshot_failed', ?)")
      .bind(JSON.stringify({ error: error instanceof Error ? error.message : "unknown" })).run();
    return "Не смог надёжно прочитать общий КБЖУ. Ничего не сохранено. Пришли один чёткий скриншот дневного итога FatSecret с подписью /nutrition.";
  }
}

async function nutritionCsvReply(update:TelegramUpdate,env:Env,telegramUserId:string):Promise<string>{const document=update.message?.document;if(!document)throw new Error("Документ отсутствует");const name=document.file_name??"FatSecret.csv";if(!name.toLocaleLowerCase("ru-RU").endsWith(".csv"))return"Нужен файл FatSecret в формате CSV.";if((document.file_size??0)>2*1024*1024)return"CSV превышает безопасный лимит 2 МБ.";const user=await ensureUser(env.DB,telegramUserId,env.APP_TIMEZONE||"Europe/Samara");const existing=await findNutritionCsv(env.DB,user.id,document.file_unique_id);if(existing?.status==="confirmed")return"Этот CSV FatSecret уже импортирован.";if(existing?.status==="pending")return formatNutritionCsvDraft(JSON.parse(existing.parsed_json));try{const text=await downloadTelegramTextDocument(env.TELEGRAM_BOT_TOKEN,document.file_id);const days=parseNutritionCsv(text);await saveNutritionCsvDraft(env.DB,user.id,update.update_id,document.file_unique_id,name,days);return formatNutritionCsvDraft(days)}catch(error){await env.DB.prepare("INSERT INTO system_events(event_type,payload_json)VALUES('fatsecret_csv_failed',?)").bind(JSON.stringify({error:error instanceof Error?error.message:"unknown"})).run();return`Не смог безопасно разобрать CSV. Ничего не сохранено. ${error instanceof Error?error.message:"Неизвестная ошибка"}`}}

async function labPhotoReply(update: TelegramUpdate, env: Env, telegramUserId: string): Promise<string> {
  const message = update.message;
  if (!message?.photo?.length) throw new Error("Фото отсутствует");
  const user = await ensureUser(env.DB, telegramUserId, env.APP_TIMEZONE || "Europe/Samara");
  const selected = selectEfficientPhoto(message.photo);
  const existing = await findLabImage(env.DB, user.id, selected.file_unique_id);
  if (existing) return existing.status === "confirmed" ? "Этот лабораторный бланк уже сохранён." : formatLabImageDraft(JSON.parse(existing.parsed_json));
  const usageBlock = await aiUsageBlock(env, user.id);
  if (usageBlock) return usageBlock;
  try {
    const image = await downloadTelegramPhoto(env.TELEGRAM_BOT_TOKEN, selected.file_id);
    const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
    const parsed = await parseLabScreenshot(env.GEMINI_API_KEY, env.GEMINI_MODEL, image, today);
    await saveLabImageDraft(env.DB, user.id, update.update_id, selected.file_unique_id, parsed.draft, env.GEMINI_MODEL, parsed.inputTokens, parsed.outputTokens);
    return formatLabImageDraft(parsed.draft);
  } catch (error) {
    await env.DB.prepare("INSERT INTO system_events(event_type,payload_json)VALUES('lab_screenshot_failed',?)")
      .bind(JSON.stringify({ error: error instanceof Error ? error.message : "unknown" })).run();
    return "Не смог надёжно прочитать бланк. Ничего не сохранено. Пришли одно чёткое фото с подписью /labphoto.";
  }
}

async function handleUpdate(update: TelegramUpdate, env: Env): Promise<Response> {
  const message = update.message;
  if (!message?.from || (!message.text && !message.caption && !message.photo?.length && !message.document && !message.voice)) return new Response("ok");
  if (String(message.from.id) !== env.ALLOWED_TELEGRAM_USER_ID) return new Response("forbidden", { status: 403 });

  const originalText = (message.text ?? message.caption ?? "").trim();
  const text = message.photo?.length||message.document||message.voice ? originalText : commandFromMenuText(originalText);
  const offset = requestedDayOffset(text);
  let reply: string;
  let showMenu = false;
  if(message.voice){reply=await voiceReportReply(update,env,String(message.from.id));
  } else if(message.document){reply=/^\/fatsecret(?:@\w+)?$/i.test(text)?await nutritionCsvReply(update,env,String(message.from.id)):"CSV обрабатывается только с подписью /fatsecret.";
  } else if (message.photo?.length) {
    if(/^\/nutrition(?:@\w+)?$/i.test(text))reply=await nutritionPhotoReply(update,env,String(message.from.id));
    else if(/^\/labphoto(?:@\w+)?$/i.test(text))reply=await labPhotoReply(update,env,String(message.from.id));
    else reply="Фото обрабатывается только с явной подписью: /nutrition для КБЖУ или /labphoto для лабораторного бланка. Без подписи фото не отправляется в Gemini.";
  } else if (text === "/start" || text === "/help" || text === "/menu") {
    showMenu = true;
    reply = "Команды: /today — тренировка на сегодня, /tomorrow — на завтра, /illness — болезнь и возвращение к нагрузке, /program — состояние тренировочного цикла, /progression — паспорт прогрессии упражнений, /schedule — разовые переносы и отмены, /reminders — напоминания о весе и замерах, /review — итоги за 28 дней, /status — полнота и свежесть данных, /usage — расход и дневной предел Gemini, /export — персональный архив, /goal — текущая цель, /confirm — подтвердить отчёт или КБЖУ, /fatsecret — подпись к пользовательскому CSV, /nutrition — подпись к аварийному скриншоту FatSecret, /weight 87.5 — аварийная запись веса, /measure — месячные замеры, /progress — тело и питание, /strength — силовая динамика, /injuries — травмы, /reintroductions — возврат упражнений, /exercises — каталог, /cancel — отмена текущего диалога. Голосовое сообщение до 2 минут разбирается как фактический отчёт к плану за сегодня или вчера.";
  } else if (text === "/confirm") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    const workoutDraft = await loadPendingReportDraft(env.DB, user.id);
    const nutritionDraft = workoutDraft ? null : await loadPendingNutritionDraft(env.DB, user.id);
    const csvDraft = workoutDraft||nutritionDraft?null:await pendingNutritionCsv(env.DB,user.id);
    const labDraft = workoutDraft||nutritionDraft||csvDraft?null:await pendingLabImageDraft(env.DB,user.id);
    if (nutritionDraft) {
      const confirmed = await confirmNutritionDraft(env.DB, user.id);
      reply = `${confirmed.date}: общий КБЖУ подтверждён и сохранён в истории питания.`;
    } else if(csvDraft){const confirmed=await confirmNutritionCsv(env.DB,user.id);reply=`Импорт FatSecret подтверждён: сохранено ${confirmed.length} дней, ${confirmed[0].date} — ${confirmed.at(-1)!.date}. Продукты в БД не переносились.`;
    } else if(labDraft){const confirmed=await confirmLabImageDraft(env.DB,user.id);reply=`${confirmed.date}: подтверждено и сохранено показателей: ${confirmed.items.length}. Медицинская интерпретация не выполнялась.`;
    } else try {
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
    } else if (await cancelReadinessConversation(env.DB, user.id)) {
      reply = "Предтренировочный чекин отменён. Тренировка не составлялась.";
    } else if (await cancelNutritionDraft(env.DB, user.id)) {
      reply = "Черновик КБЖУ отменён. В историю питания ничего не записано.";
    } else if(await cancelNutritionCsv(env.DB,user.id)){
      reply="CSV-черновик FatSecret отменён. В историю питания ничего не записано.";
    } else if(await cancelLabImageDraft(env.DB,user.id)){
      reply="Черновик анализов отменён. Показатели не сохранены.";
    } else if (await cancelMeasurementConversation(env.DB, user.id)) {
      reply = "Ввод замеров отменён. Незавершённые значения не сохранены.";
    } else if(await cancelRecovery(env.DB,user.id)){
      reply="Чекин восстановления отменён. Решение о разгрузке не менялось.";
    } else if(await cancelIllnessConversation(env.DB,user.id)){
      reply="Отметка болезни отменена. Периоды болезни и пропуски не изменены.";
    } else if(await cancelInjuryConversation(env.DB,user.id)){
      reply="Управление травмами отменено. Данные не изменены.";
    } else if(await cancelReintroductionConversation(env.DB,user.id)){
      reply="Управление возвратом упражнений отменено. Статусы не изменены.";
    } else if(await cancelExerciseCatalogConversation(env.DB,user.id)){
      reply="Управление каталогом упражнений отменено.";
    } else if(await cancelExerciseAddConversation(env.DB,user.id)){
      reply="Черновик нового упражнения отменён. В каталог ничего не добавлено.";
    } else if(await cancelScheduleConversation(env.DB,user.id)){
      reply="Изменение расписания отменено. Расписание не менялось.";
    } else if(await cancelReminderConversation(env.DB,user.id)){
      reply="Настройка напоминаний отменена. Сохранённые напоминания не изменились.";
    } else {
      reply = await cancelPendingReportDraft(env.DB, user.id) ? "Черновик тренировки отменён." : "Нет ожидающего подтверждения черновика или чекина.";
    }
  } else if (text === "/checkin") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    reply = await pendingPostWorkoutQuestion(env.DB, user.id) ?? "Нет незавершённого послетренировочного чекина.";
  } else if (text === "/ready") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    reply = await pendingReadinessQuestion(env.DB, user.id) ?? "Нет незавершённого предтренировочного чекина. Начать его можно командой /today.";
  } else if (text === "/measure") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    await cancelIllnessConversation(env.DB, user.id);
    reply = await startMeasurementConversation(env.DB, user.id);
  } else if (text === "/progress") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
    reply = await progressSummary(env.DB, user.id, today);
  } else if(text==="/review"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");reply=await progressReview(env.DB,user.id,localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));
  } else if(text==="/program"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));reply=await programStatus(env.DB,user.id,today);
  } else if(text==="/progression"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");reply=await exerciseProgressionSummary(env.DB,user.id);
  } else if(text==="/status"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));reply=await dataStatus(env.DB,user.id,today);
  } else if(text==="/usage"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const usage=await currentAiUsage(env,user.id);reply=formatAiUsageOverview(usage.overview,usage.limits);
  } else if(text==="/export"){
    reply="Экспорт содержит историю тренировок, питание, вес, замеры, травмы, анализы и другие персональные данные. Он будет отправлен в этот Telegram-чат как JSON-файл. Если действительно хочешь получить архив, отправь /export_confirm. Gemini не используется.";
  } else if(text==="/export_confirm"){
    reply=await sendPersonalExport(env,String(message.from.id),message.chat.id);
  } else if(text==="/strength"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));reply=await strengthProgressSummary(env.DB,user.id,today);
  } else if(text==="/recovery"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelIllnessConversation(env.DB,user.id);reply=await startRecovery(env.DB,user.id);
  } else if(text==="/illness"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");
    await cancelRecovery(env.DB,user.id);await cancelInjuryConversation(env.DB,user.id);await cancelReintroductionConversation(env.DB,user.id);await cancelExerciseCatalogConversation(env.DB,user.id);await cancelExerciseAddConversation(env.DB,user.id);await cancelScheduleConversation(env.DB,user.id);await cancelReminderConversation(env.DB,user.id);await cancelMeasurementConversation(env.DB,user.id);
    reply=await startIllnessConversation(env.DB,user.id);
  } else if(text==="/injuries"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelIllnessConversation(env.DB,user.id);await cancelReintroductionConversation(env.DB,user.id);await cancelExerciseCatalogConversation(env.DB,user.id);await cancelExerciseAddConversation(env.DB,user.id);await cancelScheduleConversation(env.DB,user.id);reply=await startInjuryConversation(env.DB,user.id);
  } else if(text==="/reintroductions"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelIllnessConversation(env.DB,user.id);await cancelInjuryConversation(env.DB,user.id);await cancelExerciseCatalogConversation(env.DB,user.id);await cancelExerciseAddConversation(env.DB,user.id);await cancelScheduleConversation(env.DB,user.id);reply=await startReintroductionConversation(env.DB,user.id);
  } else if(text==="/exercises"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelIllnessConversation(env.DB,user.id);await cancelInjuryConversation(env.DB,user.id);await cancelReintroductionConversation(env.DB,user.id);await cancelExerciseAddConversation(env.DB,user.id);await cancelScheduleConversation(env.DB,user.id);reply=await startExerciseCatalogConversation(env.DB,user.id);
  } else if(text==="/schedule"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelIllnessConversation(env.DB,user.id);await cancelInjuryConversation(env.DB,user.id);await cancelReintroductionConversation(env.DB,user.id);await cancelExerciseCatalogConversation(env.DB,user.id);await cancelExerciseAddConversation(env.DB,user.id);const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));reply=await startScheduleConversation(env.DB,user.id,today);
  } else if(text==="/reminders"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelIllnessConversation(env.DB,user.id);await cancelInjuryConversation(env.DB,user.id);await cancelReintroductionConversation(env.DB,user.id);await cancelExerciseCatalogConversation(env.DB,user.id);await cancelExerciseAddConversation(env.DB,user.id);await cancelScheduleConversation(env.DB,user.id);reply=await startReminderConversation(env.DB,user.id);
  } else if (text === "/goal") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    const current = await loadCurrentGoal(env.DB, user.id);
    reply = `${current ? `Текущая цель: ${GOAL_LABELS[current.goal_type]}.\n\n` : "Цель пока не задана.\n\n"}${goalHelp()}`;
  } else if (/^\/goal(?:@\w+)?(?:\s|$)/i.test(text)) {
    const goal = parseGoalCommand(text);
    if (!goal) reply = `Не понял цель.\n\n${goalHelp()}`;
    else {
      const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
      const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
      await setCurrentGoal(env.DB, user.id, goal, today);
      reply = `Текущая цель обновлена: ${GOAL_LABELS[goal]}. Следующие тренировки будут учитывать её вместе с доступными данными питания и веса.`;
    }
  } else if (/^\/weight(?:@\w+)?(?:\s|$)/i.test(text)) {
    const weight = parseWeightCommand(text);
    if (weight === null) {
      reply = "Формат: /weight 87.5. Допустимый диапазон — 30–300 кг. Используй команду только как резерв, если импорт из FatSecret недоступен.";
    } else {
      const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
      const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
      await saveEmergencyWeight(env.DB, user.id, today, weight);
      reply = `${today}: вес ${weight} кг сохранён как аварийный ввод Telegram.`;
    }
  } else if (text === "/nutrition") {
    reply = "Пришли один скриншот дневного итога FatSecret и добавь к фотографии подпись /nutrition. Без подписи изображение не отправится в Gemini.";
  } else if(text==="/fatsecret"){
    reply="Экспортируй пользовательский отчёт FatSecret в CSV и отправь его документом с подписью /fatsecret. Сначала бот покажет черновик; запись будет только после /confirm.";
  } else if (text === "/supplements") {
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const rows=await listSupplements(env.DB,user.id);
    reply=`${rows.length?["Активные добавки:",...rows.map((r)=>`${r.id}. ${r.name} — ${r.dose_value} ${r.dose_unit}, ${r.schedule_text}`)].join("\n"):"Активные добавки не записаны."}\n\n${SUPPLEMENT_HELP}`;
  } else if (/^\/supplement_stop(?:@\w+)?(?:\s|$)/i.test(text)) {
    const id=parseStopSupplementCommand(text);if(id===null)reply=`Неверный формат. ${SUPPLEMENT_HELP}`;else{const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));reply=await stopSupplement(env.DB,user.id,id,today)?"Добавка остановлена; история сохранена.":"Активная добавка с таким номером не найдена.";}
  } else if (/^\/supplement(?:@\w+)?(?:\s|$)/i.test(text)) {
    const input=parseSupplementCommand(text);if(!input)reply=`Неверный формат. ${SUPPLEMENT_HELP}`;else{const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));await addSupplement(env.DB,user.id,input,today);reply=`Сохранено: ${input.name} — ${input.doseValue} ${input.doseUnit}, ${input.schedule}. Я фиксирую факт приёма, но не меняю назначения и дозировки.`;}
  } else if (text === "/labs") {
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const rows=await listLabResults(env.DB,user.id);
    reply=`${rows.length?["Последние анализы:",...rows.map((r)=>`${r.id}. ${r.collected_on} — ${r.marker_name}: ${r.value_text} ${r.unit} (референс ${r.reference_text})`)].join("\n"):"Анализы пока не записаны."}\n\nФото бланка: добавь к фотографии подпись /labphoto.\n${LAB_HELP}\n\nБот хранит данные, но не ставит диагноз и не меняет назначения.`;
  } else if (/^\/lab_cancel(?:@\w+)?(?:\s|$)/i.test(text)) {
    const id=parseCancelLabCommand(text);if(id===null)reply=`Неверный формат. ${LAB_HELP}`;else{const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");reply=await cancelLabResult(env.DB,user.id,id)?"Ошибочная запись анализа отменена; она исключена из активного списка, история сохранена.":"Активная запись с таким номером не найдена.";}
  } else if (/^\/lab(?:@\w+)?(?:\s|$)/i.test(text)) {
    const input=parseLabCommand(text);if(!input)reply=`Неверный формат. ${LAB_HELP}`;else{const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));await addLabResult(env.DB,user.id,input,today);reply=`Сохранено: ${input.marker} — ${input.valueText} ${input.unit}, лабораторный референс ${input.reference}, дата ${input.date??today}. Медицинская интерпретация не выполнялась.`;}
  } else if (offset !== null) {
    if (offset === 0) {
      const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
      const pendingPostWorkout = await pendingPostWorkoutQuestion(env.DB, user.id);
      reply = pendingPostWorkout
        ? `Сначала закончи послетренировочный чекин или отмени его командой /cancel.\n\n${pendingPostWorkout}`
        : await workoutReply(offset, env, String(message.from.id));
    } else {
      reply = await workoutReply(offset, env, String(message.from.id));
    }
  } else {
    reply = await freeTextReply(update, env, String(message.from.id), text);
  }
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, reply, showMenu ? MAIN_MENU_MARKUP : undefined);
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
    const delivered = await runDueReminders(
      env.DB,
      new Date(controller.scheduledTime),
      env.APP_TIMEZONE || "Europe/Samara",
      async (telegramUserId, text) => {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, Number(telegramUserId), text, MAIN_MENU_MARKUP);
      },
    );
    await env.DB.prepare("INSERT INTO system_events (event_type, scheduled_for, payload_json) VALUES (?, ?, ?)")
      .bind("cron_fired", new Date(controller.scheduledTime).toISOString(), JSON.stringify({ cron: controller.cron, remindersDelivered: delivered }))
      .run();
  },
};
