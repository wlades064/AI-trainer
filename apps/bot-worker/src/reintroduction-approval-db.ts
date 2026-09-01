import type { D1Database } from "./db.ts";

export interface ReintroductionApprovalOffer {
  checkinId: number;
  exerciseId: number;
  exerciseName: string;
}

interface OfferRow {
  checkin_id: number;
  exercise_id: number;
  exercise_name: string;
}

export async function findReintroductionApprovalOffer(
  db: D1Database,
  userId: number,
  checkinId: number,
): Promise<ReintroductionApprovalOffer | null> {
  const row = await db.prepare(`SELECT
      checkin.id AS checkin_id,
      exercise.id AS exercise_id,
      exercise.name AS exercise_name
    FROM post_workout_checkins checkin
    JOIN workout_sessions session ON session.id=checkin.session_id AND session.user_id=checkin.user_id
    JOIN workout_session_exercises occurrence ON occurrence.session_id=session.id
    JOIN exercises exercise ON exercise.id=occurrence.exercise_id
    JOIN user_exercise_settings settings
      ON settings.user_id=checkin.user_id AND settings.exercise_id=exercise.id
    LEFT JOIN exercise_reintroduction_plans plan
      ON plan.user_id=checkin.user_id AND plan.exercise_id=exercise.id
    WHERE checkin.id=? AND checkin.user_id=? AND checkin.status='completed'
      AND checkin.technique_stable=1
      AND COALESCE(json_extract(checkin.pain_json,'$.anyPain'),1)=0
      AND session.confirmed_at IS NOT NULL
      AND (settings.availability='paused' OR plan.status IN ('planned','testing','paused'))
      AND NOT EXISTS (
        SELECT 1
        FROM injury_episodes injury
        JOIN exercise_risk_tags risk ON risk.exercise_id=exercise.id
        JOIN json_each(CASE WHEN json_valid(injury.avoid_json) THEN injury.avoid_json ELSE '[]' END) avoided
          ON avoided.value=risk.risk_tag
        WHERE injury.user_id=checkin.user_id AND injury.status IN ('active','recovering')
      )
    ORDER BY occurrence.position
    LIMIT 1`).bind(checkinId, userId).first<OfferRow>();
  return row ? {
    checkinId: row.checkin_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
  } : null;
}

export function reintroductionApprovalText(offer: ReintroductionApprovalOffer): string {
  return `Тест «${offer.exerciseName}» завершён без боли, отёка, нестабильности и нарушений техники. Допустить упражнение в обычные тренировки?`;
}

export function reintroductionApprovalMarkup(offer: ReintroductionApprovalOffer): unknown {
  return {
    inline_keyboard: [[
      { text: "✅ Допустить", callback_data: `reintro:approve:${offer.checkinId}:${offer.exerciseId}` },
      { text: "⏸ Оставить на паузе", callback_data: `reintro:pause:${offer.checkinId}:${offer.exerciseId}` },
    ]],
  };
}

interface ApprovalAction {
  action: "approve" | "pause";
  checkinId: number;
  exerciseId: number;
}

function parseApprovalAction(data: string): ApprovalAction | null {
  const match = data.match(/^reintro:(approve|pause):(\d+):(\d+)$/);
  if (!match) return null;
  const checkinId = Number(match[2]);
  const exerciseId = Number(match[3]);
  if (!Number.isSafeInteger(checkinId) || checkinId <= 0 || !Number.isSafeInteger(exerciseId) || exerciseId <= 0) return null;
  return { action: match[1] as ApprovalAction["action"], checkinId, exerciseId };
}

export async function applyReintroductionApproval(
  db: D1Database,
  userId: number,
  callbackData: string,
): Promise<{ applied: boolean; notification: string }> {
  const action = parseApprovalAction(callbackData);
  if (!action) return { applied: false, notification: "Неизвестное действие." };
  const offer = await findReintroductionApprovalOffer(db, userId, action.checkinId);
  if (!offer || offer.exerciseId !== action.exerciseId) {
    return { applied: false, notification: "Предложение устарело или ограничения изменились." };
  }
  const status = action.action === "approve" ? "established" : "paused";
  await db.prepare(`UPDATE exercise_reintroduction_plans
    SET status=?,updated_at=CURRENT_TIMESTAMP
    WHERE user_id=? AND exercise_id=?`)
    .bind(status, userId, offer.exerciseId)
    .run();
  if (action.action === "approve") {
    await db.prepare(`UPDATE user_exercise_settings
      SET availability=CASE WHEN availability='paused' THEN 'active' ELSE availability END,updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND exercise_id=?`).bind(userId, offer.exerciseId).run();
    return { applied: true, notification: `«${offer.exerciseName}» допущено.` };
  }
  await db.prepare("UPDATE user_exercise_settings SET availability='paused',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND exercise_id=?")
    .bind(userId, offer.exerciseId).run();
  return { applied: true, notification: `«${offer.exerciseName}» оставлено на паузе.` };
}
