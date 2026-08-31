import type { D1Database } from "./db.ts";
import type { TransientDialogMessagePlan } from "./transient-dialog.ts";
import { cleanupTransientDialogs } from "./transient-dialog-cleanup.ts";
import { recordTransientMessage } from "./transient-dialog-db.ts";

interface DeliveryInput {
  db: D1Database;
  userId: number;
  chatId: number;
  incomingMessageId: number;
  reply: string;
  replyMarkup?: unknown;
  plan: TransientDialogMessagePlan;
  sendMessage: (text: string, replyMarkup?: unknown) => Promise<number>;
  deleteMessages: (chatId: number, messageIds: number[]) => Promise<void>;
  onCleanupFailure: (error: unknown) => Promise<void>;
}

async function safelyReportFailure(handler: (error: unknown) => Promise<void>, error: unknown): Promise<void> {
  try {
    await handler(error);
  } catch {
    // Cleanup telemetry must never replace the successfully saved user interaction with another failure.
  }
}

export async function deliverReplyWithTransientCleanup(input: DeliveryInput): Promise<number> {
  let trackingReady = true;
  if (input.plan.incomingDialogKey) {
    try {
      await recordTransientMessage(
        input.db,
        input.userId,
        input.chatId,
        input.incomingMessageId,
        input.plan.incomingDialogKey,
        "incoming",
      );
    } catch (error) {
      trackingReady = false;
      await safelyReportFailure(input.onCleanupFailure, error);
    }
  }

  const outgoingMessageId = await input.sendMessage(input.reply, input.replyMarkup);
  if (input.plan.outgoingDialogKey) {
    try {
      await recordTransientMessage(
        input.db,
        input.userId,
        input.chatId,
        outgoingMessageId,
        input.plan.outgoingDialogKey,
        "outgoing",
      );
    } catch (error) {
      trackingReady = false;
      await safelyReportFailure(input.onCleanupFailure, error);
    }
  }

  if (trackingReady && input.plan.cleanupDialogKeys.length) {
    try {
      await cleanupTransientDialogs(input.db, input.userId, input.plan.cleanupDialogKeys, input.deleteMessages);
    } catch (error) {
      await safelyReportFailure(input.onCleanupFailure, error);
    }
  }
  return outgoingMessageId;
}
