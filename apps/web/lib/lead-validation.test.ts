import assert from "node:assert/strict";

import { validateSubscribe, validateLead, sanitizeSource } from "./lead-validation";

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

const NOW = 1_800_000_000_000;
const OLD_ENOUGH = NOW - 10_000;

// ---- validateSubscribe ----

runTest("subscribe: valid email + consent passes", () => {
  const res = validateSubscribe({ email: "Reader@Example.com", consent: true, t: OLD_ENOUGH }, NOW);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.email, "reader@example.com");
});

runTest("subscribe: malformed email is invalid_email", () => {
  for (const bad of ["not-an-email", "a@b", "@example.com", "a@@b.com", "a b@example.com", 42]) {
    const res = validateSubscribe({ email: bad, consent: true, t: OLD_ENOUGH }, NOW);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "invalid_email");
  }
});

runTest("subscribe: missing consent is missing_consent", () => {
  const res = validateSubscribe({ email: "a@example.com", consent: false, t: OLD_ENOUGH }, NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "missing_consent");
});

runTest("subscribe: honeypot filled is spam", () => {
  const res = validateSubscribe({ email: "a@example.com", consent: true, website: "http://spam.example", t: OLD_ENOUGH }, NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "spam");
});

runTest("subscribe: submitted under 3s after render is spam", () => {
  const res = validateSubscribe({ email: "a@example.com", consent: true, t: NOW - 1_000 }, NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "spam");
});

runTest("subscribe: submitted exactly at the 3s boundary passes", () => {
  const res = validateSubscribe({ email: "a@example.com", consent: true, t: NOW - 3_000 }, NOW);
  assert.equal(res.ok, true);
});

runTest("subscribe: spam is checked before consent/email", () => {
  const res = validateSubscribe({ email: "nope", consent: false, website: "x" }, NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "spam");
});

runTest("subscribe: email over 254 chars is invalid_email", () => {
  const long = `${"a".repeat(250)}@b.co`;
  const res = validateSubscribe({ email: long, consent: true, t: OLD_ENOUGH }, NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "invalid_email");
});

runTest("subscribe: source is whitelisted and trimmed", () => {
  const res = validateSubscribe(
    {
      email: "a@example.com",
      consent: true,
      t: OLD_ENOUGH,
      source: { path: " /about ", utm_source: "newsletter", ip: "1.2.3.4", password: "nope" },
    },
    NOW,
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.value.source, { path: "/about", utm_source: "newsletter" });
  }
});

// ---- validateLead ----

function baseLead(overrides: Record<string, unknown> = {}) {
  return {
    kind: "walkthrough",
    name: "Jamie Lee",
    workEmail: "jamie@example.com",
    organisation: "Acme Trading",
    role: "Analyst",
    markets: ["USOIL", "XAUUSD"],
    message: "Interested in energy coverage.",
    consentContact: true,
    t: OLD_ENOUGH,
    ...overrides,
  };
}

runTest("lead: a fully valid walkthrough request passes", () => {
  const res = validateLead(baseLead(), NOW);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.kind, "walkthrough");
    assert.deepEqual(res.value.markets, ["USOIL", "XAUUSD"]);
  }
});

runTest("lead: professional_access kind is preserved", () => {
  const res = validateLead(baseLead({ kind: "professional_access" }), NOW);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.kind, "professional_access");
});

runTest("lead: an unrecognised kind falls back to walkthrough", () => {
  const res = validateLead(baseLead({ kind: "something_else" }), NOW);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.kind, "walkthrough");
});

runTest("lead: malformed work email is invalid_email", () => {
  const res = validateLead(baseLead({ workEmail: "not-an-email" }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "invalid_email");
});

runTest("lead: missing consent is missing_consent", () => {
  const res = validateLead(baseLead({ consentContact: false }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "missing_consent");
});

runTest("lead: honeypot filled is spam", () => {
  const res = validateLead(baseLead({ website: "http://spam.example" }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "spam");
});

runTest("lead: submitted under 3s after render is spam", () => {
  const res = validateLead(baseLead({ t: NOW - 500 }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "spam");
});

runTest("lead: name over 100 chars is too_long", () => {
  const res = validateLead(baseLead({ name: "A".repeat(101) }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "too_long");
});

runTest("lead: organisation over 120 chars is too_long", () => {
  const res = validateLead(baseLead({ organisation: "A".repeat(121) }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "too_long");
});

runTest("lead: role over 120 chars is too_long", () => {
  const res = validateLead(baseLead({ role: "A".repeat(121) }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "too_long");
});

runTest("lead: message over 1000 chars is too_long", () => {
  const res = validateLead(baseLead({ message: "A".repeat(1001) }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "too_long");
});

runTest("lead: empty optional fields pass and come back null", () => {
  const res = validateLead(baseLead({ organisation: "", role: undefined, message: "" }), NOW);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.organisation, null);
    assert.equal(res.value.role, null);
    assert.equal(res.value.message, null);
  }
});

runTest("lead: a market symbol not in the asset list is invalid_markets", () => {
  const res = validateLead(baseLead({ markets: ["USOIL", "BITCOIN"] }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "invalid_markets");
});

runTest("lead: a non-string market entry is invalid_markets", () => {
  const res = validateLead(baseLead({ markets: ["USOIL", 7] }), NOW);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "invalid_markets");
});

runTest("lead: duplicate market symbols are de-duplicated", () => {
  const res = validateLead(baseLead({ markets: ["USOIL", "USOIL"] }), NOW);
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.value.markets, ["USOIL"]);
});

runTest("lead: no markets selected is still valid (empty list)", () => {
  const res = validateLead(baseLead({ markets: [] }), NOW);
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.value.markets, []);
});

runTest("lead: control characters are stripped from free text", () => {
  const res = validateLead(baseLead({ name: "Jamie\u0007 Lee\u0000" }), NOW);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.name, "Jamie Lee");
});

// ---- sanitizeSource ----

runTest("sanitizeSource: non-object input returns empty object", () => {
  assert.deepEqual(sanitizeSource(null), {});
  assert.deepEqual(sanitizeSource("x"), {});
  assert.deepEqual(sanitizeSource(undefined), {});
});

runTest("sanitizeSource: unknown keys are dropped, never an ip field", () => {
  const out = sanitizeSource({ ip: "1.2.3.4", path: "/walkthrough" });
  assert.deepEqual(out, { path: "/walkthrough" });
});
