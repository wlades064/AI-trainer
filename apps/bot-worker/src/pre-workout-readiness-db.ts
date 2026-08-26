import type { D1Database } from "./db.ts";
import { evaluateReadiness } from "./domain/safety.ts";
import {
  invalidReadinessAnswer,
  parseCurrentPain,
  parseReadinessScale,
  parseRedFlags,
  parseSleepMinutes,
  readinessQuestion,
  type ReadinessStep,
} from "./pre-workout-readiness.ts";

export interface ReadinessRecord {
  sleepMinutes: number;
  sleepQuality: number;
  energy: number;
  pain: number;
  painDetails?: string;
  hasNewSwelling: boolean;
  hasInstability: boolean;
  feelsUnwell: boolean;
}

interface ReadinessConversationRow {
  id: number;
  requested_date: string;
  step: ReadinessStep;
  sleep_minutes: number | null;
  sleep_quality: number | null;
  energy: number | null;
  pain: number | null;
  pain_details: string | null;
}

export interface ReadinessAnswerResult {
  reply: string;
  completed: boolean;
  allowed?: boolean;
}

async function loadPendingConversation(db: D1Database, userId: number): Promise<ReadinessConversationRow | null> {
  return db.prepare(
    `SELECT id, requested_date, step, sleep_minutes, sleep_quality, energy, pain, pain_details
     FROM readiness_conversations
     WHERE user_id = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP
     ORDER BY updated_at DESC LIMIT 1`,
  ).bind(userId).first<ReadinessConversationRow>();
}

export async function startReadinessConversation(db: D1Database, userId: number, requestedDate: string): Promise<string> {
  const pending = await loadPendingConversation(db, userId);
  if (pending?.requested_date === requestedDate) return readinessQuestion(pending.step);
  await db.prepare(
    "UPDATE readiness_conversations SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'pending'",
  ).bind(userId).run();
  await db.prepare(
    `INSERT INTO readiness_conversations(user_id, requested_date, step, status, expires_at)
     VALUES (?, ?, 1, 'pending', datetime('now', '+4 hours'))
     ON CONFLICT(user_id, requested_date) DO UPDATE SET
       step = 1, sleep_minutes = NULL, sleep_quality = NULL, energy = NULL,
       pain = NULL, pain_details = NULL, status = 'pending',
       expires_at = datetime('now', '+4 hours'), updated_at = CURRENT_TIMESTAMP, completed_at = NULL`,
  ).bind(userId, requestedDate).run();
  return readinessQuestion(1);
}

export async function cancelReadinessConversation(db: D1Database, userId: number): Promise<boolean> {
  const pending = await loadPendingConversation(db, userId);
  if (!pending) return false;
  await db.prepare(
    "UPDATE readiness_conversations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
  ).bind(pending.id).run();
  return true;
}

export async function pendingReadinessQuestion(db: D1Database, userId: number): Promise<string | null> {
  const pending = await loadPendingConversation(db, userId);
  return pending ? readinessQuestion(pending.step) : null;
}

export async function loadReadinessForDate(db: D1Database, userId: number, localDate: string): Promise<ReadinessRecord | null> {
  const row = await db.prepare(
    `SELECT sleep_minutes, sleep_quality, energy, pain, pain_details,
            has_new_swelling, has_instability, feels_unwell
     FROM readiness_checkins
     WHERE user_id = ? AND local_date = ? AND source = 'telegram'
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(userId, localDate).first<{
    sleep_minutes: number | null;
    sleep_quality: number | null;
    energy: number | null;
    pain: number | null;
    pain_details: string | null;
    has_new_swelling: number;
    has_instability: number;
    feels_unwell: number;
  }>();
  if (!row || row.sleep_minutes === null || row.sleep_quality === null || row.energy === null || row.pain === null) return null;
  return {
    sleepMinutes: row.sleep_minutes,
    sleepQuality: row.sleep_quality,
    energy: row.energy,
    pain: row.pain,
    painDetails: row.pain_details ?? undefined,
    hasNewSwelling: row.has_new_swelling === 1,
    hasInstability: row.has_instability === 1,
    feelsUnwell: row.feels_unwell === 1,
  };
}

export function compactReadiness(record: ReadinessRecord): string {
  const sleepHours = Math.round(record.sleepMinutes / 6) / 10;
  return [
    `сон ${sleepHours} ч`,
    `качество сна ${record.sleepQuality}/5`,
    `энергия ${record.energy}/5`,
    `боль ${record.pain}/10${record.painDetails ? ` (${record.painDetails})` : ""}`,
    record.hasNewSwelling ? "новый отёк" : null,
    record.hasInstability ? "нестабильность" : null,
    record.feelsUnwell ? "недомогание" : null,
  ].filter(Boolean).join(", ");
}

export async function answerReadinessConversation(
  db: D1Database,
  userId: number,
  text: string,
): Promise<ReadinessAnswerResult | null> {
  const pending = await loadPendingConversation(db, userId);
  if (!pending) return null;
  if (pending.step === 1) {
    const sleepMinutes = parseSleepMinutes(text);
    if (sleepMinutes === null) return { reply: `${invalidReadinessAnswer(1)}\n\n${readinessQuestion(1)}`, completed: false };
    await db.prepare("UPDATE readiness_conversations SET sleep_minutes = ?, step = 2, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(sleepMinutes, pending.id).run();
    return { reply: readinessQuestion(2), completed: false };
  }
  if (pending.step === 2) {
    const quality = parseReadinessScale(text);
    if (quality === null) return { reply: `${invalidReadinessAnswer(2)}\n\n${readinessQuestion(2)}`, completed: false };
    await db.prepare("UPDATE readiness_conversations SET sleep_quality = ?, step = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(quality, pending.id).run();
    return { reply: readinessQuestion(3), completed: false };
  }
  if (pending.step === 3) {
    const energy = parseReadinessScale(text);
    if (energy === null) return { reply: `${invalidReadinessAnswer(3)}\n\n${readinessQuestion(3)}`, completed: false };
    await db.prepare("UPDATE readiness_conversations SET energy = ?, step = 4, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(energy, pending.id).run();
    return { reply: readinessQuestion(4), completed: false };
  }
  if (pending.step === 4) {
    const pain = parseCurrentPain(text);
    if (!pain) return { reply: `${invalidReadinessAnswer(4)}\n\n${readinessQuestion(4)}`, completed: false };
    await db.prepare("UPDATE readiness_conversations SET pain = ?, pain_details = ?, step = 5, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(pain.level, pain.details ?? null, pending.id).run();
    return { reply: readinessQuestion(5), completed: false };
  }

  const flags = parseRedFlags(text);
  if (!flags) return { reply: `${invalidReadinessAnswer(5)}\n\n${readinessQuestion(5)}`, completed: false };
  if (pending.sleep_minutes === null || pending.sleep_quality === null || pending.energy === null || pending.pain === null) {
    throw new Error("Предтренировочный чекин повреждён: отсутствуют обязательные ответы");
  }
  const decision = evaluateReadiness({
    pain: pending.pain,
    hasNewSwelling: flags.hasNewSwelling,
    hasInstability: flags.hasInstability,
    feelsUnwell: flags.feelsUnwell,
  });
  await db.prepare(
    `INSERT INTO readiness_checkins(
       user_id, local_date, sleep_minutes, sleep_quality, energy, pain, pain_details,
       has_new_swelling, has_instability, feels_unwell, source, decision, reasons_json, completed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'telegram', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, local_date, source) DO UPDATE SET
       sleep_minutes = excluded.sleep_minutes, sleep_quality = excluded.sleep_quality,
       energy = excluded.energy, pain = excluded.pain, pain_details = excluded.pain_details,
       has_new_swelling = excluded.has_new_swelling, has_instability = excluded.has_instability,
       feels_unwell = excluded.feels_unwell, decision = excluded.decision,
       reasons_json = excluded.reasons_json, completed_at = CURRENT_TIMESTAMP`,
  ).bind(
    userId, pending.requested_date, pending.sleep_minutes, pending.sleep_quality, pending.energy,
    pending.pain, pending.pain_details, Number(flags.hasNewSwelling), Number(flags.hasInstability),
    Number(flags.feelsUnwell), decision.allowed ? "allowed" : "blocked", JSON.stringify(decision.reasons),
  ).run();
  await db.prepare(
    "UPDATE readiness_conversations SET status = 'completed', updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
  ).bind(pending.id).run();
  if (!decision.allowed) {
    return {
      reply: `Тренировку сегодня не составляю: ${decision.reasons.join(", ")}. При резком или необычном ухудшении состояния обратись за медицинской помощью.`,
      completed: true,
      allowed: false,
    };
  }
  return { reply: "Предтренировочный чекин сохранён.", completed: true, allowed: true };
}
