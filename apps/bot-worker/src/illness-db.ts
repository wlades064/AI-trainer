import type { D1Database } from "./db.ts";
import { loadSchedule } from "./db.ts";
import { trainingForDate, type LocalDate, type TrainingFocus } from "./domain/schedule.ts";
import { parseIllnessAction, parseIllnessDate, postIllnessPhase, type PostIllnessPhase } from "./illness.ts";

interface IllnessEpisode { id: number; started_on: string; recovered_on: string | null; status: "active" | "recovered" }
interface Conversation { id: number; step: 1 | 2; mode: "start" | "recover" | null }
interface ExceptionRow { local_date: string; focus: TrainingFocus; reason: string | null }

function local(date: string): LocalDate {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function pending(db: D1Database, userId: number): Promise<Conversation | null> {
  return db.prepare("SELECT id,step,mode FROM illness_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP ORDER BY updated_at DESC LIMIT 1")
    .bind(userId).first<Conversation>();
}

export async function loadActiveIllness(db: D1Database, userId: number): Promise<IllnessEpisode | null> {
  return db.prepare("SELECT id,started_on,recovered_on,status FROM illness_episodes WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1")
    .bind(userId).first<IllnessEpisode>();
}

async function latestIllness(db: D1Database, userId: number): Promise<IllnessEpisode | null> {
  return db.prepare("SELECT id,started_on,recovered_on,status FROM illness_episodes WHERE user_id=? ORDER BY started_on DESC,id DESC LIMIT 1")
    .bind(userId).first<IllnessEpisode>();
}

function effectiveFocus(date: string, rules: Awaited<ReturnType<typeof loadSchedule>>, row?: ExceptionRow): Exclude<TrainingFocus, "rest"> | null {
  const base = trainingForDate(local(date), rules).focus;
  if (!row) return base === "rest" ? null : base;
  if (row.focus !== "rest") return row.focus;
  try {
    const reason = JSON.parse(row.reason ?? "{}") as { kind?: string };
    if (reason.kind === "cancel") return base === "rest" ? null : base;
    if (reason.kind === "move") return null;
  } catch {
    return null;
  }
  return null;
}

async function backfillIllnessAbsences(db: D1Database, userId: number, episodeId: number, start: string, endInclusive: string): Promise<number> {
  if (endInclusive < start) return 0;
  const [rules, exceptions, completed] = await Promise.all([
    loadSchedule(db, userId),
    db.prepare("SELECT local_date,focus,reason FROM schedule_exceptions WHERE user_id=? AND local_date>=? AND local_date<=?")
      .bind(userId, start, endInclusive).all<ExceptionRow>(),
    db.prepare("SELECT DISTINCT local_date FROM workout_sessions WHERE user_id=? AND confirmed_at IS NOT NULL AND local_date>=? AND local_date<=?")
      .bind(userId, start, endInclusive).all<{ local_date: string }>(),
  ]);
  const byDate = new Map((exceptions.results ?? []).map((row) => [row.local_date, row]));
  const completedDates = new Set((completed.results ?? []).map((row) => row.local_date));
  const statements = [];
  for (let date = start; date <= endInclusive; date = addDays(date, 1)) {
    if (completedDates.has(date)) continue;
    const focus = effectiveFocus(date, rules, byDate.get(date));
    if (!focus) continue;
    statements.push(db.prepare(
      `INSERT INTO training_absences(user_id,local_date,focus,reason,illness_episode_id,source_kind)
       VALUES(?,?,?,'illness',?,'illness_backfill')
       ON CONFLICT(user_id,local_date) DO UPDATE SET
         focus=excluded.focus,reason='illness',illness_episode_id=excluded.illness_episode_id,
         source_kind='illness_backfill',updated_at=CURRENT_TIMESTAMP`,
    ).bind(userId, date, focus, episodeId));
  }
  if (!statements.length) return 0;
  if (db.batch) await db.batch(statements);
  else for (const statement of statements) await statement.run();
  return statements.length;
}

export async function recordOrdinaryAbsence(db: D1Database, userId: number, date: string, focus: Exclude<TrainingFocus, "rest">): Promise<void> {
  await db.prepare(
    `INSERT INTO training_absences(user_id,local_date,focus,reason,source_kind)
     VALUES(?,?,?,'ordinary','telegram')
     ON CONFLICT(user_id,local_date) DO UPDATE SET
       focus=excluded.focus,reason='ordinary',illness_episode_id=NULL,source_kind='telegram',updated_at=CURRENT_TIMESTAMP
     WHERE training_absences.reason='ordinary'`,
  ).bind(userId, date, focus).run();
}

export async function clearOrdinaryAbsence(db: D1Database, userId: number, date: string): Promise<void> {
  await db.prepare("DELETE FROM training_absences WHERE user_id=? AND local_date=? AND reason='ordinary'").bind(userId, date).run();
}

export async function loadIllnessTrainingState(db: D1Database, userId: number, plannedFor: string): Promise<{ active: IllnessEpisode | null; phase: PostIllnessPhase | null }> {
  const active = await loadActiveIllness(db, userId);
  if (active) return { active, phase: null };
  const episode = await db.prepare(
    "SELECT id,started_on,recovered_on,status FROM illness_episodes WHERE user_id=? AND status='recovered' AND recovered_on<=? ORDER BY recovered_on DESC,id DESC LIMIT 1",
  ).bind(userId, plannedFor).first<IllnessEpisode>();
  if (!episode?.recovered_on) return { active: null, phase: null };
  const count = await db.prepare(
    "SELECT COUNT(*) AS count FROM workout_sessions WHERE user_id=? AND confirmed_at IS NOT NULL AND local_date>=? AND local_date<?",
  ).bind(userId, episode.recovered_on, plannedFor).first<{ count: number }>();
  return { active: null, phase: postIllnessPhase(Number(count?.count ?? 0)) };
}

export async function startIllnessConversation(db: D1Database, userId: number): Promise<string> {
  const current = await pending(db, userId);
  const episode = await latestIllness(db, userId);
  if (!current) {
    await db.prepare("UPDATE illness_conversations SET status='expired' WHERE user_id=? AND status='pending'").bind(userId).run();
    await db.prepare("INSERT INTO illness_conversations(user_id,step,status,expires_at)VALUES(?,1,'pending',datetime('now','+2 days'))").bind(userId).run();
  }
  if (current?.step === 2) {
    return current.mode === "start"
      ? "Когда началась болезнь? Напиши «сегодня» или дату ГГГГ-ММ-ДД. Можно указать дату за последние 90 дней."
      : `Когда восстановился? Напиши «сегодня» или дату ГГГГ-ММ-ДД${episode?.status === "active" ? `, не раньше ${episode.started_on}` : ""}.`;
  }
  const status = episode?.status === "active"
    ? `Болезнь отмечена с ${episode.started_on}. Тренировки временно заблокированы.`
    : episode?.recovered_on
      ? `Последний период болезни: ${episode.started_on} - ${episode.recovered_on}. Возвращение считается по фактически выполненным тренировкам.`
      : "Периодов болезни пока нет.";
  return `${status}\n\nНапиши «заболел» или «выздоровел».`;
}

export async function cancelIllnessConversation(db: D1Database, userId: number): Promise<boolean> {
  const row = await pending(db, userId);
  if (!row) return false;
  await db.prepare("UPDATE illness_conversations SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
  return true;
}

export async function answerIllnessConversation(db: D1Database, userId: number, text: string, today: string): Promise<string | null> {
  const row = await pending(db, userId);
  if (!row) return null;
  if (row.step === 1) {
    const action = parseIllnessAction(text);
    if (!action) return "Не понял действие. Напиши «заболел» или «выздоровел».";
    const active = await loadActiveIllness(db, userId);
    if (action === "start" && active) return `Болезнь уже отмечена с ${active.started_on}. Когда восстановишься, выбери «выздоровел».`;
    if (action === "recover" && !active) return "Активного периода болезни нет. Если нужно начать период, напиши «заболел».";
    await db.prepare("UPDATE illness_conversations SET mode=?,step=2,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(action, row.id).run();
    return action === "start"
      ? "Когда началась болезнь? Напиши «сегодня» или дату ГГГГ-ММ-ДД. Можно указать дату за последние 90 дней."
      : `Когда восстановился? Напиши «сегодня» или дату ГГГГ-ММ-ДД, не раньше ${active!.started_on}.`;
  }
  if (!row.mode) throw new Error("Повреждён диалог болезни");
  const date = parseIllnessDate(text, today);
  if (!date) return "Нужна корректная дата за последние 90 дней и не позднее сегодня: сегодня или ГГГГ-ММ-ДД.";
  if (row.mode === "start") {
    if (await loadActiveIllness(db, userId)) return "Активный период болезни уже существует. Данные не изменены.";
    const inserted = await db.prepare(
      "INSERT INTO illness_episodes(user_id,started_on,status,source_kind)VALUES(?,?,'active','telegram') RETURNING id",
    ).bind(userId, date).first<{ id: number }>();
    if (!inserted) throw new Error("Не удалось сохранить период болезни");
    await db.prepare("UPDATE workout_plans SET status='skipped' WHERE user_id=? AND planned_for>=? AND status IN ('sent','accepted')")
      .bind(userId, date).run();
    const absenceCount = await backfillIllnessAbsences(db, userId, inserted.id, date, today);
    await db.prepare("UPDATE illness_conversations SET status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
    await db.prepare("INSERT INTO system_events(event_type,payload_json)VALUES('illness_started',?)").bind(JSON.stringify({ absenceCount })).run();
    return `Болезнь отмечена с ${date}. Тренировки заблокированы до отметки о выздоровлении. Пропусков по болезни учтено: ${absenceCount}.`;
  }
  const active = await loadActiveIllness(db, userId);
  if (!active) return "Активного периода болезни уже нет. Данные не изменены.";
  if (date < active.started_on) return `Дата выздоровления не может быть раньше ${active.started_on}.`;
  await db.prepare("UPDATE illness_episodes SET status='recovered',recovered_on=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'").bind(date, active.id).run();
  await db.prepare("DELETE FROM training_absences WHERE illness_episode_id=? AND local_date>=?").bind(active.id, date).run();
  const absenceCount = await backfillIllnessAbsences(db, userId, active.id, active.started_on, addDays(date, -1));
  await db.prepare("UPDATE illness_conversations SET status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
  await db.prepare("INSERT INTO system_events(event_type,payload_json)VALUES('illness_recovered',?)").bind(JSON.stringify({ absenceCount })).run();
  return `Выздоровление отмечено с ${date}. Следующие две фактически выполненные тренировки будут составлены с учётом этапа возвращения и текущего чекина; пропуски не продвигают возвращение.`;
}
