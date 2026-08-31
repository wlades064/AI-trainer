import type { D1Database } from "./db.ts";

interface PendingRecoveryRow {
  id: number;
}

async function pendingRecovery(db: D1Database, userId: number): Promise<PendingRecoveryRow | null> {
  return db.prepare(
    `SELECT id FROM recovery_conversations
     WHERE user_id = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP
     ORDER BY updated_at DESC LIMIT 1`,
  ).bind(userId).first<PendingRecoveryRow>();
}

export async function cancelRecovery(db: D1Database, userId: number): Promise<boolean> {
  const pending = await pendingRecovery(db, userId);
  if (!pending) return false;
  await db.prepare(
    "UPDATE recovery_conversations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(pending.id).run();
  return true;
}
