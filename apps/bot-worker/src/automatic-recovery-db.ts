import type { D1Database } from "./db.ts";
import type { ReadinessRecord } from "./pre-workout-readiness-db.ts";
import { performanceDeclineCount } from "./strength-analytics-db.ts";
import { sundayOfWeek } from "./training-load.ts";
import {
  type AutomaticRecoveryInput,
  type RecentRecoveryCheckin,
} from "./automatic-recovery.ts";
import type { GeminiRecoveryDecision } from "./gemini.ts";

interface TrainingLoadStateRow {
  completed_hard_weeks: number;
}

interface RecoveryCheckinRow {
  session_effort: number | null;
  last_set_rir: number | null;
  pain_json: string;
  post_workout_wellbeing: number | null;
  technique_stable: number | null;
}

function painReported(raw: string): boolean {
  try {
    const value = JSON.parse(raw) as { anyPain?: unknown; reported?: unknown };
    return value.anyPain === true || (value.reported === true && value.anyPain !== false);
  } catch {
    return true;
  }
}

function toCheckin(row: RecoveryCheckinRow): RecentRecoveryCheckin {
  return {
    effort: row.session_effort,
    rir: row.last_set_rir,
    wellbeing: row.post_workout_wellbeing,
    painReported: painReported(row.pain_json),
    techniqueStable: row.technique_stable === null ? null : row.technique_stable === 1,
  };
}

const databaseRecommendation = {
  normal: "normal",
  reduced: "monitor",
  deload: "deload",
} as const;

export async function loadAutomaticRecoveryInput(
  db: D1Database,
  userId: number,
  localDate: string,
  readiness: ReadinessRecord,
  illnessActive: boolean,
  postIllnessPhase: 1 | 2 | null,
  scheduledDeloadActive = false,
): Promise<AutomaticRecoveryInput> {
  const state = await db.prepare(
    "SELECT completed_hard_weeks FROM training_load_state WHERE user_id = ?",
  ).bind(userId).first<TrainingLoadStateRow>();
  const checkins = await db.prepare(
    `SELECT session_effort, last_set_rir, pain_json, post_workout_wellbeing, technique_stable
     FROM workout_sessions
     WHERE user_id = ? AND local_date < ? AND confirmed_at IS NOT NULL
       AND recovery_checkin_at IS NOT NULL
     ORDER BY local_date DESC, id DESC
     LIMIT 2`,
  ).bind(userId, localDate).all<RecoveryCheckinRow>();
  const declines = await performanceDeclineCount(db, userId, localDate);
  const completedHardWeeks = state?.completed_hard_weeks ?? 0;
  const recentCheckins = (checkins.results ?? []).map(toCheckin);
  return {
    readiness,
    illnessActive,
    postIllnessPhase,
    scheduledDeloadActive,
    completedHardWeeks,
    consecutivePerformanceDeclines: declines,
    recentCheckins,
  };
}

function recoveryTrigger(
  input: AutomaticRecoveryInput,
  decision: GeminiRecoveryDecision["decision"],
): "none" | "reactive" | "planned" {
  if (decision === "normal") return "none";
  if (decision === "deload" && (input.scheduledDeloadActive || input.completedHardWeeks >= 6)) return "planned";
  return "reactive";
}

export async function recordAutomaticRecoveryAssessment(
  db: D1Database,
  userId: number,
  localDate: string,
  input: AutomaticRecoveryInput,
  recovery: GeminiRecoveryDecision,
): Promise<void> {
  const trigger = recoveryTrigger(input, recovery.decision);
  await db.prepare(
    `INSERT INTO deload_assessments(
       user_id, assessed_on, completed_hard_weeks, consecutive_performance_declines,
       fatigue, sleep_quality, motivation, worsening_joint_pain, new_swelling,
       joint_instability, recommendation, trigger_kind, reasons_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, assessed_on) DO UPDATE SET
       completed_hard_weeks = excluded.completed_hard_weeks,
       consecutive_performance_declines = excluded.consecutive_performance_declines,
       fatigue = excluded.fatigue,
       sleep_quality = excluded.sleep_quality,
       motivation = excluded.motivation,
       worsening_joint_pain = excluded.worsening_joint_pain,
       new_swelling = excluded.new_swelling,
       joint_instability = excluded.joint_instability,
       recommendation = excluded.recommendation,
       trigger_kind = excluded.trigger_kind,
       reasons_json = excluded.reasons_json`,
  ).bind(
    userId,
    localDate,
    input.completedHardWeeks,
    input.consecutivePerformanceDeclines,
    null,
    input.readiness.sleepQuality,
    null,
    0,
    Number(input.readiness.hasNewSwelling),
    Number(input.readiness.hasInstability),
    databaseRecommendation[recovery.decision],
    trigger,
    JSON.stringify(recovery.reasons),
  ).run();

  if (recovery.decision === "deload") {
    await db.prepare(
      "UPDATE training_load_state SET deload_until = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
    ).bind(sundayOfWeek(localDate), userId).run();
  }
}
