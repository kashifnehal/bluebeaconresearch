import assert from "node:assert/strict";

import { CORRECTIONS } from "./corrections-log";

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

async function main() {
  await runTest("every corrections entry has a date, a place, what was wrong, and what changed", () => {
    assert.ok(CORRECTIONS.length > 0);
    for (const entry of CORRECTIONS) {
      assert.equal(entry.date.trim().length > 0, true);
      assert.equal(entry.where.trim().length > 0, true);
      assert.equal(entry.wasWrong.trim().length > 0, true);
      assert.equal(entry.changed.trim().length > 0, true);
    }
  });
}

void main();
