import assert from "node:assert/strict";
import { TelegramService } from "./telegram.service.js";

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

const telegram = new TelegramService();
const sampleId = "11111111-2222-3333-4444-555555555555";

runTest("feedback keyboard has one row of three fb:<value>:<id> buttons", () => {
  const keyboard = telegram.buildFeedbackKeyboard(sampleId);
  assert.equal(keyboard.length, 1);
  assert.equal(keyboard[0].length, 3);
  assert.deepEqual(
    keyboard[0].map((b) => b.callback_data),
    [`fb:useful:${sampleId}`, `fb:not_useful:${sampleId}`, `fb:mute_topic:${sampleId}`],
  );
});

runTest("every callback_data stays within Telegram's 64-byte limit", () => {
  const keyboard = telegram.buildFeedbackKeyboard(sampleId);
  for (const row of keyboard) {
    for (const button of row) {
      const bytes = Buffer.byteLength(button.callback_data, "utf8");
      assert.ok(bytes <= 64, `${button.callback_data} is ${bytes} bytes, over the 64-byte Telegram limit`);
    }
  }
});
