import type { D1Database } from "./db.ts";
import type { TrainingLoadMode } from "./domain/programming.ts";
import { assessExerciseProgression, compactProgressionContext, formatProgressionSummary, type ExerciseProgressionAssessment } from "./exercise-progression.ts";

interface Row {
  session_id: number;
  local_date: string;
  focus: string;
  load_mode: TrainingLoadMode;
  last_set_rir: number | null;
  technique_stable: number | null;
  pain_json: string;
  occurrence_id: number;
  position: number;
  actual_exercise_name: string;
  planned_exercise_name: string | null;
  raw_text: string | null;
  target_sets: number | null;
  target_reps: string | null;
  reps: number | null;
  weight_kg: number | null;
  load_basis: string | null;
}

function painReported(raw: string): boolean {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.anyPain === true) return true;
    if (value.anyPain === false) return false;
    return Object.keys(value).length > 0;
  } catch { return true; }
}

function reportMetadata(raw: string | null, plannedName: string, actualName: string): {
  status: ExerciseProgressionAssessment["reportStatus"];
  replacementName: string | null;
} {
  try {
    const value = JSON.parse(raw ?? "") as { status?: unknown; substitutionName?: unknown };
    const status = ["completed", "partial", "skipped", "substituted"].includes(String(value.status))
      ? value.status as NonNullable<ExerciseProgressionAssessment["reportStatus"]>
      : null;
    const replacementName = status === "substituted"
      ? typeof value.substitutionName === "string" && value.substitutionName.trim()
        ? value.substitutionName.trim()
        : actualName !== plannedName ? actualName : null
      : null;
    return { status, replacementName };
  } catch {
    return {
      status: actualName !== plannedName ? "substituted" : null,
      replacementName: actualName !== plannedName ? actualName : null,
    };
  }
}

export async function loadExerciseProgression(db: D1Database, userId: number, focus?: string): Promise<ExerciseProgressionAssessment[]> {
  const focusClause = focus ? " AND session.focus=?" : "";
  const statement = db.prepare(`SELECT session.id session_id,session.local_date,session.focus,session.load_mode,
      session.last_set_rir,session.technique_stable,session.pain_json,
      occurrence.id occurrence_id,occurrence.position,exercise.name actual_exercise_name,
      planned_exercise.name planned_exercise_name,occurrence.raw_text,
      item.target_sets,item.target_reps,logs.reps,logs.weight_kg,logs.load_basis
    FROM workout_sessions session
    JOIN workout_session_exercises occurrence ON occurrence.session_id=session.id
    JOIN exercises exercise ON exercise.id=occurrence.exercise_id
    LEFT JOIN workout_plan_items item ON item.plan_id=session.plan_id
      AND item.position=occurrence.source_position
    LEFT JOIN exercises planned_exercise ON planned_exercise.id=item.exercise_id
    LEFT JOIN set_logs logs ON logs.session_exercise_id=occurrence.id AND logs.set_type='working'
    WHERE session.user_id=? AND session.confirmed_at IS NOT NULL${focusClause}
      AND session.focus IN('chest','back','legs')
      AND session.id=(SELECT latest.id FROM workout_sessions latest
        WHERE latest.user_id=session.user_id AND latest.focus=session.focus AND latest.confirmed_at IS NOT NULL
        ORDER BY latest.local_date DESC,latest.id DESC LIMIT 1)
    ORDER BY session.local_date DESC,session.focus,occurrence.position,logs.set_number`);
  const result = focus ? await statement.bind(userId, focus).all<Row>() : await statement.bind(userId).all<Row>();
  const groups = new Map<number, Row[]>();
  for (const row of result.results ?? []) { const rows = groups.get(row.occurrence_id) ?? []; rows.push(row); groups.set(row.occurrence_id, rows); }
  return [...groups.values()].map((rows) => {
    const first = rows[0];
    const working = rows.filter((row) => row.reps !== null);
    const plannedName = first.planned_exercise_name ?? first.actual_exercise_name;
    const metadata = reportMetadata(first.raw_text, plannedName, first.actual_exercise_name);
    return assessExerciseProgression({
      focus: first.focus,
      date: first.local_date,
      name: plannedName,
      targetSets: first.target_sets,
      targetReps: first.target_reps,
      actualSets: working.map((row) => ({ reps: Number(row.reps), weightKg: row.weight_kg, loadBasis: row.load_basis ?? "unknown" })),
      reportStatus: metadata.status,
      replacementName: metadata.replacementName,
      lastSetRir: first.last_set_rir,
      techniqueStable: first.technique_stable === null ? null : first.technique_stable === 1,
      painReported: painReported(first.pain_json),
      loadMode: first.load_mode,
    });
  });
}

export async function compactExerciseProgression(db: D1Database, userId: number, focus: string): Promise<{ assessments: ExerciseProgressionAssessment[]; context: string }> {
  const assessments = await loadExerciseProgression(db, userId, focus);
  return { assessments, context: compactProgressionContext(assessments) };
}

export async function exerciseProgressionSummary(db: D1Database, userId: number): Promise<string> {
  return formatProgressionSummary(await loadExerciseProgression(db, userId));
}
