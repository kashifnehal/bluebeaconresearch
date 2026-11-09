import assert from "node:assert/strict";
import { setupDom } from "./test-render";

setupDom();

import { deferToIdle } from "./idle-defer";

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
  await runTest("does not call fn synchronously (linkedom's window has no requestIdleCallback, falls back to a macrotask)", async () => {
    let called = false;
    deferToIdle(() => {
      called = true;
    });
    assert.equal(called, false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(called, true);
  });

  await runTest("cancel() prevents the deferred call from firing", async () => {
    let called = false;
    const cancel = deferToIdle(() => {
      called = true;
    });
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(called, false);
  });

  await runTest("uses requestIdleCallback when the environment provides one", async () => {
    let calledVia: "ric" | null = null;
    const g = globalThis as any;
    const originalRic = g.window.requestIdleCallback;
    const originalCic = g.window.cancelIdleCallback;
    g.window.requestIdleCallback = (cb: () => void) => {
      calledVia = "ric";
      cb();
      return 1;
    };
    g.window.cancelIdleCallback = () => {};
    try {
      deferToIdle(() => {});
      assert.equal(calledVia, "ric");
    } finally {
      g.window.requestIdleCallback = originalRic;
      g.window.cancelIdleCallback = originalCic;
    }
  });
}

void main();
