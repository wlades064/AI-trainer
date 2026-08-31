import type { D1Database } from "./db.ts";
import { forgetTransientDialogs, loadTransientMessagesForCleanup } from "./transient-dialog-db.ts";

export async function cleanupTransientDialogs(
  db: D1Database,
  userId: number,
  dialogKeys: string[],
  deleteMessages: (chatId: number, messageIds: number[]) => Promise<void>,
): Promise<number> {
  const uniqueKeys = [...new Set(dialogKeys)];
  if (!uniqueKeys.length) return 0;
  const messages = await loadTransientMessagesForCleanup(db, userId, uniqueKeys);
  const byChat = new Map<number, number[]>();
  for (const message of messages) {
    const messageIds = byChat.get(message.chatId) ?? [];
    messageIds.push(message.messageId);
    byChat.set(message.chatId, messageIds);
  }
  for (const [chatId, messageIds] of byChat) await deleteMessages(chatId, messageIds);
  await forgetTransientDialogs(db, userId, uniqueKeys);
  return messages.length;
}
