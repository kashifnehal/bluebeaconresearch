import assert from "node:assert/strict";
import { LAST_VISIT_KEY, readLastVisit, writeLastVisit, summarizeSince } from "./last-visit";

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

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

runTest("read/write round-trips and rejects junk", () => {
  const s = memoryStorage();
  assert.equal(readLastVisit(s), null);
  assert.equal(writeLastVisit(1_700_000_000_000, s), true);
  assert.equal(readLastVisit(s), 1_700_000_000_000);
  s.setItem(LAST_VISIT_KEY, "not-a-number");
  assert.equal(readLastVisit(s), null);
});

runTest("blocked or missing storage never throws", () => {
  assert.equal(readLastVisit(throwing), null);
  assert.equal(writeLastVisit(5, throwing), false);
  assert.equal(readLastVisit(null), null);
  assert.equal(writeLastVisit(5, null), false);
});

runTest("summarizeSince counts only rows newer than the last visit", () => {
  const now = Date.parse("2026-10-17T12:00:00");
  const rows = [
    { createdAt: "2026-10-17T11:00:00" },
    { createdAt: "2026-10-17T09:00:00" },
    { createdAt: "2026-10-16T09:00:00" },
    { createdAt: "bad" },
  ];
  const out = summarizeSince(rows, Date.parse("2026-10-17T10:00:00"), now);
  assert.deepEqual({ mode: out.mode, newCount: out.newCount }, { mode: "since", newCount: 1 });
});

runTest("summarizeSince falls back to today's rows when there is no stored visit", () => {
  const now = Date.parse("2026-10-17T12:00:00");
  const rows = [{ createdAt: "2026-10-17T01:00:00" }, { createdAt: "2026-10-16T23:00:00" }];
  const out = summarizeSince(rows, null, now);
  assert.deepEqual({ mode: out.mode, newCount: out.newCount }, { mode: "today", newCount: 1 });
});
