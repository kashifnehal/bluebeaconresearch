import assert from "node:assert/strict";
import {
  MAX_SESSIONS_PER_USER,
  decodeSessionIdClaim,
  deriveDeviceLabel,
  oldestSessionToEvict,
  selectStaleSessionIds,
} from "./session-tracking";

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

function b64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json)).toString("base64url");
}

runTest("decodes the session_id claim from a JWT-shaped access token", () => {
  const token = `${b64url({ alg: "HS256" })}.${b64url({ sub: "u1", session_id: "sess-abc" })}.sig`;
  assert.equal(decodeSessionIdClaim(token), "sess-abc");
});

runTest("returns null for a malformed or claim-less token", () => {
  assert.equal(decodeSessionIdClaim("not-a-jwt"), null);
  assert.equal(decodeSessionIdClaim(`${b64url({})}.${b64url({ sub: "u1" })}.sig`), null);
});

runTest("derives a readable device label from common User-Agent strings", () => {
  assert.equal(
    deriveDeviceLabel(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
    ),
    "Chrome on Windows",
  );
  assert.equal(
    deriveDeviceLabel(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
    ),
    "Safari on macOS",
  );
  assert.equal(deriveDeviceLabel(null), null);
});

runTest("a 3rd login evicts the oldest of 2 existing sessions", () => {
  assert.equal(MAX_SESSIONS_PER_USER, 2);
  const existing = [
    { id: "session-1-oldest", created_at: "2026-09-01T00:00:00.000Z", last_seen_at: "2026-09-01T00:00:00.000Z" },
    { id: "session-2", created_at: "2026-09-10T00:00:00.000Z", last_seen_at: "2026-09-10T00:00:00.000Z" },
  ];
  const toEvict = oldestSessionToEvict(existing);
  assert.ok(toEvict);
  assert.equal(toEvict!.id, "session-1-oldest");
});

runTest("under the cap, nothing is evicted", () => {
  const existing = [
    { id: "session-1", created_at: "2026-09-10T00:00:00.000Z", last_seen_at: "2026-09-10T00:00:00.000Z" },
  ];
  assert.equal(oldestSessionToEvict(existing), null);
});

runTest("flags sessions past the 30-day stale cutoff", () => {
  const now = new Date("2026-09-27T00:00:00.000Z");
  const rows = [
    { id: "fresh", created_at: "2026-09-20T00:00:00.000Z", last_seen_at: "2026-09-20T00:00:00.000Z" },
    { id: "stale", created_at: "2026-08-01T00:00:00.000Z", last_seen_at: "2026-08-01T00:00:00.000Z" },
  ];
  assert.deepEqual(selectStaleSessionIds(rows, now), ["stale"]);
});
