import assert from "node:assert/strict";
import {
  decodeArchiveCursor,
  encodeArchiveCursor,
  parseArchiveDayBound,
} from "./signal-archive";

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

runTest("parseArchiveDayBound accepts YYYY-MM-DD and rejects junk", () => {
  assert.equal(parseArchiveDayBound("2026-09-01", false), "2026-09-01T00:00:00.000Z");
  assert.equal(parseArchiveDayBound("2026-09-01", true), "2026-09-01T23:59:59.999Z");
  assert.equal(parseArchiveDayBound("09/01/2026", false), null);
  assert.equal(parseArchiveDayBound("2026-9-1", false), null);
  assert.equal(parseArchiveDayBound("", false), null);
  assert.equal(parseArchiveDayBound(null, true), null);
});

runTest("archive cursor round-trips a valid (event_date, id) pair", () => {
  const c = {
    d: "2026-08-15T12:00:00.000Z",
    id: "4c537435-0000-4000-8000-000000000001",
  };
  const encoded = encodeArchiveCursor(c);
  assert.equal(decodeArchiveCursor(encoded)?.d, c.d);
  assert.equal(decodeArchiveCursor(encoded)?.id, c.id);
});

runTest("decodeArchiveCursor rejects numeric page tokens and crafted junk", () => {
  assert.equal(decodeArchiveCursor("1"), null);
  assert.equal(decodeArchiveCursor("not-base64"), null);
  assert.equal(decodeArchiveCursor(encodeArchiveCursor({ d: "nope", id: "x" })), null);
  assert.equal(
    decodeArchiveCursor(
      encodeArchiveCursor({ d: "2026-08-15T12:00:00.000Z", id: "not-a-uuid" }),
    ),
    null,
  );
});

if (!process.exitCode) console.log("signal-archive.test.ts ok");
