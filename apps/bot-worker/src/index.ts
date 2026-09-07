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
import { answerTelegramCallbackQuery, deleteTelegramMessages, downloadTelegramPhoto, downloadTelegramTextDocument, downloadTelegramVoice, selectEfficientPhoto, sendTelegramDocument, sendTelegramMessage, type TelegramUpdate } from "./telegram.ts";
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
import { answerMeasurementConversation, cancelMeasurementConversation, progressSummary, saveEmergencyWeight, startWeightConversation, cancelWeightConversation, completeWeightConversation } from "./body-tracking-db.ts";
import { goalHelp, GOAL_LABELS, parseGoalCommand } from "./goal.ts";
import { loadCompactCoachingContext, loadCurrentGoal, setCurrentGoal } from "./goal-db.ts";
import { commandFromMenuText, MAIN_MENU_MARKUP, MEASUREMENT_MENU_MARKUP, MENU_INTRO } from "./menu.ts";
import { INPUT_COMMANDS, INPUT_HINTS, pendingCommandInput, startCommandInput, cancelCommandInput, completeCommandInput, routeCommandInput, validCommandInput, conflictingInput } from "./command-input.ts";
import { parseStopSupplementCommand, parseSupplementCommand, SUPPLEMENT_HELP } from "./supplements.ts";
import { addSupplement, listSupplements, stopSupplement } from "./supplements-db.ts";
import { LAB_HELP, parseCancelLabCommand, parseLabCommand } from "./labs.ts";
import { addLabResult, cancelLabResult, listLabResults } from "./labs-db.ts";
import { formatLabImageDraft, parseLabScreenshot } from "./lab-image.ts";
import { cancelLabImageDraft, confirmLabImageDraft, findLabImage, pendingLabImageDraft, saveLabImageDraft } from "./lab-image-db.ts";
import { loadModeForDate } from "./training-load-db.ts";
import { cancelRecovery } from "./recovery-db.ts";
import { loadAutomaticRecoveryInput, recordAutomaticRecoveryAssessment } from "./automatic-recovery-db.ts";
import { applyRecoveryLoadGuard, assessRecoverySafety, compactRecoveryContext } from "./automatic-recovery.ts";
import { compactStrengthContext, strengthProgressSummary } from "./strength-analytics-db.ts";
import { answerInjuryConversation, cancelInjuryConversation, startInjuryConversation } from "./injuries-db.ts";
import { answerReintroductionConversation, cancelReintroductionConversation, startReintroductionConversation } from "./reintroduction-db.ts";
import { applyReintroductionApproval, findReintroductionApprovalOffer, reintroductionApprovalMarkup, reintroductionApprovalText } from "./reintroduction-approval-db.ts";
import { answerExerciseCatalogConversation, cancelExerciseCatalogConversation, startExerciseCatalogConversation } from "./exercise-catalog-db.ts";
import { answerExerciseAddConversation, cancelExerciseAddConversation } from "./exercise-add-db.ts";
import { answerScheduleConversation, cancelScheduleConversation, loadScheduleOverride, startScheduleConversation } from "./schedule-management-db.ts";
import { cancelReminderConversation, runDueReminders } from "./reminders-db.ts";
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
import { applyPostIllnessSafetyGuard, postIllnessRules } from "./illness.ts";
import { answerIllnessConversation, cancelIllnessConversation, loadIllnessTrainingState, startIllnessConversation } from "./illness-db.ts";
import { findTelegramUserId, loadActiveTransientDialogs, loadOrphanedTransientDialogKeys } from "./transient-dialog-db.ts";
import { planTransientDialogMessages } from "./transient-dialog.ts";
import { deliverReplyWithTransientCleanup } from "./transient-dialog-delivery.ts";
import { cleanupTransientDialogs } from "./transient-dialog-cleanup.ts";
import { runMeasurementMenuAction } from "./measurement-menu.ts";
import { dispatchWorkoutRequest } from "./workout-request.ts";

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

async function workoutReply(env: Env, telegramUserId: string): Promise<string> {
  const timeZone = env.APP_TIMEZONE || "Europe/Samara";
  const user = await ensureUser(env.DB, telegramUserId, timeZone);
  await cancelRecovery(env.DB, user.id);
  const schedule = await loadSchedule(env.DB, user.id);
  const local = localDateAt(new Date(), timeZone);
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
  const readiness = await loadReadinessForDate(env.DB, user.id, training.date);
  if (!readiness) return startReadinessConversation(env.DB, user.id, training.date);
  const decision = evaluateReadiness(readiness);
  if (!decision.allowed) {
    return `${training.date}: тренировку не составляю: ${decision.reasons.join(", ")}. При резком или необычном ухудшении состояния обратись за медицинской помощью.`;
  }
  const existing = await loadExistingGeneratedPlan(env.DB, user.id, training.date, training.focus, readiness.completedAt);
  if (existing) return formatWorkout(training.date, existing, true);
  const cycleLoadMode = await loadModeForDate(env.DB, user.id, training.date);
  const recoveryInput = await loadAutomaticRecoveryInput(
    env.DB,
    user.id,
    training.date,
    readiness,
    false,
    illnessState.phase,
    cycleLoadMode === "deload",
  );
  const recoverySafety = assessRecoverySafety(recoveryInput);
  if (!recoverySafety.allowed) {
    return `${training.date}: тренировку не составляю — проверка безопасности выявила: ${recoverySafety.reasons.join(", ")}. При тревожных симптомах обратись за медицинской помощью.`;
  }

  const emphasis = await loadNextTrainingEmphasis(env.DB, user.id, training.focus);
  if (!emphasis) {
    return `${training.date}: для группы «${training.label}» ещё не задан следующий программный акцент. План не создан, чтобы не выбирать его случайно.`;
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
  if (testing.length > 1) return `${training.date}: одновременно отмечено несколько тестируемых упражнений. Оставь одно через «🧪 Возврат упражнения», чтобы тест был контролируемым.`;
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
        ...programmingRules(training.focus, emphasis),
        ...(illnessState.phase ? postIllnessRules(illnessState.phase) : []),
        ...(testing.length ? [`Обязательно включи единственное тестируемое упражнение «${testing[0].name}» с минимальной консервативной нагрузкой. Политика: ${testing[0].reintroductionLoadPolicy ?? "без повышения веса"}. Прекратить при боли, отёке или нестабильности.`] : []),
        ...(preferred.length ? [`Предпочтительные упражнения владельца: ${preferred.join(", ")}. При прочих равных сохраняй их в программе.`] : []),
        ...(deprioritized.length ? [`Упражнения с пониженным приоритетом: ${deprioritized.join(", ")}. Используй только при программной причине.`] : []),
        ...(rare.length ? [`Редкие упражнения: ${rare.join(", ")}. Не выбирай их без конкретной причины замены или вариативности.`] : []),
        `Контекст цели и восстановления ресурсов: ${coachingContext}. Не компенсируй питание чрезмерным тренировочным объёмом.`,
        `Фактическая силовая динамика по совместимым типам веса: ${strengthContext}. Используй её как сигнал, но не повышай нагрузку без целевого RIR и стабильной техники.`,
        `Контекст прогрессии по фактическим подходам: ${progression.context}. Строки «жёсткий потолок» обязательны. Строки «тренерский сигнал» анализируй вместе с историей и сам выбери: повысить минимальным шагом, добавить повторения, удержать, снизить или заменить.`,
        "Добавки перечислены только как фактический контекст. Не назначай, не отменяй и не меняй их дозировку; не делай медицинских выводов.",
        `Актуальный предтренировочный чекин: ${compactReadiness(readiness)}.`,
      ],
      recoveryContext: compactRecoveryContext(recoveryInput),
    });
    if (cycleLoadMode === "deload" && generated.recovery.decision !== "deload") {
      throw new Error("Gemini попытался отменить активную запланированную разгрузку");
    }
    const loadMode = generated.recovery.decision;
    const progressionGuarded = applyProgressionGuard(
      generated.workout,
      progression.assessments,
      new Set(safe.allowed.map((exercise) => exercise.name)),
    );
    const recoveryGuarded = applyRecoveryLoadGuard(progressionGuarded, loadMode, progression.assessments);
    const workout = illnessState.phase ? applyPostIllnessSafetyGuard(recoveryGuarded, illnessState.phase) : recoveryGuarded;
    if (testing.length && !workout.exercises.some((exercise) => exercise.name === testing[0].name)) {
      throw new Error("Gemini пропустил обязательное тестируемое упражнение");
    }
    await recordAutomaticRecoveryAssessment(env.DB, user.id, training.date, recoveryInput, generated.recovery);
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
      const workout = await workoutReply(env, telegramUserId);
      return `${readinessReply.reply}\n\n${workout}`;
    }
    return readinessReply.reply;
  }
  const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
  const illnessReply = await answerIllnessConversation(env.DB, user.id, text, today);
  if (illnessReply !== null) return illnessReply;
  const measurementReply = await answerMeasurementConversation(env.DB, user.id, text, today);
  if (measurementReply !== null) return measurementReply;
  const injuryReply=await answerInjuryConversation(env.DB,user.id,text,today);if(injuryReply!==null)return injuryReply;
  const reintroductionReply=await answerReintroductionConversation(env.DB,user.id,text,today);if(reintroductionReply!==null)return reintroductionReply;
  const catalogReply=await answerExerciseCatalogConversation(env.DB,user.id,text);if(catalogReply!==null)return catalogReply;
  const exerciseAddReply=await answerExerciseAddConversation(env.DB,user.id,text);if(exerciseAddReply!==null)return exerciseAddReply;
  const scheduleReply=await answerScheduleConversation(env.DB,user.id,text,today);if(scheduleReply!==null)return scheduleReply;
  if (await loadPendingNutritionDraft(env.DB,user.id) || await pendingNutritionCsv(env.DB,user.id) || await pendingLabImageDraft(env.DB,user.id)) {
    return "Черновик ждёт подтверждения: проверь данные и отправь /confirm. Для отмены — «❌ Отмена».";
  }
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

async function recordDialogCleanupFailure(env: Env, error: unknown): Promise<void> {
  const description = error instanceof Error ? error.message : "unknown";
  await env.DB.prepare("INSERT INTO system_events(event_type,payload_json)VALUES('telegram_dialog_cleanup_failed',?)")
    .bind(JSON.stringify({ error: description.slice(0, 300) })).run();
}

async function handleCallbackQuery(update: TelegramUpdate, env: Env): Promise<Response> {
  const callback = update.callback_query;
  if (!callback) return new Response("ok");
  if (String(callback.from.id) !== env.ALLOWED_TELEGRAM_USER_ID) return new Response("forbidden", { status: 403 });
  const message = callback.message;
  if (!message) {
    await answerTelegramCallbackQuery(env.TELEGRAM_BOT_TOKEN, callback.id);
    return new Response("ok");
  }

  const telegramUserId = String(callback.from.id);
  const user = await ensureUser(env.DB, telegramUserId, env.APP_TIMEZONE || "Europe/Samara");
  if (callback.data?.startsWith("reintro:")) {
    const result = await applyReintroductionApproval(env.DB, user.id, callback.data);
    try {
      await deleteTelegramMessages(env.TELEGRAM_BOT_TOKEN, message.chat.id, [message.message_id]);
    } catch (error) {
      await recordDialogCleanupFailure(env, error);
    }
    await answerTelegramCallbackQuery(env.TELEGRAM_BOT_TOKEN, callback.id, fetch, result.notification);
    return new Response("ok");
  }
  await answerTelegramCallbackQuery(env.TELEGRAM_BOT_TOKEN, callback.id);
  if (!callback.data?.startsWith("measure:")) return new Response("ok");
  const transientDialogsBefore = await loadActiveTransientDialogs(env.DB, user.id);
  if (callback.data === "measure:new" && conflictingInput("/measure", transientDialogsBefore)) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, "Сначала заверши текущий диалог или нажми «❌ Отмена», затем выбери замеры.");
    return new Response("ok");
  }
  const action = await runMeasurementMenuAction(env.DB, user.id, callback.data);
  if (!action) return new Response("ok");
  const transientDialogsAfter = await loadActiveTransientDialogs(env.DB, user.id);
  const activeDialogKeys = transientDialogsAfter.map((dialog) => dialog.dialogKey);
  const orphanedMenuKeys = await loadOrphanedTransientDialogKeys(env.DB, user.id, activeDialogKeys);

  if (action.kind === "history") {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, action.reply, MAIN_MENU_MARKUP);
    try {
      const deleted = await cleanupTransientDialogs(
        env.DB,
        user.id,
        orphanedMenuKeys,
        (chatId, messageIds) => deleteTelegramMessages(env.TELEGRAM_BOT_TOKEN, chatId, messageIds),
      );
      if (deleted === 0) await deleteTelegramMessages(env.TELEGRAM_BOT_TOKEN, message.chat.id, [message.message_id]);
    } catch (error) {
      await recordDialogCleanupFailure(env, error);
    }
    return new Response("ok");
  }

  const transientPlan = planTransientDialogMessages(
    transientDialogsBefore,
    transientDialogsAfter,
    "/measure",
    update.update_id,
  );
  transientPlan.incomingDialogKey = undefined;
  transientPlan.cleanupDialogKeys = [...new Set([
    ...transientPlan.cleanupDialogKeys,
    ...orphanedMenuKeys.filter((key) => !key.startsWith("main_menu:")),
  ])];
  try {
    await deleteTelegramMessages(env.TELEGRAM_BOT_TOKEN, message.chat.id, [message.message_id]);
  } catch (error) {
    await recordDialogCleanupFailure(env, error);
  }
  await deliverReplyWithTransientCleanup({
    db: env.DB,
    userId: user.id,
    chatId: message.chat.id,
    incomingMessageId: message.message_id,
    reply: action.reply,
    replyMarkup: MAIN_MENU_MARKUP,
    plan: transientPlan,
    sendMessage: (text, replyMarkup) => sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, text, replyMarkup),
    deleteMessages: (chatId, messageIds) => deleteTelegramMessages(env.TELEGRAM_BOT_TOKEN, chatId, messageIds),
    onCleanupFailure: (error) => recordDialogCleanupFailure(env, error),
  });
  return new Response("ok");
}

async function handleUpdate(update: TelegramUpdate, env: Env): Promise<Response> {
  const message = update.message;
  if (!message?.from || (!message.text && !message.caption && !message.photo?.length && !message.document && !message.voice)) return new Response("ok");
  if (String(message.from.id) !== env.ALLOWED_TELEGRAM_USER_ID) return new Response("forbidden", { status: 403 });

  const telegramUserId = String(message.from.id);
  const userIdBefore = await findTelegramUserId(env.DB, telegramUserId);
  const reportDraftBefore = userIdBefore ? await loadPendingReportDraft(env.DB, userIdBefore) : null;
  const transientDialogsBefore = userIdBefore ? await loadActiveTransientDialogs(env.DB, userIdBefore) : [];
  const originalText = (message.text ?? message.caption ?? "").trim();
  let text = message.photo?.length||message.document||message.voice ? originalText : commandFromMenuText(originalText);
  text = text.replace(/^\/(\w+)@\w+(?=\s|$)/, "/$1");
  const inputConflict = conflictingInput(text, transientDialogsBefore);
  const inputBefore = userIdBefore ? await pendingCommandInput(env.DB, userIdBefore) : null;
  let inputError: string | undefined;
  if (inputBefore && (message.photo?.length || message.document || message.voice) && text.startsWith("/")) {
    const expected = routeCommandInput(inputBefore.kind,"",message.photo?.length?"photo":message.document?"document":"voice");
    if (text !== expected) inputError = INPUT_HINTS[inputBefore.kind];
  }
  if (inputBefore && !text.startsWith("/")) {
    const routed = routeCommandInput(inputBefore.kind, text, message.photo?.length ? "photo" : message.document ? "document" : message.voice ? "voice" : "text");
    if (routed) text = routed;
    else inputError = INPUT_HINTS[inputBefore.kind];
  }
  const waitingForWeight = transientDialogsBefore.some((dialog) => dialog.flowType === "weight");
  if (waitingForWeight && message.text && !text.startsWith("/")) text = `/weight ${text}`;
  if (!inputConflict && waitingForWeight && userIdBefore && text.startsWith("/") && !/^\/(?:weight|menu|start|help|cancel)(?:@\w+)?(?:\s|$)/i.test(text)) {
    await cancelWeightConversation(env.DB, userIdBefore);
  }
  const offset = requestedDayOffset(text);
  let reply: string;
  let showMenu = false;
  let replyMarkup: unknown;
  let inputWriteSucceeded = true;
  if (inputConflict) { reply = "Сначала заверши текущий диалог или нажми «❌ Отмена», затем выбери нужное действие.";
  } else if (inputError) { reply = inputError;
  } else if(message.voice){reply=await voiceReportReply(update,env,String(message.from.id));
  } else if(message.document){reply=/^\/fatsecret(?:@\w+)?$/i.test(text)?await nutritionCsvReply(update,env,String(message.from.id)):"CSV обрабатывается только с подписью /fatsecret.";
  } else if (message.photo?.length) {
    if(/^\/nutrition(?:@\w+)?$/i.test(text))reply=await nutritionPhotoReply(update,env,String(message.from.id));
    else if(/^\/labphoto(?:@\w+)?$/i.test(text))reply=await labPhotoReply(update,env,String(message.from.id));
    else reply="Фото обрабатывается только с явной подписью: /nutrition для КБЖУ или /labphoto для лабораторного бланка. Без подписи фото не отправляется в Gemini.";
  } else if (text === "/start" || text === "/help" || text === "/menu") {
    await ensureUser(env.DB, telegramUserId, env.APP_TIMEZONE || "Europe/Samara");
    showMenu = true;
    reply = MENU_INTRO;
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
        reply = question;
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
    if (await cancelCommandInput(env.DB, user.id)) {
      reply = "Ввод отменён. Данные не изменены.";
    } else if (await cancelWeightConversation(env.DB, user.id)) {
      reply = "Ввод веса отменён.";
    } else if (await cancelPostWorkoutCheckin(env.DB, user.id)) {
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
    reply = "Замеры: выбери действие.";
    replyMarkup = MEASUREMENT_MENU_MARKUP;
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
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");
    await cancelRecovery(env.DB,user.id);
    reply="Отдельный чекин восстановления больше не нужен. Бот автоматически рассчитывает режим нагрузки по предтренировочному чекину, болезни, последним тренировкам и тяжёлым неделям при запросе /today.";
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
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelReminderConversation(env.DB,user.id);reply="С октября 2026 года бот автоматически напоминает о семи замерах в первую субботу месяца в 10:00 по Самаре. Если полный комплект за этот месяц уже сохранён, напоминания не будет.";
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
    const user = await ensureUser(env.DB, telegramUserId, env.APP_TIMEZONE || "Europe/Samara");
    const weight = parseWeightCommand(text);
    if (/^\/weight(?:@\w+)?$/i.test(text)) {
      reply = transientDialogsBefore.some((dialog) => dialog.flowType !== "weight")
        ? "Сначала заверши текущий диалог или нажми «❌ Отмена», затем выбери «⚖️ Вес»."
        : await startWeightConversation(env.DB, user.id);
    } else if (weight === null) {
      reply = "Укажи вес числом от 30 до 300 кг, например 78,5.";
    } else {
      const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
      await saveEmergencyWeight(env.DB, user.id, today, weight);
      await completeWeightConversation(env.DB, user.id);
      reply = `${today}: вес ${weight} кг сохранён.`;
    }
  } else if (text === "/nutrition") {
    reply = "Пришли один скриншот дневного итога FatSecret и добавь к фотографии подпись /nutrition. Без подписи изображение не отправится в Gemini.";
  } else if(text==="/fatsecret"){
    reply="Экспортируй пользовательский отчёт FatSecret в CSV и отправь его документом с подписью /fatsecret. Сначала бот покажет черновик; запись будет только после /confirm.";
  } else if (text === "/supplements") {
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const rows=await listSupplements(env.DB,user.id);
    reply=`${rows.length?["Активные добавки:",...rows.map((r)=>`${r.id}. ${r.name} — ${r.dose_value} ${r.dose_unit}, ${r.schedule_text}`)].join("\n"):"Активные добавки не записаны."}\n\n${SUPPLEMENT_HELP}`;
  } else if (/^\/supplement_stop(?:@\w+)?(?:\s|$)/i.test(text)) {
    const id=parseStopSupplementCommand(text);if(id===null)reply=`Неверный формат. ${SUPPLEMENT_HELP}`;else{const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));inputWriteSucceeded=await stopSupplement(env.DB,user.id,id,today);reply=inputWriteSucceeded?"Добавка остановлена; история сохранена.":"Активная добавка с таким номером не найдена. Укажи другой номер.";}
  } else if (/^\/supplement(?:@\w+)?(?:\s|$)/i.test(text)) {
    const input=parseSupplementCommand(text);if(!input)reply=`Неверный формат. ${SUPPLEMENT_HELP}`;else{const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));await addSupplement(env.DB,user.id,input,today);reply=`Сохранено: ${input.name} — ${input.doseValue} ${input.doseUnit}, ${input.schedule}. Я фиксирую факт приёма, но не меняю назначения и дозировки.`;}
  } else if (text === "/labphoto") {
    reply = INPUT_HINTS.lab;
  } else if (text === "/labs") {
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const rows=await listLabResults(env.DB,user.id);
    reply=`${rows.length?["Последние анализы:",...rows.map((r)=>`${r.id}. ${r.collected_on} — ${r.marker_name}: ${r.value_text} ${r.unit} (референс ${r.reference_text})`)].join("\n"):"Анализы пока не записаны."}\n\nФото бланка: добавь к фотографии подпись /labphoto.\n${LAB_HELP}\n\nБот хранит данные, но не ставит диагноз и не меняет назначения.`;
  } else if (/^\/lab_cancel(?:@\w+)?(?:\s|$)/i.test(text)) {
    const id=parseCancelLabCommand(text);if(id===null)reply=`Неверный формат. ${LAB_HELP}`;else{const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");inputWriteSucceeded=await cancelLabResult(env.DB,user.id,id);reply=inputWriteSucceeded?"Ошибочная запись анализа отменена; она исключена из активного списка, история сохранена.":"Активная запись с таким номером не найдена. Укажи другой номер.";}
  } else if (/^\/lab(?:@\w+)?(?:\s|$)/i.test(text)) {
    const input=parseLabCommand(text);if(!input)reply=`Неверный формат. ${LAB_HELP}`;else{const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));await addLabResult(env.DB,user.id,input,today);reply=`Сохранено: ${input.marker} — ${input.valueText} ${input.unit}, лабораторный референс ${input.reference}, дата ${input.date??today}. Медицинская интерпретация не выполнялась.`;}
  } else if (offset !== null) {
    reply = await dispatchWorkoutRequest(offset, async () => {
      const user = await ensureUser(env.DB, telegramUserId, env.APP_TIMEZONE || "Europe/Samara");
      const pendingPostWorkout = await pendingPostWorkoutQuestion(env.DB, user.id);
      return pendingPostWorkout
        ? `Сначала закончи послетренировочный чекин или отмени его командой /cancel.\n\n${pendingPostWorkout}`
        : workoutReply(env, telegramUserId);
    });
  } else {
    reply = await freeTextReply(update, env, String(message.from.id), text);
  }
  const openingInput = !message.photo?.length && !message.document && !message.voice ? INPUT_COMMANDS[text] : undefined;
  if (openingInput && !inputConflict) {
    const user = await ensureUser(env.DB, telegramUserId, env.APP_TIMEZONE || "Europe/Samara");
    await startCommandInput(env.DB, user.id, openingInput);
    reply = ["/goal", "/supplements", "/labs", "/export"].includes(text)
      ? `${reply.split("\n\n")[0]}\n\n${INPUT_HINTS[openingInput]}`
      : INPUT_HINTS[openingInput];
  }
  if (inputBefore && userIdBefore && !inputConflict && !inputError) {
    const draftReady = message.photo?.length
      ? (inputBefore.kind === "nutrition" ? await loadPendingNutritionDraft(env.DB,userIdBefore) : inputBefore.kind === "lab" ? await pendingLabImageDraft(env.DB,userIdBefore) : null)
      : message.document && inputBefore.kind === "fatsecret" ? await pendingNutritionCsv(env.DB,userIdBefore) : null;
    if ((inputWriteSucceeded && validCommandInput(inputBefore.kind,text)) || draftReady) await completeCommandInput(env.DB,userIdBefore,inputBefore.id);
  }
  const userId = userIdBefore ?? await findTelegramUserId(env.DB, telegramUserId);
  if (!userId) {
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      message.chat.id,
      reply,
      replyMarkup ?? (showMenu ? MAIN_MENU_MARKUP : undefined),
    );
    return new Response("ok");
  }
  const transientDialogsAfter = await loadActiveTransientDialogs(env.DB, userId);
  const reportDraftAfter = await loadPendingReportDraft(env.DB, userId);
  const completedPostWorkoutCheckin = transientDialogsBefore.find((dialog) =>
    dialog.flowType === "post_workout_checkin"
    && !transientDialogsAfter.some((current) => current.dialogKey === dialog.dialogKey)
  );
  const isDataUpload = Boolean(
    (message.document && /^\/fatsecret(?:@\w+)?$/i.test(text))
    || (message.photo?.length && /^\/(?:nutrition|labphoto)(?:@\w+)?$/i.test(text)),
  );
  const transientPlan = planTransientDialogMessages(
    transientDialogsBefore,
    transientDialogsAfter,
    text,
    update.update_id,
    isDataUpload,
  );
  if (inputBefore?.kind === "export" && text === "/export_confirm") transientPlan.outgoingDialogKey = undefined;
  if (reportDraftAfter && reportDraftAfter.id !== reportDraftBefore?.id) {
    transientPlan.incomingDialogKey = undefined;
    transientPlan.outgoingDialogKey = `report_confirmation:${reportDraftAfter.id}`;
  }
  if (reportDraftBefore && (text === "/confirm" || text === "/cancel")) {
    const key = `report_confirmation:${reportDraftBefore.id}`;
    transientPlan.incomingDialogKey = key;
    if (reportDraftAfter?.id === reportDraftBefore.id) {
      transientPlan.outgoingDialogKey = key;
    } else {
      transientPlan.cleanupDialogKeys.push(key);
      if (!transientPlan.outgoingDialogKey) transientPlan.outgoingDialogKey = key;
    }
  }
  if (text === "/measure" && !transientPlan.incomingDialogKey && !transientPlan.outgoingDialogKey) {
    const dialogKey = `measurement_menu:${update.update_id}`;
    transientPlan.incomingDialogKey = dialogKey;
    transientPlan.outgoingDialogKey = dialogKey;
  }
  const retryableCleanupKeys = await loadOrphanedTransientDialogKeys(
    env.DB,
    userId,
    transientDialogsAfter.map((dialog) => dialog.dialogKey),
  );
  const keepMainMenu = !showMenu && (transientDialogsAfter.length > 0 || !!reportDraftAfter || text === "/measure");
  transientPlan.cleanupDialogKeys = [...new Set([
    ...transientPlan.cleanupDialogKeys,
    ...retryableCleanupKeys.filter((key) => !keepMainMenu || !key.startsWith("main_menu:")),
  ])];
  if (showMenu) {
    const commandKey = `menu_command:${update.update_id}`;
    transientPlan.incomingDialogKey = commandKey;
    transientPlan.outgoingDialogKey = `main_menu:${update.update_id}`;
    transientPlan.cleanupDialogKeys.push(commandKey);
  }
  await deliverReplyWithTransientCleanup({
    db: env.DB,
    userId,
    chatId: message.chat.id,
    incomingMessageId: message.message_id,
    reply,
    replyMarkup: replyMarkup ?? (showMenu ? MAIN_MENU_MARKUP : undefined),
    plan: transientPlan,
    sendMessage: (outgoingText, replyMarkup) => sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      message.chat.id,
      outgoingText,
      replyMarkup,
    ),
    deleteMessages: (chatId, messageIds) => deleteTelegramMessages(env.TELEGRAM_BOT_TOKEN, chatId, messageIds),
    onCleanupFailure: (error) => recordDialogCleanupFailure(env, error),
  });
  if (completedPostWorkoutCheckin && text !== "/cancel") {
    const offer = await findReintroductionApprovalOffer(env.DB, userId, completedPostWorkoutCheckin.flowId);
    if (offer) {
      await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        reintroductionApprovalText(offer),
        reintroductionApprovalMarkup(offer),
      );
    }
  }
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
      const response = update.callback_query ? await handleCallbackQuery(update, env) : await handleUpdate(update, env);
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
