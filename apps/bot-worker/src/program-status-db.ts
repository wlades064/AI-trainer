import { loadSchedule, type D1Database } from "./db.ts";
import { addCalendarDays, toIsoDate, trainingForDate, type LocalDate, type TrainingFocus as ScheduleFocus } from "./domain/schedule.ts";
import type { TrainingEmphasis } from "./domain/programming.ts";
import { completedHardWeeks } from "./training-load.ts";
import { formatProgramStatus, type ProgramCycleStatus, type ProgramFocus, type ProgramStatusSnapshot } from "./program-status.ts";

interface StateRow { focus: ProgramFocus; next_emphasis: TrainingEmphasis }
interface SessionRow { focus: ProgramFocus; local_date: string; emphasis: TrainingEmphasis | null }
interface LoadRow { current_block_started_on: string; completed_hard_weeks: number; last_deload_ended_on: string | null; deload_until: string | null }
interface RecoveryRow { assessed_on: string; recommendation: ProgramStatusSnapshot["latestRecovery"] extends infer R ? R extends { decision: infer D } ? D : never : never }
interface ExceptionRow { local_date: string; focus: ScheduleFocus }

function local(date: string): LocalDate {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export async function loadProgramStatus(db: D1Database, userId: number, today: string): Promise<ProgramStatusSnapshot> {
  const load = await db.prepare("SELECT current_block_started_on,completed_hard_weeks,last_deload_ended_on,deload_until FROM training_load_state WHERE user_id=?")
    .bind(userId).first<LoadRow>();
  const end = toIsoDate(addCalendarDays(local(today), 27));
  const [states, sessions, exceptions, recovery, schedule, hardSessions] = await Promise.all([
    db.prepare("SELECT focus,next_emphasis FROM training_program_state WHERE user_id=? ORDER BY focus").bind(userId).all<StateRow>(),
    db.prepare(`SELECT focus,local_date,emphasis FROM workout_sessions s
      WHERE user_id=? AND confirmed_at IS NOT NULL AND focus IN('chest','back','legs')
        AND id=(SELECT x.id FROM workout_sessions x WHERE x.user_id=s.user_id AND x.focus=s.focus AND x.confirmed_at IS NOT NULL ORDER BY x.local_date DESC,x.id DESC LIMIT 1)
      ORDER BY focus`).bind(userId).all<SessionRow>(),
    db.prepare("SELECT local_date,focus FROM schedule_exceptions WHERE user_id=? AND local_date BETWEEN ? AND ? ORDER BY local_date").bind(userId, today, end).all<ExceptionRow>(),
    db.prepare("SELECT assessed_on,recommendation FROM deload_assessments WHERE user_id=? ORDER BY assessed_on DESC,id DESC LIMIT 1").bind(userId).first<RecoveryRow>(),
    loadSchedule(db, userId),
    load ? db.prepare("SELECT local_date FROM workout_sessions WHERE user_id=? AND confirmed_at IS NOT NULL AND load_mode='normal' AND local_date>=? AND local_date<? ORDER BY local_date").bind(userId, load.current_block_started_on, today).all<{ local_date: string }>() : Promise.resolve({ results: [] }),
  ]);
  const stateByFocus = new Map((states.results ?? []).map((row) => [row.focus, row.next_emphasis]));
  const sessionByFocus = new Map((sessions.results ?? []).map((row) => [row.focus, row]));
  const cycles: ProgramCycleStatus[] = (["chest", "back", "legs"] as const).map((focus) => ({
    focus,
    nextEmphasis: stateByFocus.get(focus) ?? null,
    lastCompletedDate: sessionByFocus.get(focus)?.local_date ?? null,
    lastCompletedEmphasis: sessionByFocus.get(focus)?.emphasis ?? null,
  }));
  const overrideByDate = new Map((exceptions.results ?? []).map((row) => [row.local_date, row.focus]));
  let nextTraining: ProgramStatusSnapshot["nextTraining"] = null;
  for (let offset = 0; offset < 28; offset += 1) {
    const date = addCalendarDays(local(today), offset);
    const iso = toIsoDate(date);
    const planned = trainingForDate(date, schedule, overrideByDate.get(iso));
    if (planned.focus !== "rest") { nextTraining = { date: iso, focus: planned.focus }; break; }
  }
  const computedWeeks = load ? completedHardWeeks((hardSessions.results ?? []).map((row) => row.local_date), today) : 0;
  return {
    today,
    nextTraining,
    cycles,
    load: {
      blockStartedOn: load?.current_block_started_on ?? null,
      completedHardWeeks: computedWeeks,
      deloadUntil: load?.deload_until ?? null,
      lastDeloadEndedOn: load?.last_deload_ended_on ?? null,
    },
    latestRecovery: recovery ? { date: recovery.assessed_on, decision: recovery.recommendation } : null,
  };
}

export async function programStatus(db: D1Database, userId: number, today: string): Promise<string> {
  return formatProgramStatus(await loadProgramStatus(db, userId, today));
}
