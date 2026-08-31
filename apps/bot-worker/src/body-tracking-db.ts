import type { D1Database } from "./db.ts";
import { formatDelta, LEGACY_MEASUREMENT_KINDS, measurementQuestion, MEASUREMENT_KINDS, nutritionTrendWindows, parseCentimeters, type MeasurementStep, type NutritionTrendDay } from "./body-tracking.ts";

interface ConversationRow { id: number; step: MeasurementStep; values_json: string }

async function pendingConversation(db: D1Database, userId: number): Promise<ConversationRow | null> {
  return db.prepare(`SELECT id, step, values_json FROM measurement_conversations
    WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP ORDER BY updated_at DESC LIMIT 1`)
    .bind(userId).first<ConversationRow>();
}

export async function startMeasurementConversation(db: D1Database, userId: number): Promise<string> {
  const pending = await pendingConversation(db, userId); if (pending) return measurementQuestion(pending.step);
  await db.prepare(`INSERT INTO measurement_conversations(user_id, step, values_json, status, expires_at)
    VALUES (?,1,'{}','pending',datetime('now','+2 days'))`).bind(userId).run();
  return `${measurementQuestion(1)}\nИзмеряй каждый раз в одинаковых условиях и в одной и той же точке.`;
}

export async function cancelMeasurementConversation(db: D1Database, userId: number): Promise<boolean> {
  const row = await pendingConversation(db, userId); if (!row) return false;
  await db.prepare("UPDATE measurement_conversations SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run(); return true;
}

export async function answerMeasurementConversation(db: D1Database, userId: number, text: string, localDate: string): Promise<string | null> {
  const row = await pendingConversation(db, userId); if (!row) return null;
  const value = parseCentimeters(text);
  if (value === null) return `Нужно число от 20 до 250 см, максимум с одним знаком после запятой.\n\n${measurementQuestion(row.step)}`;
  const values = JSON.parse(row.values_json) as Record<string, number>;
  const [kind] = MEASUREMENT_KINDS[row.step - 1]; values[kind] = value;
  if (row.step < MEASUREMENT_KINDS.length) {
    const next = (row.step + 1) as MeasurementStep;
    await db.prepare("UPDATE measurement_conversations SET step=?, values_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(next, JSON.stringify(values), row.id).run();
    return measurementQuestion(next);
  }
  for (const [measurementKind] of MEASUREMENT_KINDS) {
    await db.prepare(`INSERT INTO body_measurements(user_id, measured_at, kind, value, unit, source)
      VALUES (?, ?, ?, ?, 'cm', 'telegram_manual')
      ON CONFLICT(user_id, measured_at, kind, source) DO UPDATE SET value=excluded.value`)
      .bind(userId, localDate, measurementKind, values[measurementKind]).run();
  }
  await db.prepare("UPDATE measurement_conversations SET values_json=?, status='completed', updated_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(JSON.stringify(values), row.id).run();
  return ["Замеры сохранены:", ...MEASUREMENT_KINDS.map(([key, label]) => `• ${label}: ${values[key]} см`)].join("\n");
}

export async function saveEmergencyWeight(db: D1Database, userId: number, localDate: string, weightKg: number): Promise<void> {
  await db.prepare(`INSERT INTO body_measurements(user_id, measured_at, kind, value, unit, source)
    VALUES (?, ?, 'weight', ?, 'kg', 'telegram_emergency')
    ON CONFLICT(user_id, measured_at, kind, source) DO UPDATE SET value=excluded.value`)
    .bind(userId, localDate, weightKg).run();
}

interface MeasurementRow { measured_at: string; kind: string; value: number; unit: string }
export async function progressSummary(db: D1Database, userId: number, localDate: string): Promise<string> {
  const measurements = await db.prepare(`SELECT measured_at, kind, value, unit FROM body_measurements
    WHERE user_id=? ORDER BY measured_at DESC LIMIT 80`).bind(userId).all<MeasurementRow>();
  const nutrition = await db.prepare(`SELECT local_date, calories_kcal, protein_g, fat_g, carbohydrate_g FROM nutrition_days n
    WHERE user_id=? AND local_date>=date(?,'-13 days') AND local_date<=? AND id=(SELECT id FROM nutrition_days p WHERE p.user_id=n.user_id AND p.local_date=n.local_date ORDER BY CASE p.source WHEN 'fatsecret_user_export' THEN 1 WHEN 'fatsecret_screenshot' THEN 2 ELSE 3 END,p.imported_at DESC,p.id DESC LIMIT 1) ORDER BY local_date DESC`).bind(userId,localDate,localDate).all<NutritionTrendDay>();
  const workouts = await db.prepare(`SELECT focus,COUNT(*) AS count FROM workout_sessions
    WHERE user_id=? AND confirmed_at IS NOT NULL AND local_date>=date(?,'-27 days') AND local_date<=? GROUP BY focus`).bind(userId,localDate,localDate).all<{focus:string|null;count:number}>();
  const byKind = new Map<string, MeasurementRow[]>();
  for (const item of measurements.results ?? []) { const list=byKind.get(item.kind)??[]; list.push(item); byKind.set(item.kind,list); }
  const lines: string[] = ["Динамика:"];
  const labels = new Map([...MEASUREMENT_KINDS, ...LEGACY_MEASUREMENT_KINDS, ["weight", "вес"]] as Array<readonly [string,string]>);
  for (const [kind, label] of labels) {
    const list=byKind.get(kind); if (!list?.length) continue;
    const current=list[0]; const previous=list[1];
    lines.push(`• ${label}: ${current.value} ${current.unit}${previous ? ` (${formatDelta(current.value, previous.value)} к предыдущему замеру)` : ""}`);
  }
  const trend=nutritionTrendWindows(nutrition.results??[],localDate);
  if(trend.recent.days){
    const recent=trend.recent;
    lines.push(`• питание за 7 дней (${recent.days} записей): ${recent.caloriesKcal??"—"} ккал; Б ${recent.proteinG??"—"}, Ж ${recent.fatG??"—"}, У ${recent.carbohydrateG??"—"} г в среднем`);
    if(trend.previous.days&&recent.caloriesKcal!==null&&trend.previous.caloriesKcal!==null){
      const proteinDelta=recent.proteinG!==null&&trend.previous.proteinG!==null?`; белок ${formatDelta(recent.proteinG,trend.previous.proteinG)} г`:"";
      lines.push(`  к предыдущим 7 дням (${trend.previous.days} записей): калории ${formatDelta(recent.caloriesKcal,trend.previous.caloriesKcal)} ккал${proteinDelta}`);
    }
  } else lines.push("• питание: за последние 7 дней подтверждённых итогов нет");
  const workoutRows=workouts.results??[];const total=workoutRows.reduce((sum,row)=>sum+row.count,0);const focusLabels:Record<string,string>={chest:"грудь",back:"спина",legs:"ноги",rest:"восстановление"};
  const breakdown=workoutRows.filter((row)=>row.focus).map((row)=>`${focusLabels[row.focus??""]??row.focus}: ${row.count}`).join(", ");
  lines.push(`• подтверждённых тренировок за 28 дней: ${total}${breakdown?` (${breakdown})`:""}`);
  return lines.join("\n");
}
