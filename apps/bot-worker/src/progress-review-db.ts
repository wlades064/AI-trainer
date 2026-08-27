import type { D1Database } from "./db.ts";
import { addCalendarDays, type LocalDate, toIsoDate } from "./domain/schedule.ts";
import { formatProgressReview, type ReviewWindow } from "./progress-review.ts";

interface WorkoutRow { period: string; focus: string | null; count: number }
interface NutritionRow { period: string; days: number; calories: number | null; protein: number | null }
interface ReadinessRow { period: string; days: number; sleep: number | null; quality: number | null; energy: number | null; pain: number | null; blocked: number }
interface RecoveryRow { period: string; checkins: number; effort: number | null; wellbeing: number | null; pain_reports: number }
interface WeightRow { measured_at: string; value: number }

function emptyWindow(): ReviewWindow { return { workouts: 0, focusCounts: {}, nutritionDays: 0, caloriesKcal: null, proteinG: null, readinessDays: 0, sleepMinutes: null, sleepQuality: null, energy: null, readinessPain: null, blockedReadiness: 0, recoveryCheckins: 0, effort: null, wellbeing: null, painReports: 0 }; }
function rounded(value: number | null): number | null { return value === null ? null : Math.round(value * 10) / 10; }

export async function progressReview(db: D1Database, userId: number, today: LocalDate): Promise<string> {
  const currentEnd = toIsoDate(today);
  const currentStart = toIsoDate(addCalendarDays(today, -27));
  const previousEnd = toIsoDate(addCalendarDays(today, -28));
  const previousStart = toIsoDate(addCalendarDays(today, -55));
  const periodSql = "CASE WHEN local_date>=? THEN 'current' ELSE 'previous' END";
  const [workouts, nutrition, readiness, recovery, weights] = await Promise.all([
    db.prepare(`SELECT ${periodSql} AS period,focus,COUNT(*) AS count FROM workout_sessions WHERE user_id=? AND confirmed_at IS NOT NULL AND local_date BETWEEN ? AND ? GROUP BY period,focus`).bind(currentStart,userId,previousStart,currentEnd).all<WorkoutRow>(),
    db.prepare(`SELECT ${periodSql} AS period,COUNT(*) AS days,AVG(calories_kcal) AS calories,AVG(protein_g) AS protein FROM nutrition_days n WHERE user_id=? AND local_date BETWEEN ? AND ? AND id=(SELECT id FROM nutrition_days p WHERE p.user_id=n.user_id AND p.local_date=n.local_date ORDER BY CASE p.source WHEN 'fatsecret_user_export' THEN 1 WHEN 'fatsecret_screenshot' THEN 2 ELSE 3 END,p.imported_at DESC,p.id DESC LIMIT 1) GROUP BY period`).bind(currentStart,userId,previousStart,currentEnd).all<NutritionRow>(),
    db.prepare(`SELECT ${periodSql} AS period,COUNT(*) AS days,AVG(sleep_minutes) AS sleep,AVG(sleep_quality) AS quality,AVG(energy) AS energy,AVG(pain) AS pain,SUM(CASE WHEN decision='blocked' THEN 1 ELSE 0 END) AS blocked FROM readiness_checkins WHERE user_id=? AND completed_at IS NOT NULL AND local_date BETWEEN ? AND ? GROUP BY period`).bind(currentStart,userId,previousStart,currentEnd).all<ReadinessRow>(),
    db.prepare(`SELECT ${periodSql} AS period,COUNT(recovery_checkin_at) AS checkins,AVG(session_effort) AS effort,AVG(post_workout_wellbeing) AS wellbeing,SUM(CASE WHEN json_extract(pain_json,'$.anyPain')=1 THEN 1 ELSE 0 END) AS pain_reports FROM workout_sessions WHERE user_id=? AND confirmed_at IS NOT NULL AND local_date BETWEEN ? AND ? GROUP BY period`).bind(currentStart,userId,previousStart,currentEnd).all<RecoveryRow>(),
    db.prepare("SELECT measured_at,value FROM body_measurements WHERE user_id=? AND kind='weight' AND measured_at BETWEEN ? AND ? ORDER BY measured_at").bind(userId,previousStart,currentEnd).all<WeightRow>(),
  ]);
  const windows = { current: emptyWindow(), previous: emptyWindow() };
  for (const row of workouts.results ?? []) { const target=windows[row.period as keyof typeof windows]; if(!target)continue;target.workouts+=Number(row.count);if(row.focus)target.focusCounts[row.focus]=Number(row.count); }
  for (const row of nutrition.results ?? []) { const target=windows[row.period as keyof typeof windows];if(!target)continue;target.nutritionDays=Number(row.days);target.caloriesKcal=rounded(row.calories);target.proteinG=rounded(row.protein); }
  for (const row of readiness.results ?? []) { const target=windows[row.period as keyof typeof windows];if(!target)continue;target.readinessDays=Number(row.days);target.sleepMinutes=rounded(row.sleep);target.sleepQuality=rounded(row.quality);target.energy=rounded(row.energy);target.readinessPain=rounded(row.pain);target.blockedReadiness=Number(row.blocked??0); }
  for (const row of recovery.results ?? []) { const target=windows[row.period as keyof typeof windows];if(!target)continue;target.recoveryCheckins=Number(row.checkins);target.effort=rounded(row.effort);target.wellbeing=rounded(row.wellbeing);target.painReports=Number(row.pain_reports??0); }
  return formatProgressReview({currentStart,currentEnd,previousStart,previousEnd,current:windows.current,previous:windows.previous,weights:(weights.results??[]).map((row)=>({date:row.measured_at,value:row.value}))});
}
