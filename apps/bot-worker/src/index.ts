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
import { downloadTelegramPhoto, selectEfficientPhoto, sendTelegramMessage, type TelegramUpdate } from "./telegram.ts";
import {
  cancelPendingReportDraft,
  confirmPendingReportDraft,
  loadCatalogExerciseNames,
  loadPendingReportDraft,
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

  const [candidates, restrictions, recentSummary, coachingContext,strengthContext] = await Promise.all([
    loadExerciseCandidates(env.DB, user.id, training.focus),
    loadActiveRestrictions(env.DB, user.id),
    loadRecentSummary(env.DB, user.id, training.focus),
    loadCompactCoachingContext(env.DB, user.id),
    compactStrengthContext(env.DB,user.id,training.focus,training.date),
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
        ...(testing.length ? [`Обязательно включи единственное тестируемое упражнение «${testing[0].name}» с минимальной консервативной нагрузкой. Политика: ${testing[0].reintroductionLoadPolicy ?? "без повышения веса"}. Прекратить при боли, отёке или нестабильности.`] : []),
        ...(preferred.length ? [`Предпочтительные упражнения владельца: ${preferred.join(", ")}. При прочих равных сохраняй их в программе.`] : []),
        ...(deprioritized.length ? [`Упражнения с пониженным приоритетом: ${deprioritized.join(", ")}. Используй только при программной причине.`] : []),
        ...(rare.length ? [`Редкие упражнения: ${rare.join(", ")}. Не выбирай их без конкретной причины замены или вариативности.`] : []),
        `Контекст цели и восстановления ресурсов: ${coachingContext}. Не компенсируй питание чрезмерным тренировочным объёмом.`,
        `Фактическая силовая динамика по совместимым типам веса: ${strengthContext}. Используй её как сигнал, но не повышай нагрузку без целевого RIR и стабильной техники.`,
        "Добавки перечислены только как фактический контекст. Не назначай, не отменяй и не меняй их дозировку; не делай медицинских выводов.",
        ...(readiness ? [`Актуальный предтренировочный чекин: ${compactReadiness(readiness)}.`] : []),
      ],
    });
    if (testing.length && !generated.workout.exercises.some((exercise) => exercise.name === testing[0].name)) {
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
  const readinessReply = await answerReadinessConversation(env.DB, user.id, text);
  if (readinessReply !== null) {
    if (readinessReply.completed && readinessReply.allowed) {
      const workout = await workoutReply(0, env, telegramUserId);
      return `${readinessReply.reply}\n\n${workout}`;
    }
    return readinessReply.reply;
  }
  const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
  const measurementReply = await answerMeasurementConversation(env.DB, user.id, text, today);
  if (measurementReply !== null) return measurementReply;
  const recoveryReply=await answerRecovery(env.DB,user.id,text,today);if(recoveryReply!==null)return recoveryReply;
  const injuryReply=await answerInjuryConversation(env.DB,user.id,text,today);if(injuryReply!==null)return injuryReply;
  const reintroductionReply=await answerReintroductionConversation(env.DB,user.id,text,today);if(reintroductionReply!==null)return reintroductionReply;
  const catalogReply=await answerExerciseCatalogConversation(env.DB,user.id,text);if(catalogReply!==null)return catalogReply;
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

async function labPhotoReply(update:TelegramUpdate,env:Env,telegramUserId:string):Promise<string>{const message=update.message;if(!message?.photo?.length)throw new Error("Фото отсутствует");const user=await ensureUser(env.DB,telegramUserId,env.APP_TIMEZONE||"Europe/Samara");const selected=selectEfficientPhoto(message.photo);const existing=await findLabImage(env.DB,user.id,selected.file_unique_id);if(existing)return existing.status==="confirmed"?"Этот лабораторный бланк уже сохранён.":formatLabImageDraft(JSON.parse(existing.parsed_json));try{const image=await downloadTelegramPhoto(env.TELEGRAM_BOT_TOKEN,selected.file_id);const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));const parsed=await parseLabScreenshot(env.GEMINI_API_KEY,env.GEMINI_MODEL,image,today);await saveLabImageDraft(env.DB,user.id,update.update_id,selected.file_unique_id,parsed.draft,env.GEMINI_MODEL,parsed.inputTokens,parsed.outputTokens);return formatLabImageDraft(parsed.draft)}catch(error){await env.DB.prepare("INSERT INTO system_events(event_type,payload_json)VALUES('lab_screenshot_failed',?)").bind(JSON.stringify({error:error instanceof Error?error.message:"unknown"})).run();return"Не смог надёжно прочитать бланк. Ничего не сохранено. Пришли одно чёткое фото с подписью /labphoto."}}

async function handleUpdate(update: TelegramUpdate, env: Env): Promise<Response> {
  const message = update.message;
  if (!message?.from || (!message.text && !message.caption && !message.photo?.length)) return new Response("ok");
  if (String(message.from.id) !== env.ALLOWED_TELEGRAM_USER_ID) return new Response("forbidden", { status: 403 });

  const originalText = (message.text ?? message.caption ?? "").trim();
  const text = message.photo?.length ? originalText : commandFromMenuText(originalText);
  const offset = requestedDayOffset(text);
  let reply: string;
  let showMenu = false;
  if (message.photo?.length) {
    if(/^\/nutrition(?:@\w+)?$/i.test(text))reply=await nutritionPhotoReply(update,env,String(message.from.id));
    else if(/^\/labphoto(?:@\w+)?$/i.test(text))reply=await labPhotoReply(update,env,String(message.from.id));
    else reply="Фото обрабатывается только с явной подписью: /nutrition для КБЖУ или /labphoto для лабораторного бланка. Без подписи фото не отправляется в Gemini.";
  } else if (text === "/start" || text === "/help" || text === "/menu") {
    showMenu = true;
    reply = "Команды: /today — тренировка на сегодня, /tomorrow — на завтра, /goal — текущая цель, /confirm — подтвердить отчёт или КБЖУ, /nutrition — подпись к скриншоту FatSecret, /weight 87.5 — аварийная запись веса, /measure — месячные замеры, /progress — тело и питание, /strength — силовая динамика, /injuries — травмы, /reintroductions — возврат упражнений, /exercises — каталог, /cancel — отмена текущего диалога.";
  } else if (text === "/confirm") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    const workoutDraft = await loadPendingReportDraft(env.DB, user.id);
    const nutritionDraft = workoutDraft ? null : await loadPendingNutritionDraft(env.DB, user.id);
    const labDraft = workoutDraft||nutritionDraft?null:await pendingLabImageDraft(env.DB,user.id);
    if (nutritionDraft) {
      const confirmed = await confirmNutritionDraft(env.DB, user.id);
      reply = `${confirmed.date}: общий КБЖУ подтверждён и сохранён в истории питания.`;
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
    } else if(await cancelLabImageDraft(env.DB,user.id)){
      reply="Черновик анализов отменён. Показатели не сохранены.";
    } else if (await cancelMeasurementConversation(env.DB, user.id)) {
      reply = "Ввод замеров отменён. Незавершённые значения не сохранены.";
    } else if(await cancelRecovery(env.DB,user.id)){
      reply="Чекин восстановления отменён. Решение о разгрузке не менялось.";
    } else if(await cancelInjuryConversation(env.DB,user.id)){
      reply="Управление травмами отменено. Данные не изменены.";
    } else if(await cancelReintroductionConversation(env.DB,user.id)){
      reply="Управление возвратом упражнений отменено. Статусы не изменены.";
    } else if(await cancelExerciseCatalogConversation(env.DB,user.id)){
      reply="Управление каталогом упражнений отменено.";
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
    reply = await startMeasurementConversation(env.DB, user.id);
  } else if (text === "/progress") {
    const user = await ensureUser(env.DB, String(message.from.id), env.APP_TIMEZONE || "Europe/Samara");
    const today = toIsoDate(localDateAt(new Date(), env.APP_TIMEZONE || "Europe/Samara"));
    reply = await progressSummary(env.DB, user.id, today);
  } else if(text==="/strength"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");const today=toIsoDate(localDateAt(new Date(),env.APP_TIMEZONE||"Europe/Samara"));reply=await strengthProgressSummary(env.DB,user.id,today);
  } else if(text==="/recovery"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");reply=await startRecovery(env.DB,user.id);
  } else if(text==="/injuries"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelReintroductionConversation(env.DB,user.id);await cancelExerciseCatalogConversation(env.DB,user.id);reply=await startInjuryConversation(env.DB,user.id);
  } else if(text==="/reintroductions"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelInjuryConversation(env.DB,user.id);await cancelExerciseCatalogConversation(env.DB,user.id);reply=await startReintroductionConversation(env.DB,user.id);
  } else if(text==="/exercises"){
    const user=await ensureUser(env.DB,String(message.from.id),env.APP_TIMEZONE||"Europe/Samara");await cancelInjuryConversation(env.DB,user.id);await cancelReintroductionConversation(env.DB,user.id);reply=await startExerciseCatalogConversation(env.DB,user.id);
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
    await env.DB.prepare("INSERT INTO system_events (event_type, scheduled_for, payload_json) VALUES (?, ?, ?)")
      .bind("cron_fired", new Date(controller.scheduledTime).toISOString(), JSON.stringify({ cron: controller.cron }))
      .run();
  },
};
