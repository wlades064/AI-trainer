import type { D1Database } from "./db.ts";
import { measurementHistory, startMeasurementConversation } from "./body-tracking-db.ts";
import { cancelIllnessConversation } from "./illness-db.ts";

export interface MeasurementMenuResult {
  kind: "input" | "history";
  reply: string;
}

export async function runMeasurementMenuAction(
  db: D1Database,
  userId: number,
  callbackData: string,
): Promise<MeasurementMenuResult | null> {
  if (callbackData === "measure:history") {
    return { kind: "history", reply: await measurementHistory(db, userId) };
  }
  if (callbackData === "measure:new") {
    await cancelIllnessConversation(db, userId);
    return { kind: "input", reply: await startMeasurementConversation(db, userId) };
  }
  return null;
}
