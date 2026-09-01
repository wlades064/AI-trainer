import { DEFAULT_SCHEDULE, type ScheduleRule } from "./domain/schedule.ts";
import type { ActiveRestriction, ExerciseCandidate } from "./domain/safety.ts";
import type { GeneratedWorkout } from "./gemini.ts";
import type { TrainingEmphasis, TrainingFocus, TrainingLoadMode } from "./domain/programming.ts";

export interface D1Result<T> { results?: T[] }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch?<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface UserRecord { id: number; telegram_user_id: string; timezone: string }

export async function claimTelegramUpdate(db: D1Database, updateId: number): Promise<boolean> {
  const claimed = await db.prepare(
    `INSERT INTO telegram_updates(update_id, status)
     VALUES (?, 'processing')
     ON CONFLICT(update_id) DO UPDATE SET
       status = 'processing',
       received_at = CURRENT_TIMESTAMP,
       completed_at = NULL,
       error = NULL
     WHERE telegram_updates.status = 'failed'
     RETURNING update_id`,
  ).bind(updateId).first<{ update_id: number }>();
  return claimed !== null;
}

export async function completeTelegramUpdate(db: D1Database, updateId: number): Promise<void> {
  await db.prepare(
    "UPDATE telegram_updates SET status = 'completed', completed_at = CURRENT_TIMESTAMP, error = NULL WHERE update_id = ?",
  ).bind(updateId).run();
}

export async function failTelegramUpdate(db: D1Database, updateId: number, error: string): Promise<void> {
  await db.prepare(
    "UPDATE telegram_updates SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error = ? WHERE update_id = ?",
  ).bind(error.slice(0, 500), updateId).run();
}

export async function ensureUser(db: D1Database, telegramUserId: string, timezone: string): Promise<UserRecord> {
  await db.prepare("INSERT OR IGNORE INTO users (telegram_user_id, timezone) VALUES (?, ?)")
    .bind(telegramUserId, timezone)
    .run();
  const user = await db.prepare("SELECT id, telegram_user_id, timezone FROM users WHERE telegram_user_id = ?")
    .bind(telegramUserId)
    .first<UserRecord>();
  if (!user) throw new Error("Не удалось создать профиль пользователя");

  for (const rule of DEFAULT_SCHEDULE) {
    await db.prepare("INSERT OR IGNORE INTO schedule_rules (user_id, weekday, focus) VALUES (?, ?, ?)")
      .bind(user.id, rule.weekday, rule.focus)
      .run();
  }
  return user;
}

export async function loadSchedule(db: D1Database, userId: number): Promise<ScheduleRule[]> {
  const result = await db.prepare("SELECT weekday, focus FROM schedule_rules WHERE user_id = ? AND active = 1 ORDER BY weekday")
    .bind(userId)
    .all<ScheduleRule>();
  return result.results?.length ? result.results : DEFAULT_SCHEDULE;
}

export async function loadNextTrainingEmphasis(
  db: D1Database,
  userId: number,
  focus: TrainingFocus,
): Promise<TrainingEmphasis | null> {
  const row = await db.prepare(
    "SELECT next_emphasis FROM training_program_state WHERE user_id = ? AND focus = ?",
  ).bind(userId, focus).first<{ next_emphasis: TrainingEmphasis }>();
  return row?.next_emphasis ?? null;
}

interface ExerciseRow {
  id: number;
  name: string;
  risk_tag: string | null;
  workout_role: "main" | "accessory" | "either";
  priority: number;
  reintroduction_status: "testing" | "established" | null;
  load_policy: string | null;
  availability: "active" | "rare";
}

const GROUPS_BY_FOCUS = {
  chest: ["chest", "middle_delts", "triceps"],
  back: ["back", "traps", "rear_delts", "biceps"],
  legs: ["legs", "quadriceps", "hamstrings", "posterior_chain", "calves", "glutes", "adductors", "middle_delts"],
} as const;

export async function loadExerciseCandidates(
  db: D1Database,
  userId: number,
  focus: keyof typeof GROUPS_BY_FOCUS,
): Promise<ExerciseCandidate[]> {
  const groups = GROUPS_BY_FOCUS[focus];
  const placeholders = groups.map(() => "?").join(", ");
  const result = await db.prepare(
    `SELECT exercise.id, exercise.name, risk.risk_tag, settings.workout_role, settings.priority, settings.availability,
            reintroduction.status AS reintroduction_status, reintroduction.load_policy
     FROM user_exercise_settings settings
     JOIN exercises exercise ON exercise.id = settings.exercise_id
     LEFT JOIN exercise_risk_tags risk ON risk.exercise_id = exercise.id
     LEFT JOIN exercise_reintroduction_plans reintroduction
       ON reintroduction.user_id = settings.user_id AND reintroduction.exercise_id = exercise.id
     WHERE settings.user_id = ?
       AND settings.availability IN ('active', 'rare')
       AND exercise.active = 1
       AND exercise.muscle_group IN (${placeholders})
       AND (reintroduction.status IS NULL OR reintroduction.status IN ('testing', 'established'))
     ORDER BY settings.priority DESC, exercise.name`,
  ).bind(userId, ...groups).all<ExerciseRow>();

  const candidates = new Map<number, ExerciseCandidate>();
  for (const row of result.results ?? []) {
    const candidate = candidates.get(row.id) ?? {
      id: row.id,
      name: row.name,
      riskTags: [],
      workoutRole: row.workout_role,
      priority: row.priority,
      availability: row.availability,
      ...(row.reintroduction_status ? {
        reintroductionStatus: row.reintroduction_status,
        reintroductionLoadPolicy: row.load_policy ?? undefined,
      } : {}),
    };
    if (row.risk_tag && !candidate.riskTags.includes(row.risk_tag)) candidate.riskTags.push(row.risk_tag);
    candidates.set(row.id, candidate);
  }
  return [...candidates.values()];
}

interface InjuryRow { body_area: string; avoid_json: string; description: string | null }

export async function loadActiveRestrictions(db: D1Database, userId: number): Promise<ActiveRestriction[]> {
  const result = await db.prepare(
    "SELECT body_area, avoid_json, description FROM injury_episodes WHERE user_id = ? AND status IN ('active', 'recovering') ORDER BY updated_at DESC",
  ).bind(userId).all<InjuryRow>();
  return (result.results ?? []).map((row) => {
    let avoidTags: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row.avoid_json);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) avoidTags = parsed;
    } catch {
      avoidTags = [];
    }
    return { bodyArea: row.body_area, avoidTags, description: row.description ?? undefined };
  });
}

interface HistoryRow {
  local_date: string;
  name: string;
  raw_text: string | null;
  session_effort: number | null;
  last_set_rir: number | null;
  pain_json: string;
  post_workout_wellbeing: number | null;
}

function compactRecovery(row: HistoryRow): string | null {
  const parts: string[] = [];
  if (row.session_effort !== null) parts.push(`тяжесть ${row.session_effort}/10`);
  if (row.last_set_rir !== null) parts.push(`RIR ${row.last_set_rir}`);
  if (row.post_workout_wellbeing !== null) parts.push(`самочувствие ${row.post_workout_wellbeing}/5`);
  try {
    const pain = JSON.parse(row.pain_json) as { reported?: boolean; anyPain?: boolean; details?: string };
    if (pain.reported) parts.push(pain.anyPain ? `боль: ${pain.details || "указана"}` : "боль: нет");
  } catch {
    // Старые записи могут иметь другой формат боли; не расходуем контекст на ненадёжные данные.
  }
  return parts.length ? `чекин: ${parts.join(", ")}` : null;
}

export async function loadRecentSummary(db: D1Database, userId: number, focus: string): Promise<string> {
  const result = await db.prepare(
    `SELECT session.local_date, exercise.name, occurrence.raw_text,
            session.session_effort, session.last_set_rir, session.pain_json, session.post_workout_wellbeing
     FROM workout_sessions session
     JOIN workout_session_exercises occurrence ON occurrence.session_id = session.id
     JOIN exercises exercise ON exercise.id = occurrence.exercise_id
     WHERE session.user_id = ? AND session.focus = ? AND session.confirmed_at IS NOT NULL
     ORDER BY session.local_date DESC, occurrence.position
     LIMIT 24`,
  ).bind(userId, focus).all<HistoryRow>();
  const dates: string[] = [];
  const byDate = new Map<string, string[]>();
  const recoveryByDate = new Map<string, string>();
  for (const row of result.results ?? []) {
    if (!byDate.has(row.local_date)) {
      if (dates.length >= 2) continue;
      dates.push(row.local_date);
      byDate.set(row.local_date, []);
      const recovery = compactRecovery(row);
      if (recovery) recoveryByDate.set(row.local_date, recovery);
    }
    const detail = (row.raw_text ?? row.name).replace(/\s+/g, " ").slice(0, 180);
    byDate.get(row.local_date)?.push(detail);
  }
  return dates.map((date) => {
    const details = byDate.get(date)?.join("; ");
    const recovery = recoveryByDate.get(date);
    return `${date}: ${details}${recovery ? `; ${recovery}` : ""}`;
  }).join("\n");
}

interface ExistingPlanRow { generated_json: string | null }

export async function loadExistingGeneratedPlan(
  db: D1Database,
  userId: number,
  plannedFor: string,
  focus: string,
  freshSince: string,
  loadMode?: TrainingLoadMode,
): Promise<GeneratedWorkout | null> {
  const loadModeClause = loadMode ? "AND load_mode = ?" : "";
  const statement = db.prepare(
    `SELECT generated_json FROM workout_plans
     WHERE user_id = ? AND planned_for = ? AND focus = ?
       AND created_at >= ? ${loadModeClause}
       AND status IN ('sent', 'accepted') AND generated_json IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
  );
  const row = await (loadMode
    ? statement.bind(userId, plannedFor, focus, freshSince, loadMode)
    : statement.bind(userId, plannedFor, focus, freshSince)).first<ExistingPlanRow>();
  if (!row?.generated_json) return null;
  try {
    return JSON.parse(row.generated_json) as GeneratedWorkout;
  } catch {
    return null;
  }
}

export async function saveGeneratedPlan(
  db: D1Database,
  userId: number,
  plannedFor: string,
  focus: string,
  emphasis: TrainingEmphasis,
  loadMode: TrainingLoadMode,
  model: string,
  workout: GeneratedWorkout,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const plan = await db.prepare(
    `INSERT INTO workout_plans(user_id, planned_for, focus, emphasis, load_mode, status, source, model_name, generated_json, programming_rationale_json)
     VALUES (?, ?, ?, ?, ?, 'sent', 'gemini', ?, ?, ?) RETURNING id`,
  ).bind(
    userId,
    plannedFor,
    focus,
    emphasis,
    loadMode,
    model,
    JSON.stringify(workout),
    JSON.stringify(workout.programmingRationale),
  ).first<{ id: number }>();
  if (!plan) throw new Error("Не удалось сохранить сгенерированную тренировку");
  for (let index = 0; index < workout.exercises.length; index += 1) {
    const item = workout.exercises[index];
    const exercise = await db.prepare("SELECT id FROM exercises WHERE name = ?").bind(item.name).first<{ id: number }>();
    if (!exercise) throw new Error(`Упражнение отсутствует в БД: ${item.name}`);
    await db.prepare(
      `INSERT INTO workout_plan_items(plan_id, exercise_id, position, target_sets, target_reps, rest_seconds, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      plan.id,
      exercise.id,
      index + 1,
      item.sets,
      item.reps,
      item.restSeconds,
      `${item.weightGuidance}. ${item.notes}`.trim(),
    ).run();
  }
  await db.prepare(
    "INSERT INTO ai_usage(user_id, purpose, model_name, input_tokens, output_tokens, estimated_cost_usd) VALUES (?, 'workout_generation', ?, ?, ?, 0)",
  ).bind(userId, model, inputTokens, outputTokens).run();
}
