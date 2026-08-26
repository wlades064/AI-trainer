import type { D1Database } from "./db.ts";
import type { GeneratedWorkout } from "./gemini.ts";
import { nextEmphasis, type TrainingEmphasis, type TrainingFocus } from "./domain/programming.ts";
import { reportConfirmationBlockers, type WorkoutReportDraft } from "./workout-report.ts";

export interface ReportPlan {
  id: number;
  plannedFor: string;
  focus: TrainingFocus;
  emphasis: TrainingEmphasis | null;
  loadMode: "normal" | "deload";
  workout: GeneratedWorkout;
}

interface PlanRow {
  id: number;
  planned_for: string;
  focus: TrainingFocus;
  emphasis: TrainingEmphasis | null;
  load_mode: "normal" | "deload";
  generated_json: string;
}

export interface PendingReportDraft {
  id: number;
  planId: number;
  report: WorkoutReportDraft;
}

export async function loadReportPlan(db: D1Database, userId: number, localDate: string): Promise<ReportPlan | null> {
  const row = await db.prepare(
    `SELECT id, planned_for, focus, emphasis, load_mode, generated_json
     FROM workout_plans
     WHERE user_id = ? AND planned_for = ? AND status IN ('sent', 'accepted') AND generated_json IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(userId, localDate).first<PlanRow>();
  if (!row) return null;
  return {
    id: row.id,
    plannedFor: row.planned_for,
    focus: row.focus,
    emphasis: row.emphasis,
    loadMode: row.load_mode,
    workout: JSON.parse(row.generated_json) as GeneratedWorkout,
  };
}

export async function loadCatalogExerciseNames(db: D1Database): Promise<string[]> {
  const result = await db.prepare("SELECT name FROM exercises WHERE active = 1 ORDER BY name").all<{ name: string }>();
  return (result.results ?? []).map(({ name }) => name);
}

export async function saveReportDraft(
  db: D1Database,
  userId: number,
  planId: number,
  sourceUpdateId: number,
  rawText: string,
  report: WorkoutReportDraft,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  await db.prepare(
    "UPDATE workout_report_drafts SET status = 'expired' WHERE user_id = ? AND status = 'pending'",
  ).bind(userId).run();
  const row = await db.prepare(
    `INSERT INTO workout_report_drafts(user_id, plan_id, source_update_id, raw_text, parsed_json, status, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', datetime('now', '+2 days')) RETURNING id`,
  ).bind(userId, planId, sourceUpdateId, rawText, JSON.stringify(report)).first<{ id: number }>();
  if (!row) throw new Error("Не удалось сохранить черновик тренировки");
  if (inputTokens > 0 || outputTokens > 0) {
    await db.prepare(
      `INSERT INTO ai_usage(user_id, purpose, model_name, input_tokens, output_tokens, estimated_cost_usd)
       VALUES (?, 'workout_report_parsing', ?, ?, ?, 0)`,
    ).bind(userId, model, inputTokens, outputTokens).run();
  }
  return row.id;
}

export async function loadPendingReportDraft(db: D1Database, userId: number): Promise<PendingReportDraft | null> {
  const row = await db.prepare(
    `SELECT id, plan_id, parsed_json FROM workout_report_drafts
     WHERE user_id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(userId).first<{ id: number; plan_id: number; parsed_json: string }>();
  if (!row) return null;
  return { id: row.id, planId: row.plan_id, report: JSON.parse(row.parsed_json) as WorkoutReportDraft };
}

export async function cancelPendingReportDraft(db: D1Database, userId: number): Promise<boolean> {
  const pending = await loadPendingReportDraft(db, userId);
  if (!pending) return false;
  await db.prepare(
    "UPDATE workout_report_drafts SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'",
  ).bind(pending.id, userId).run();
  return true;
}

async function planForConfirmation(db: D1Database, userId: number, planId: number): Promise<ReportPlan> {
  const row = await db.prepare(
    `SELECT id, planned_for, focus, emphasis, load_mode, generated_json
     FROM workout_plans WHERE id = ? AND user_id = ?`,
  ).bind(planId, userId).first<PlanRow>();
  if (!row) throw new Error("План тренировки не найден");
  return {
    id: row.id,
    plannedFor: row.planned_for,
    focus: row.focus,
    emphasis: row.emphasis,
    loadMode: row.load_mode,
    workout: JSON.parse(row.generated_json) as GeneratedWorkout,
  };
}

export async function confirmPendingReportDraft(db: D1Database, userId: number): Promise<{ date: string; sessionId: number }> {
  const draft = await loadPendingReportDraft(db, userId);
  if (!draft) throw new Error("Нет ожидающего подтверждения черновика");
  const blockers = reportConfirmationBlockers(draft.report);
  if (blockers.length) throw new Error(`Сначала нужно уточнить: ${blockers.join("; ")}`);
  const plan = await planForConfirmation(db, userId, draft.planId);
  const now = new Date().toISOString();
  const sourceRef = `telegram-report-draft:${draft.id}`;
  const painJson = JSON.stringify(Object.fromEntries(draft.report.pain.map(({ area, level, notes }) => [area, { level, notes }])));
  const notes = JSON.stringify({ energy: draft.report.energy, overallNotes: draft.report.overallNotes });
  await db.prepare(
    `INSERT OR IGNORE INTO workout_sessions(
       user_id, plan_id, completed_at, local_date, focus, emphasis, load_mode,
       source_kind, source_ref, pain_json, notes, confirmed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'telegram', ?, ?, ?, NULL)`,
  ).bind(
    userId, plan.id, now, draft.report.date, plan.focus, plan.emphasis, plan.loadMode,
    sourceRef, painJson, notes,
  ).run();
  const session = await db.prepare(
    "SELECT id FROM workout_sessions WHERE user_id = ? AND local_date = ? AND source_kind = 'telegram' AND source_ref = ?",
  ).bind(userId, draft.report.date, sourceRef).first<{ id: number }>();
  if (!session) throw new Error("Не удалось создать выполненную тренировку");
  await db.prepare("UPDATE workout_sessions SET confirmed_at = NULL WHERE id = ?").bind(session.id).run();

  for (let index = 0; index < draft.report.exercises.length; index += 1) {
    const item = draft.report.exercises[index];
    const actualName = item.status === "substituted" ? item.substitutionName : item.name;
    if (!actualName) throw new Error(`Не указана замена для ${item.name}`);
    const exercise = await db.prepare("SELECT id FROM exercises WHERE name = ?").bind(actualName).first<{ id: number }>();
    if (!exercise) throw new Error(`Упражнение отсутствует в каталоге: ${actualName}`);
    await db.prepare(
      `INSERT INTO workout_session_exercises(
         session_id, exercise_id, position, source_position, raw_text, match_confidence, match_status, notes
       ) VALUES (?, ?, ?, ?, ?, 1, 'owner_reviewed', ?)
       ON CONFLICT(session_id, position) DO UPDATE SET
         exercise_id = excluded.exercise_id,
         raw_text = excluded.raw_text,
         match_confidence = 1,
         match_status = 'owner_reviewed',
         notes = excluded.notes`,
    ).bind(
      session.id, exercise.id, index + 1, index + 1,
      JSON.stringify(item), `${item.status}. ${item.notes}`.trim(),
    ).run();
    const occurrence = await db.prepare(
      "SELECT id FROM workout_session_exercises WHERE session_id = ? AND position = ?",
    ).bind(session.id, index + 1).first<{ id: number }>();
    if (!occurrence) throw new Error(`Не удалось сохранить упражнение: ${actualName}`);
    for (let setIndex = 0; setIndex < item.sets.length; setIndex += 1) {
      const set = item.sets[setIndex];
      await db.prepare(
        `INSERT INTO set_logs(
           session_id, exercise_id, session_exercise_id, set_number, reps, weight_kg,
           set_type, load_basis, performed_order, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_exercise_id, set_number) WHERE session_exercise_id IS NOT NULL DO UPDATE SET
           reps = excluded.reps,
           weight_kg = excluded.weight_kg,
           set_type = excluded.set_type,
           load_basis = excluded.load_basis,
           performed_order = excluded.performed_order,
           notes = excluded.notes`,
      ).bind(
        session.id, exercise.id, occurrence.id, setIndex + 1, set.reps, set.weightKg ?? null,
        set.setType, set.loadBasis, setIndex + 1, set.notes,
      ).run();
    }
  }
  for (let index = 0; index < draft.report.cardio.length; index += 1) {
    const cardio = draft.report.cardio[index];
    await db.prepare(
      `INSERT INTO cardio_logs(session_id, position, activity, duration_minutes, speed_value, incline_value, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, position) DO UPDATE SET
         activity = excluded.activity,
         duration_minutes = excluded.duration_minutes,
         speed_value = excluded.speed_value,
         incline_value = excluded.incline_value,
         notes = excluded.notes`,
    ).bind(
      session.id, index + 1, cardio.activity, cardio.durationMinutes ?? null,
      cardio.speedValue ?? null, cardio.inclineValue ?? null, cardio.notes,
    ).run();
  }
  await db.prepare(
    "UPDATE workout_sessions SET completed_at = ?, confirmed_at = ? WHERE id = ?",
  ).bind(now, now, session.id).run();
  await db.prepare("UPDATE workout_plans SET status = 'completed' WHERE id = ?").bind(plan.id).run();
  await db.prepare(
    "UPDATE workout_report_drafts SET status = 'confirmed', confirmed_at = ? WHERE id = ? AND status = 'pending'",
  ).bind(now, draft.id).run();
  if (plan.emphasis) {
    const upcoming = nextEmphasis(plan.focus, plan.emphasis, plan.emphasis);
    await db.prepare(
      `INSERT INTO training_program_state(user_id, focus, next_emphasis, last_completed_session_id, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, focus) DO UPDATE SET
         next_emphasis = excluded.next_emphasis,
         last_completed_session_id = excluded.last_completed_session_id,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(userId, plan.focus, upcoming, session.id).run();
  }
  return { date: draft.report.date, sessionId: session.id };
}
