import type { D1Database } from "./db.ts";
import { GOAL_LABELS, type GoalType } from "./goal.ts";
import { compactSupplements } from "./supplements-db.ts";

interface GoalRow { id: number; goal_type: GoalType; description: string | null; starts_on: string }

export async function loadCurrentGoal(db: D1Database, userId: number): Promise<GoalRow | null> {
  return db.prepare(`SELECT id, goal_type, description, starts_on FROM goal_periods
    WHERE user_id=? AND ends_on IS NULL ORDER BY starts_on DESC, id DESC LIMIT 1`).bind(userId).first<GoalRow>();
}

export async function setCurrentGoal(db: D1Database, userId: number, goalType: GoalType, localDate: string): Promise<void> {
  const current = await loadCurrentGoal(db, userId);
  if (current?.starts_on === localDate) {
    await db.prepare("UPDATE goal_periods SET goal_type=?, description=? WHERE id=?")
      .bind(goalType, GOAL_LABELS[goalType], current.id).run(); return;
  }
  await db.prepare("UPDATE goal_periods SET ends_on=date(?,'-1 day') WHERE user_id=? AND ends_on IS NULL")
    .bind(localDate, userId).run();
  await db.prepare("INSERT INTO goal_periods(user_id,goal_type,description,starts_on) VALUES (?,?,?,?)")
    .bind(userId, goalType, GOAL_LABELS[goalType], localDate).run();
}

export async function loadCompactCoachingContext(db: D1Database, userId: number): Promise<string> {
  const supplements = await compactSupplements(db, userId);
  const goal = await loadCurrentGoal(db, userId);
  const nutrition = await db.prepare(`SELECT calories_kcal,protein_g,fat_g,carbohydrate_g FROM nutrition_days
    WHERE user_id=? AND calories_kcal IS NOT NULL ORDER BY local_date DESC LIMIT 7`).bind(userId)
    .all<{calories_kcal:number;protein_g:number|null;fat_g:number|null;carbohydrate_g:number|null}>();
  const weights = await db.prepare(`SELECT measured_at,value FROM body_measurements
    WHERE user_id=? AND kind='weight' ORDER BY measured_at DESC LIMIT 2`).bind(userId).all<{measured_at:string;value:number}>();
  const lines=[`цель: ${goal ? GOAL_LABELS[goal.goal_type] : "не задана"}`];
  const days=nutrition.results??[];
  if(days.length){
    const avg=(key:"calories_kcal"|"protein_g"|"fat_g"|"carbohydrate_g")=>Math.round(days.reduce((s,d)=>s+(d[key]??0),0)/days.length);
    lines.push(`питание (${days.length} дн.): среднее ${avg("calories_kcal")} ккал, Б ${avg("protein_g")} г, Ж ${avg("fat_g")} г, У ${avg("carbohydrate_g")} г`);
  } else lines.push("питание: подтверждённых итогов пока нет");
  const weight=weights.results??[];
  if(weight.length) lines.push(`вес: ${weight[0].value} кг${weight[1] ? `, изменение к предыдущему замеру ${Math.round((weight[0].value-weight[1].value)*10)/10} кг` : ""}`);
  else lines.push("вес: данных пока нет");
  lines.push(`активные добавки: ${supplements}`);
  return lines.join("; ");
}
