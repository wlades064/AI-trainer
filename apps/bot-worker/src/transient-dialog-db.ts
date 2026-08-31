import type { D1Database } from "./db.ts";
import type { ActiveTransientDialog, TransientFlowType } from "./transient-dialog.ts";

interface ActiveDialogRow {
  flow_type: TransientFlowType;
  flow_id: number;
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
  const rows = await db.prepare(`
    SELECT flow_type, flow_id FROM (
      SELECT 'post_workout_checkin' AS flow_type, id AS flow_id, 10 AS priority
        FROM post_workout_checkins WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'readiness', id, 20
        FROM readiness_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'nutrition', id, 30
        FROM nutrition_import_drafts WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'nutrition_csv', id, 40
        FROM nutrition_csv_drafts WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'lab_image', id, 50
        FROM lab_import_drafts WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'measurement', id, 60
        FROM measurement_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'recovery', id, 70
        FROM recovery_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'illness', id, 80
        FROM illness_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'injury', id, 90
        FROM injury_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'reintroduction', id, 100
        FROM reintroduction_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'exercise_catalog', id, 110
        FROM exercise_catalog_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'exercise_add', id, 120
        FROM exercise_add_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'schedule', id, 130
        FROM schedule_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
      UNION ALL SELECT 'reminder', id, 140
        FROM reminder_conversations WHERE user_id=? AND status='pending' AND expires_at>CURRENT_TIMESTAMP
    ) ORDER BY priority, flow_id DESC
  `).bind(...Array.from({ length: 14 }, () => userId)).all<ActiveDialogRow>();
  return (rows.results ?? []).map((row) => ({
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
