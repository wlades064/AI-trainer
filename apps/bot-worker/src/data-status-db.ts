import type { D1Database, D1PreparedStatement, D1Result } from "./db.ts";
import { formatDataStatus, type DataStatusSnapshot } from "./data-status.ts";

type Row = Record<string, unknown>;

function first(results: D1Result<Row>[], index: number): Row {
  return results[index]?.results?.[0] ?? {};
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

export async function loadDataStatus(db: D1Database, userId: number, today: string): Promise<DataStatusSnapshot> {
  const statements: D1PreparedStatement[] = [
    db.prepare("SELECT goal_type,description FROM goal_periods WHERE user_id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) ORDER BY starts_on DESC,id DESC LIMIT 1").bind(userId, today, today),
    db.prepare("SELECT MAX(local_date) latest_date,COUNT(*) count_28 FROM workout_sessions WHERE user_id=? AND confirmed_at IS NOT NULL AND local_date BETWEEN date(?,'-27 days') AND ?").bind(userId, today, today),
    db.prepare("SELECT MAX(local_date) latest_date,COUNT(DISTINCT CASE WHEN local_date>=date(?,'-6 days') THEN local_date END) count_7,COUNT(DISTINCT local_date) count_28 FROM nutrition_days WHERE user_id=? AND local_date BETWEEN date(?,'-27 days') AND ?").bind(today, userId, today, today),
    db.prepare("SELECT source FROM nutrition_days WHERE user_id=? AND local_date<=? ORDER BY local_date DESC,CASE source WHEN 'fatsecret_user_export' THEN 1 WHEN 'fatsecret_screenshot' THEN 2 ELSE 3 END,imported_at DESC,id DESC LIMIT 1").bind(userId, today),
    db.prepare("SELECT substr(measured_at,1,10) latest_date,value value_kg FROM body_measurements WHERE user_id=? AND kind='weight' AND substr(measured_at,1,10)<=? ORDER BY measured_at DESC,id DESC LIMIT 1").bind(userId, today),
    db.prepare("SELECT MAX(substr(measured_at,1,10)) latest_date FROM body_measurements WHERE user_id=? AND kind<>'weight' AND substr(measured_at,1,10)<=?").bind(userId, today),
    db.prepare("SELECT MAX(local_date) latest_date,COUNT(*) count_28 FROM readiness_checkins WHERE user_id=? AND completed_at IS NOT NULL AND local_date BETWEEN date(?,'-27 days') AND ?").bind(userId, today, today),
    db.prepare("SELECT SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active,SUM(CASE WHEN status='recovering' THEN 1 ELSE 0 END) recovering FROM injury_episodes WHERE user_id=? AND status IN('active','recovering')").bind(userId),
    db.prepare("SELECT COUNT(*) active FROM supplements WHERE user_id=? AND status='active' AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)").bind(userId, today, today),
    db.prepare("SELECT MAX(collected_on) latest_date,COUNT(*) active_count FROM lab_results WHERE user_id=? AND status='active' AND collected_on<=?").bind(userId, today),
    db.prepare("SELECT MAX(substr(COALESCE(observed_end,observed_start),1,10)) latest_date,COUNT(DISTINCT metric) metric_count FROM health_observations WHERE user_id=? AND substr(observed_start,1,10)<=?").bind(userId, today),
    db.prepare("SELECT COUNT(*) active FROM external_connections WHERE user_id=? AND status IN('active','connected')").bind(userId),
  ];
  const results = db.batch
    ? await db.batch<Row>(statements)
    : await Promise.all(statements.map((statement) => statement.all<Row>()));
  const goal = first(results, 0);
  const workouts = first(results, 1);
  const nutrition = first(results, 2);
  const nutritionLatest = first(results, 3);
  const weight = first(results, 4);
  const measurements = first(results, 5);
  const readiness = first(results, 6);
  const injuries = first(results, 7);
  const supplements = first(results, 8);
  const labs = first(results, 9);
  const wearable = first(results, 10);
  const connections = first(results, 11);
  return {
    today,
    goal: text(goal.goal_type) ? { type: text(goal.goal_type)!, description: text(goal.description) } : null,
    workouts: { latestDate: text(workouts.latest_date), count28: number(workouts.count_28) },
    nutrition: { latestDate: text(nutrition.latest_date), count7: number(nutrition.count_7), count28: number(nutrition.count_28), source: text(nutritionLatest.source) },
    weight: { latestDate: text(weight.latest_date), valueKg: weight.value_kg === null || weight.value_kg === undefined ? null : number(weight.value_kg) },
    measurements: { latestDate: text(measurements.latest_date) },
    readiness: { latestDate: text(readiness.latest_date), count28: number(readiness.count_28) },
    injuries: { active: number(injuries.active), recovering: number(injuries.recovering) },
    activeSupplements: number(supplements.active),
    labs: { latestDate: text(labs.latest_date), activeCount: number(labs.active_count) },
    wearable: { latestDate: text(wearable.latest_date), metricCount: number(wearable.metric_count) },
    activeConnections: number(connections.active),
  };
}

export async function dataStatus(db: D1Database, userId: number, today: string): Promise<string> {
  return formatDataStatus(await loadDataStatus(db, userId, today));
}
