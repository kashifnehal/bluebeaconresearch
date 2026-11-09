import assert from "node:assert/strict";
import { formatServerTiming, serverTimingComment, serverTimingEnabled } from "./server-timing";

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

const previous = process.env.SERVER_TIMING;

runTest("serverTimingComment is null unless SERVER_TIMING is exactly true", () => {
  try {
    delete process.env.SERVER_TIMING;
    assert.equal(serverTimingEnabled(), false);
    assert.equal(serverTimingComment("signal_row", 12), null);
    process.env.SERVER_TIMING = "false";
    assert.equal(serverTimingComment("stream_rest", 40), null);
  } finally {
    if (previous === undefined) delete process.env.SERVER_TIMING;
    else process.env.SERVER_TIMING = previous;
  }
});

runTest("signal_row and stream_rest marks use the Server-Timing format when the flag is on", () => {
  try {
    process.env.SERVER_TIMING = "true";
    assert.equal(
      serverTimingComment("signal_row", 12.4),
      "<!-- Server-Timing: signal_row;dur=12 -->",
    );
    assert.equal(
      serverTimingComment("stream_rest", 800),
      "<!-- Server-Timing: stream_rest;dur=800 -->",
    );
    assert.equal(formatServerTiming([{ name: "signal_row", durMs: 3 }]), "signal_row;dur=3");
  } finally {
    if (previous === undefined) delete process.env.SERVER_TIMING;
    else process.env.SERVER_TIMING = previous;
  }
});
