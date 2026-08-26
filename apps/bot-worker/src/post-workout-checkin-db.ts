import type { D1Database } from "./db.ts";
import {
  checkinQuestion,
  invalidAnswerMessage,
  parsePainAnswer,
  parseScaleAnswer,
  type PostWorkoutCheckinStep,
} from "./post-workout-checkin.ts";

interface PendingCheckinRow {
  id: number;
  session_id: number;
  step: PostWorkoutCheckinStep;
  session_effort: number | null;
  last_set_rir: number | null;
  pain_json: string | null;
}

export async function startPostWorkoutCheckin(db: D1Database, userId: number, sessionId: number): Promise<string> {
  await db.prepare(
    "UPDATE post_workout_checkins SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND status = 'pending' AND session_id <> ?",
  ).bind(userId, sessionId).run();
  await db.prepare(
    `INSERT INTO post_workout_checkins(user_id, session_id, step, status, expires_at)
     VALUES (?, ?, 1, 'pending', datetime('now', '+2 days'))
     ON CONFLICT(session_id) DO UPDATE SET
       step = 1,
       session_effort = NULL,
       last_set_rir = NULL,
       pain_json = NULL,
       wellbeing = NULL,
       status = 'pending',
       expires_at = datetime('now', '+2 days'),
       updated_at = CURRENT_TIMESTAMP,
       completed_at = NULL`,
  ).bind(userId, sessionId).run();
  return checkinQuestion(1);
}

async function loadPendingCheckin(db: D1Database, userId: number): Promise<PendingCheckinRow | null> {
  return db.prepare(
    `SELECT id, session_id, step, session_effort, last_set_rir, pain_json
     FROM post_workout_checkins
     WHERE user_id = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP
     ORDER BY updated_at DESC LIMIT 1`,
  ).bind(userId).first<PendingCheckinRow>();
}

export async function pendingPostWorkoutQuestion(db: D1Database, userId: number): Promise<string | null> {
  const pending = await loadPendingCheckin(db, userId);
  return pending ? checkinQuestion(pending.step) : null;
}

export async function cancelPostWorkoutCheckin(db: D1Database, userId: number): Promise<boolean> {
  const pending = await loadPendingCheckin(db, userId);
  if (!pending) return false;
  await db.prepare(
    "UPDATE post_workout_checkins SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
  ).bind(pending.id).run();
  return true;
}

export async function answerPostWorkoutCheckin(
  db: D1Database,
  userId: number,
  text: string,
): Promise<string | null> {
  const pending = await loadPendingCheckin(db, userId);
  if (!pending) return null;

  if (pending.step === 1) {
    const effort = parseScaleAnswer(text, 1, 10);
    if (effort === null) return `${invalidAnswerMessage(1)}\n\n${checkinQuestion(1)}`;
    await db.prepare(
      "UPDATE post_workout_checkins SET session_effort = ?, step = 2, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(effort, pending.id).run();
    return checkinQuestion(2);
  }

  if (pending.step === 2) {
    const rir = parseScaleAnswer(text, 0, 10);
    if (rir === null) return `${invalidAnswerMessage(2)}\n\n${checkinQuestion(2)}`;
    await db.prepare(
      "UPDATE post_workout_checkins SET last_set_rir = ?, step = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(rir, pending.id).run();
    return checkinQuestion(3);
  }

  if (pending.step === 3) {
    const pain = parsePainAnswer(text);
    if (!pain) return `${invalidAnswerMessage(3)}\n\n${checkinQuestion(3)}`;
    await db.prepare(
      "UPDATE post_workout_checkins SET pain_json = ?, step = 4, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(JSON.stringify(pain), pending.id).run();
    return checkinQuestion(4);
  }

  const wellbeing = parseScaleAnswer(text, 1, 5);
  if (wellbeing === null) return `${invalidAnswerMessage(4)}\n\n${checkinQuestion(4)}`;
  if (pending.session_effort === null || pending.last_set_rir === null || !pending.pain_json) {
    throw new Error("Чекин повреждён: отсутствуют обязательные ответы");
  }
  await db.prepare(
    `UPDATE workout_sessions SET
       session_effort = ?, last_set_rir = ?, pain_json = ?, post_workout_wellbeing = ?, recovery_checkin_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND confirmed_at IS NOT NULL`,
  ).bind(
    pending.session_effort,
    pending.last_set_rir,
    pending.pain_json,
    wellbeing,
    pending.session_id,
    userId,
  ).run();
  await db.prepare(
    `UPDATE post_workout_checkins SET wellbeing = ?, status = 'completed',
       updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`,
  ).bind(wellbeing, pending.id).run();
  const pain = JSON.parse(pending.pain_json) as { anyPain?: boolean };
  return [
    "Чекин сохранён и будет учтён в следующей тренировке:",
    `• тяжесть ${pending.session_effort}/10`,
    `• RIR ${pending.last_set_rir}`,
    `• боль: ${pain.anyPain ? "указана" : "нет"}`,
    `• самочувствие ${wellbeing}/5`,
  ].join("\n");
}
