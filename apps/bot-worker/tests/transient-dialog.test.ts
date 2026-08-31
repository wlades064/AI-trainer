import test from "node:test";
import assert from "node:assert/strict";
import {
  planTransientDialogMessages,
  type ActiveTransientDialog,
} from "../src/transient-dialog.ts";

const dialog = (flowType: ActiveTransientDialog["flowType"], flowId: number): ActiveTransientDialog => ({
  flowType,
  flowId,
  dialogKey: `${flowType}:${flowId}`,
});

test("a measurement answer remains transient and completion cleans the whole dialog", () => {
  const measurement = dialog("measurement", 7);
  const ongoing = planTransientDialogMessages([measurement], [measurement], "91", 100);
  assert.equal(ongoing.incomingDialogKey, measurement.dialogKey);
  assert.equal(ongoing.outgoingDialogKey, measurement.dialogKey);
  assert.deepEqual(ongoing.cleanupDialogKeys, []);

  const completed = planTransientDialogMessages([measurement], [], "38", 101);
  assert.equal(completed.incomingDialogKey, measurement.dialogKey);
  assert.equal(completed.outgoingDialogKey, measurement.dialogKey);
  assert.deepEqual(completed.cleanupDialogKeys, [measurement.dialogKey]);
});

test("finishing readiness cleans checkin messages but keeps the workout or safety warning", () => {
  const readiness = dialog("readiness", 8);

  const completed = planTransientDialogMessages([readiness], [], "нет", 102);

  assert.equal(completed.incomingDialogKey, readiness.dialogKey);
  assert.equal(completed.outgoingDialogKey, undefined);
  assert.deepEqual(completed.cleanupDialogKeys, [readiness.dialogKey]);
});

test("cancel removes the final cancellation reply as part of the transient dialog", () => {
  const readiness = dialog("readiness", 8);

  const cancelled = planTransientDialogMessages([readiness], [], "/cancel", 103);

  assert.equal(cancelled.incomingDialogKey, readiness.dialogKey);
  assert.equal(cancelled.outgoingDialogKey, readiness.dialogKey);
  assert.deepEqual(cancelled.cleanupDialogKeys, [readiness.dialogKey]);
});

test("today and workout confirmation stay while their checkin prompts are transient", () => {
  const readiness = dialog("readiness", 9);
  const postWorkout = dialog("post_workout_checkin", 10);

  const today = planTransientDialogMessages([], [readiness], "/today", 104);
  assert.equal(today.incomingDialogKey, undefined);
  assert.equal(today.outgoingDialogKey, readiness.dialogKey);

  const confirm = planTransientDialogMessages([], [postWorkout], "/confirm", 105);
  assert.equal(confirm.incomingDialogKey, undefined);
  assert.equal(confirm.outgoingDialogKey, postWorkout.dialogKey);

  const repeatedToday = planTransientDialogMessages([readiness], [readiness], "/today", 110);
  assert.equal(repeatedToday.incomingDialogKey, undefined);
  assert.equal(repeatedToday.outgoingDialogKey, readiness.dialogKey);
});

test("direct data writes are cleaned without affecting permanent read-only commands", () => {
  const weight = planTransientDialogMessages([], [], "/weight 87.5", 106);
  assert.equal(weight.incomingDialogKey, "direct:106");
  assert.equal(weight.outgoingDialogKey, "direct:106");
  assert.deepEqual(weight.cleanupDialogKeys, ["direct:106"]);

  for (const command of ["/strength", "/review", "/progress", "/export", "/usage", "/today"]) {
    assert.deepEqual(planTransientDialogMessages([], [], command, 107), { cleanupDialogKeys: [] });
  }
});

test("a repeated or failed data upload without a draft is still cleaned", () => {
  const upload = planTransientDialogMessages([], [], "/nutrition", 109, true);

  assert.equal(upload.incomingDialogKey, "direct:109");
  assert.equal(upload.outgoingDialogKey, "direct:109");
  assert.deepEqual(upload.cleanupDialogKeys, ["direct:109"]);
});

test("switching flows cleans the old dialog and tracks the new one", () => {
  const illness = dialog("illness", 11);
  const measurement = dialog("measurement", 12);

  const plan = planTransientDialogMessages([illness], [measurement], "/measure", 108);

  assert.equal(plan.incomingDialogKey, measurement.dialogKey);
  assert.equal(plan.outgoingDialogKey, measurement.dialogKey);
  assert.deepEqual(plan.cleanupDialogKeys, [illness.dialogKey]);
});

test("read-only permanent commands do not become part of an unrelated active checkin", () => {
  const checkin = dialog("post_workout_checkin", 13);

  for (const command of ["/strength", "/review", "/progress", "/export", "/usage"]) {
    assert.deepEqual(planTransientDialogMessages([checkin], [checkin], command, 111), { cleanupDialogKeys: [] });
  }
});
