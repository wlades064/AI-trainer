import type { D1Database } from "./db.ts";
import type { NutritionAggregateDraft } from "./nutrition-image.ts";

interface DraftRow { id: number; file_unique_id: string; parsed_json: string; status: "pending" | "confirmed" | "cancelled" | "expired" }

export async function findNutritionImage(db: D1Database, userId: number, fileUniqueId: string): Promise<DraftRow | null> {
  return db.prepare("SELECT id, file_unique_id, parsed_json, status FROM nutrition_import_drafts WHERE user_id = ? AND file_unique_id = ?")
    .bind(userId, fileUniqueId).first<DraftRow>();
}

export async function saveNutritionDraft(db: D1Database, userId: number, updateId: number, fileUniqueId: string, draft: NutritionAggregateDraft, model: string, inputTokens: number, outputTokens: number): Promise<void> {
  await db.prepare("UPDATE nutrition_import_drafts SET status = 'expired' WHERE user_id = ? AND status = 'pending'").bind(userId).run();
  await db.prepare(`INSERT INTO nutrition_import_drafts(user_id, source_update_id, file_unique_id, parsed_json, status, expires_at)
    VALUES (?, ?, ?, ?, 'pending', datetime('now', '+2 days'))`).bind(userId, updateId, fileUniqueId, JSON.stringify(draft)).run();
  await db.prepare(`INSERT INTO ai_usage(user_id, purpose, model_name, input_tokens, output_tokens, estimated_cost_usd)
    VALUES (?, 'nutrition_screenshot_parsing', ?, ?, ?, 0)`).bind(userId, model, inputTokens, outputTokens).run();
}

export async function loadPendingNutritionDraft(db: D1Database, userId: number): Promise<(DraftRow & { draft: NutritionAggregateDraft }) | null> {
  const row = await db.prepare(`SELECT id, file_unique_id, parsed_json, status FROM nutrition_import_drafts
    WHERE user_id = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`)
    .bind(userId).first<DraftRow>();
  return row ? { ...row, draft: JSON.parse(row.parsed_json) as NutritionAggregateDraft } : null;
}

export async function confirmNutritionDraft(db: D1Database, userId: number): Promise<NutritionAggregateDraft> {
  const row = await loadPendingNutritionDraft(db, userId);
  if (!row) throw new Error("Нет черновика КБЖУ");
  const d = row.draft;
  await db.prepare(`INSERT INTO nutrition_days(user_id, local_date, calories_kcal, protein_g, fat_g, carbohydrate_g, completeness, source, source_reference)
    VALUES (?, ?, ?, ?, ?, ?, 'aggregate_only', 'fatsecret_screenshot', ?)
    ON CONFLICT(user_id, local_date, source) DO UPDATE SET calories_kcal=excluded.calories_kcal, protein_g=excluded.protein_g,
      fat_g=excluded.fat_g, carbohydrate_g=excluded.carbohydrate_g, completeness='aggregate_only', source_reference=excluded.source_reference, imported_at=CURRENT_TIMESTAMP`)
    .bind(userId, d.date, d.caloriesKcal, d.proteinG, d.fatG, d.carbohydrateG, row.file_unique_id).run();
  await db.prepare("UPDATE nutrition_import_drafts SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
  return d;
}

export async function cancelNutritionDraft(db: D1Database, userId: number): Promise<boolean> {
  const row = await loadPendingNutritionDraft(db, userId); if (!row) return false;
  await db.prepare("UPDATE nutrition_import_drafts SET status = 'cancelled' WHERE id = ?").bind(row.id).run(); return true;
}
