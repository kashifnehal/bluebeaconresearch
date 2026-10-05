import assert from "node:assert/strict";
import { chatOwnsAlert, parseFeedbackCallback } from "./telegram.js";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const sampleId = "11111111-2222-3333-4444-555555555555";

runTest("parses a well-formed feedback callback_data", () => {
  assert.deepEqual(parseFeedbackCallback(`fb:useful:${sampleId}`), { value: "useful", alertsSentId: sampleId });
  assert.deepEqual(parseFeedbackCallback(`fb:not_useful:${sampleId}`), { value: "not_useful", alertsSentId: sampleId });
  assert.deepEqual(parseFeedbackCallback(`fb:mute_topic:${sampleId}`), { value: "mute_topic", alertsSentId: sampleId });
});

runTest("rejects an unknown feedback value", () => {
  assert.equal(parseFeedbackCallback(`fb:snooze:${sampleId}`), null);
});

runTest("rejects malformed or unrelated callback_data", () => {
  assert.equal(parseFeedbackCallback("not-a-callback"), null);
  assert.equal(parseFeedbackCallback("fb:useful:not-a-uuid"), null);
  assert.equal(parseFeedbackCallback(undefined), null);
  assert.equal(parseFeedbackCallback(null), null);
});

runTest("a chat linked to the alert's own user owns the alert", () => {
  assert.equal(chatOwnsAlert("user-1", "user-1"), true);
});

runTest("a chat linked to a different user does not own the alert, and is ignored", () => {
  assert.equal(chatOwnsAlert("user-1", "user-2"), false);
});

runTest("a chat with no linked user_channels row does not own the alert", () => {
  assert.equal(chatOwnsAlert(undefined, "user-2"), false);
  assert.equal(chatOwnsAlert(null, "user-2"), false);
});

runTest("an alerts_sent id that does not exist is never owned", () => {
  assert.equal(chatOwnsAlert("user-1", undefined), false);
  assert.equal(chatOwnsAlert("user-1", null), false);
});
