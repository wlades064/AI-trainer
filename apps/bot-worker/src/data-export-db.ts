import type { D1Database } from "./db.ts";
import { buildPersonalDataExport, type PersonalDataExport } from "./data-export.ts";

interface ExportQuery {
  section: string;
  sql: string;
  userScoped?: boolean;
}

export const PERSONAL_EXPORT_QUERIES: readonly ExportQuery[] = [
  { section: "profile", sql: "SELECT id,telegram_user_id,timezone,created_at FROM users WHERE id=?" },
  { section: "goals", sql: "SELECT * FROM goal_periods WHERE user_id=? ORDER BY starts_on,id" },
  { section: "schedule_rules", sql: "SELECT * FROM schedule_rules WHERE user_id=? ORDER BY weekday" },
  { section: "schedule_exceptions", sql: "SELECT * FROM schedule_exceptions WHERE user_id=? ORDER BY local_date" },
  { section: "reminder_settings", sql: "SELECT * FROM reminder_settings WHERE user_id=? ORDER BY reminder_type" },
  { section: "reminder_deliveries", sql: "SELECT * FROM reminder_deliveries WHERE user_id=? ORDER BY local_date,id" },
  { section: "injuries", sql: "SELECT * FROM injury_episodes WHERE user_id=? ORDER BY starts_on,id" },
  { section: "exercise_reintroductions", sql: "SELECT * FROM exercise_reintroduction_plans WHERE user_id=? ORDER BY exercise_id" },
  { section: "readiness", sql: "SELECT * FROM readiness_checkins WHERE user_id=? ORDER BY local_date,id" },
  { section: "recovery_assessments", sql: "SELECT * FROM deload_assessments WHERE user_id=? ORDER BY assessed_on,id" },
  { section: "training_program_state", sql: "SELECT * FROM training_program_state WHERE user_id=?" },
  { section: "training_load_state", sql: "SELECT * FROM training_load_state WHERE user_id=?" },
  { section: "workout_plans", sql: "SELECT * FROM workout_plans WHERE user_id=? ORDER BY planned_for,id" },
  { section: "workout_plan_items", sql: "SELECT i.* FROM workout_plan_items i JOIN workout_plans p ON p.id=i.plan_id WHERE p.user_id=? ORDER BY p.planned_for,i.position" },
  { section: "workout_report_drafts", sql: "SELECT * FROM workout_report_drafts WHERE user_id=? ORDER BY created_at,id" },
  { section: "workout_sessions", sql: "SELECT * FROM workout_sessions WHERE user_id=? ORDER BY local_date,id" },
  { section: "workout_session_exercises", sql: "SELECT e.* FROM workout_session_exercises e JOIN workout_sessions s ON s.id=e.session_id WHERE s.user_id=? ORDER BY s.local_date,e.position" },
  { section: "set_logs", sql: "SELECT l.* FROM set_logs l JOIN workout_sessions s ON s.id=l.session_id WHERE s.user_id=? ORDER BY s.local_date,l.performed_order,l.id" },
  { section: "cardio_logs", sql: "SELECT c.* FROM cardio_logs c JOIN workout_sessions s ON s.id=c.session_id WHERE s.user_id=? ORDER BY s.local_date,c.position" },
  { section: "post_workout_checkins", sql: "SELECT * FROM post_workout_checkins WHERE user_id=? ORDER BY created_at,id" },
  { section: "nutrition_days", sql: "SELECT * FROM nutrition_days WHERE user_id=? ORDER BY local_date,id" },
  { section: "nutrition_image_imports", sql: "SELECT * FROM nutrition_import_drafts WHERE user_id=? ORDER BY created_at,id" },
  { section: "nutrition_csv_imports", sql: "SELECT * FROM nutrition_csv_drafts WHERE user_id=? ORDER BY created_at,id" },
  { section: "body_measurements", sql: "SELECT * FROM body_measurements WHERE user_id=? ORDER BY measured_at,kind,id" },
  { section: "supplements", sql: "SELECT * FROM supplements WHERE user_id=? ORDER BY starts_on,id" },
  { section: "lab_results", sql: "SELECT * FROM lab_results WHERE user_id=? ORDER BY collected_on,marker_name,id" },
  { section: "lab_image_imports", sql: "SELECT * FROM lab_import_drafts WHERE user_id=? ORDER BY created_at,id" },
  { section: "health_observations", sql: "SELECT * FROM health_observations WHERE user_id=? ORDER BY observed_start,id" },
  { section: "equipment", sql: "SELECT * FROM equipment_items WHERE user_id=? ORDER BY id" },
  { section: "exercise_settings", sql: "SELECT * FROM user_exercise_settings WHERE user_id=? ORDER BY exercise_id" },
  { section: "training_preferences", sql: "SELECT * FROM training_preferences WHERE user_id=? ORDER BY preference_key" },
  { section: "external_connections", sql: "SELECT id,user_id,provider,status,external_user_id,capabilities_json,updated_at FROM external_connections WHERE user_id=? ORDER BY provider" },
  { section: "sync_runs", sql: "SELECT r.* FROM sync_runs r JOIN external_connections c ON c.id=r.connection_id WHERE c.user_id=? ORDER BY r.started_at,r.id" },
  { section: "imported_documents", sql: "SELECT * FROM imported_documents WHERE user_id=? ORDER BY created_at,id" },
  { section: "imported_workout_lines", sql: "SELECT l.* FROM imported_workout_lines l JOIN imported_documents d ON d.id=l.imported_document_id WHERE d.user_id=? ORDER BY d.id,l.local_date,l.position" },
  { section: "imported_line_candidates", sql: "SELECT c.* FROM imported_line_candidates c JOIN imported_workout_lines l ON l.id=c.line_id JOIN imported_documents d ON d.id=l.imported_document_id WHERE d.user_id=? ORDER BY c.line_id,c.exercise_id" },
  { section: "ai_usage", sql: "SELECT * FROM ai_usage WHERE user_id=? ORDER BY created_at,id" },
  { section: "audit_log", sql: "SELECT * FROM audit_log WHERE user_id=? ORDER BY created_at,id" },
  { section: "exercises", sql: "SELECT * FROM exercises ORDER BY id", userScoped: false },
  { section: "exercise_aliases", sql: "SELECT * FROM exercise_aliases ORDER BY exercise_id,id", userScoped: false },
  { section: "exercise_risk_tags", sql: "SELECT * FROM exercise_risk_tags ORDER BY exercise_id,risk_tag", userScoped: false },
  { section: "exercise_equipment", sql: "SELECT e.* FROM exercise_equipment e JOIN equipment_items q ON q.id=e.equipment_id WHERE q.user_id=? ORDER BY e.exercise_id,e.equipment_id" },
] as const;

export async function loadPersonalDataExport(
  db: D1Database,
  userId: number,
  exportedAt: string,
  timezone: string,
): Promise<PersonalDataExport> {
  const prepared = PERSONAL_EXPORT_QUERIES.map(({ sql, userScoped = true }) => {
    const statement = db.prepare(sql);
    return userScoped ? statement.bind(userId) : statement;
  });
  const results = db.batch
    ? await db.batch<Record<string, unknown>>(prepared)
    : await Promise.all(prepared.map((statement) => statement.all<Record<string, unknown>>()));
  const entries = PERSONAL_EXPORT_QUERIES.map(({ section }, index) => [section, results[index]?.results ?? []] as const);
  return buildPersonalDataExport(exportedAt, timezone, Object.fromEntries(entries));
}
