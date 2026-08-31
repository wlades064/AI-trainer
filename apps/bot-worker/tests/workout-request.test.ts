import test from "node:test";
import assert from "node:assert/strict";
import { dispatchWorkoutRequest, TOMORROW_WORKOUT_DISABLED } from "../src/workout-request.ts";

test("tomorrow request is rejected without invoking today's workout pipeline", async () => {
  let pipelineCalls = 0;

  const reply = await dispatchWorkoutRequest(1, async () => {
    pipelineCalls += 1;
    return "generated";
  });

  assert.equal(reply, TOMORROW_WORKOUT_DISABLED);
  assert.equal(pipelineCalls, 0);
  assert.match(reply, /только в день тренировки/i);
  assert.match(reply, /чекин/i);
});

test("today request invokes the workout pipeline once", async () => {
  let pipelineCalls = 0;

  const reply = await dispatchWorkoutRequest(0, async () => {
    pipelineCalls += 1;
    return "today workout";
  });

  assert.equal(reply, "today workout");
  assert.equal(pipelineCalls, 1);
});
