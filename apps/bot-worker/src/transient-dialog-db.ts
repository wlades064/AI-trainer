import type { D1Database } from "./db.ts";
import type { ActiveTransientDialog, TransientFlowType } from "./transient-dialog.ts";

interface ActiveDialogRow {
  flow_type: TransientFlowType;
  flow_id: number;
  priority: number;
}

interface TransientMessageRow {
  chat_id: number;
  message_id: number;
  dialog_key: string;
}

export interface TransientMessageForCleanup {
  chatId: number;
  messageId: number;
  dialogKey: string;
}

export async function findTelegramUserId(db: D1Database, telegramUserId: string): Promise<number | null> {
  const row = await db.prepare("SELECT id FROM users WHERE telegram_user_id=?")
    .bind(telegramUserId).first<{ id: number }>();
  return row?.id ?? null;
}

export async function loadActiveTransientDialogs(
  db: D1Database,
  userId: number,
): Promise<ActiveTransientDialog[]> {
  const flows = [
    ["weight", "weight_conversations"],
    ["post_workout_checkin", "post_workout_checkins"],
    ["readiness", "readiness_conversations"],
    ["nutrition", "nutrition_import_drafts"],
    ["nutrition_csv", "nutrition_csv_drafts"],
    ["lab_image", "lab_import_drafts"],
    ["measurement", "measurement_conversations"],
    ["recovery", "recovery_conversations"],
    ["illness", "illness_conversations"],
    ["injury", "injury_conversations"],
    ["reintroduction", "reintroduction_conversations"],
    ["exercise_catalog", "exercise_catalog_conversations"],
    ["exercise_add", "exercise_add_conversations"],
    ["schedule", "schedule_conversations"],
    ["reminder", "reminder_conversations"],
  ] as const;
  // Production D1 rejects a single compound SELECT over all fourteen flows.
  // Only fixed internal identifiers are interpolated; owner values stay bound.
  const statements = [];
  for (let offset = 0; offset < flows.length; offset += 4) {
    const group = flows.slice(offset, offset + 4);
    const sql = group.map(([flow, table], index) =>
      `SELECT '${flow}' AS flow_type, id AS flow_id, ${offset + index} AS priority
       FROM ${table} WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP`
    ).join(" UNION ALL ");
    statements.push(db.prepare(sql).bind(...group.map(() => userId)));
  }
  const results = db.batch
    ? await db.batch<ActiveDialogRow>(statements)
    : await Promise.all(statements.map((statement) => statement.all<ActiveDialogRow>()));
  const rows = results.flatMap((result) => result.results ?? []);
  rows.sort((a, b) => a.priority - b.priority || b.flow_id - a.flow_id);
  return rows.map((row) => ({
    flowType: row.flow_type,
    flowId: row.flow_id,
    dialogKey: `${row.flow_type}:${row.flow_id}`,
  }));
}

export async function recordTransientMessage(
  db: D1Database,
  userId: number,
  chatId: number,
  messageId: number,
  dialogKey: string,
  direction: "incoming" | "outgoing",
): Promise<void> {
  await db.prepare(`INSERT INTO transient_dialog_messages(
      user_id,chat_id,message_id,dialog_key,direction
    ) VALUES(?,?,?,?,?)
    ON CONFLICT(chat_id,message_id) DO UPDATE SET
      user_id=excluded.user_id, dialog_key=excluded.dialog_key, direction=excluded.direction`)
    .bind(userId, chatId, messageId, dialogKey, direction).run();
}

export async function loadTransientMessagesForCleanup(
  db: D1Database,
  userId: number,
  dialogKeys: string[],
): Promise<TransientMessageForCleanup[]> {
  const uniqueKeys = [...new Set(dialogKeys)];
  if (!uniqueKeys.length) return [];
  const placeholders = uniqueKeys.map(() => "?").join(",");
  const rows = await db.prepare(`SELECT chat_id,message_id,dialog_key
    FROM transient_dialog_messages
    WHERE user_id=? AND dialog_key IN (${placeholders})
      AND created_at>datetime('now','-48 hours')
    ORDER BY chat_id,message_id`)
    .bind(userId, ...uniqueKeys).all<TransientMessageRow>();
  return (rows.results ?? []).map((row) => ({
    chatId: row.chat_id,
    messageId: row.message_id,
    dialogKey: row.dialog_key,
  }));
}

export async function loadOrphanedTransientDialogKeys(
  db: D1Database,
  userId: number,
  activeDialogKeys: string[],
): Promise<string[]> {
  const active = new Set(activeDialogKeys);
  const rows = await db.prepare(`SELECT dialog_key
    FROM transient_dialog_messages
    WHERE user_id=?
    GROUP BY dialog_key
    ORDER BY MIN(id)`)
    .bind(userId).all<{ dialog_key: string }>();
  return (rows.results ?? []).map((row) => row.dialog_key).filter((dialogKey) => !active.has(dialogKey));
}

export async function forgetTransientDialogs(
  db: D1Database,
  userId: number,
  dialogKeys: string[],
): Promise<void> {
  const uniqueKeys = [...new Set(dialogKeys)];
  if (!uniqueKeys.length) return;
  const placeholders = uniqueKeys.map(() => "?").join(",");
  await db.prepare(`DELETE FROM transient_dialog_messages
    WHERE user_id=? AND dialog_key IN (${placeholders})`)
    .bind(userId, ...uniqueKeys).run();
}
