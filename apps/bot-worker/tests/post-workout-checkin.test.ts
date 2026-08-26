import test from "node:test";
import assert from "node:assert/strict";
import { checkinQuestion, parsePainAnswer, parseScaleAnswer } from "../src/post-workout-checkin.ts";

test("checkin accepts compact integer scale answers", () => {
  assert.equal(parseScaleAnswer("8", 1, 10), 8);
  assert.equal(parseScaleAnswer("8/10", 1, 10), 8);
  assert.equal(parseScaleAnswer("0", 0, 10), 0);
  assert.equal(parseScaleAnswer("0", 1, 10), null);
  assert.equal(parseScaleAnswer("8.5", 1, 10), null);
});

test("pain answer distinguishes no pain from described symptoms", () => {
  assert.deepEqual(parsePainAnswer("не было"), { reported: true, anyPain: false });
  assert.deepEqual(parsePainAnswer("Колено 3/10, тянуло"), {
    reported: true,
    anyPain: true,
    details: "Колено 3/10, тянуло",
  });
  assert.equal(parsePainAnswer("да"), null);
});

test("all four checkin questions are explicit and token-free", () => {
  assert.match(checkinQuestion(1), /1–10/);
  assert.match(checkinQuestion(2), /RIR 0–10/);
  assert.match(checkinQuestion(3), /область/);
  assert.match(checkinQuestion(4), /1–5/);
});
