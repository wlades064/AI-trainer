export type TransientFlowType =
  | "post_workout_checkin"
  | "readiness"
  | "nutrition"
  | "nutrition_csv"
  | "lab_image"
  | "measurement"
  | "recovery"
  | "illness"
  | "injury"
  | "reintroduction"
  | "exercise_catalog"
  | "exercise_add"
  | "schedule"
  | "reminder";

export interface ActiveTransientDialog {
  flowType: TransientFlowType;
  flowId: number;
  dialogKey: string;
}

export interface TransientDialogMessagePlan {
  incomingDialogKey?: string;
  outgoingDialogKey?: string;
  cleanupDialogKeys: string[];
}

const FREE_TEXT_ORDER: TransientFlowType[] = [
  "post_workout_checkin",
  "readiness",
  "illness",
  "measurement",
  "recovery",
  "injury",
  "reintroduction",
  "exercise_catalog",
  "exercise_add",
  "schedule",
  "reminder",
];

const CONFIRM_ORDER: TransientFlowType[] = ["nutrition", "nutrition_csv", "lab_image"];
const CANCEL_ORDER: TransientFlowType[] = [
  "post_workout_checkin",
  "readiness",
  ...CONFIRM_ORDER,
  "measurement",
  "recovery",
  "illness",
  "injury",
  "reintroduction",
  "exercise_catalog",
  "exercise_add",
  "schedule",
  "reminder",
];

function firstByOrder(dialogs: ActiveTransientDialog[], order: TransientFlowType[]): ActiveTransientDialog | undefined {
  for (const flowType of order) {
    const found = dialogs.find((dialog) => dialog.flowType === flowType);
    if (found) return found;
  }
  return undefined;
}

function directDataWrite(text: string): boolean {
  return /^\/(?:weight|goal|supplement(?:_stop)?|lab(?:_cancel)?)(?:@\w+)?\s+\S/i.test(text);
}

function permanentWorkoutCommand(text: string): boolean {
  return /^\/(?:today|tomorrow|confirm)(?:@\w+)?$/i.test(text);
}

export function planTransientDialogMessages(
  before: ActiveTransientDialog[],
  after: ActiveTransientDialog[],
  text: string,
  updateId: number,
): TransientDialogMessagePlan {
  const afterKeys = new Set(after.map((dialog) => dialog.dialogKey));
  const beforeKeys = new Set(before.map((dialog) => dialog.dialogKey));
  const cleanupDialogKeys = before
    .filter((dialog) => !afterKeys.has(dialog.dialogKey))
    .map((dialog) => dialog.dialogKey);
  const newlyStarted = after.filter((dialog) => !beforeKeys.has(dialog.dialogKey));

  if (directDataWrite(text) && newlyStarted.length === 0 && cleanupDialogKeys.length === 0) {
    const dialogKey = `direct:${updateId}`;
    return { incomingDialogKey: dialogKey, outgoingDialogKey: dialogKey, cleanupDialogKeys: [dialogKey] };
  }

  const beforeOrder = /^\/confirm(?:@\w+)?$/i.test(text)
    ? CONFIRM_ORDER
    : /^\/cancel(?:@\w+)?$/i.test(text)
      ? CANCEL_ORDER
      : FREE_TEXT_ORDER;
  const current = newlyStarted[0] ?? firstByOrder(before, beforeOrder);
  if (!current) return { cleanupDialogKeys };

  const completed = cleanupDialogKeys.includes(current.dialogKey);
  const keepIncoming = newlyStarted.length > 0 && before.length === 0 && permanentWorkoutCommand(text);
  const keepOutgoing = current.flowType === "readiness" && completed && !/^\/cancel(?:@\w+)?$/i.test(text);

  return {
    ...(keepIncoming ? {} : { incomingDialogKey: current.dialogKey }),
    ...(keepOutgoing ? {} : { outgoingDialogKey: current.dialogKey }),
    cleanupDialogKeys,
  };
}
