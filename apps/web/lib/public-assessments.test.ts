import assert from "node:assert/strict";

import { parseAssessmentRow, getPublishedAssessmentBySlug, SLUG_REGEX } from "./public-assessments";

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

function goodRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "houthi-strait-traffic",
    headline: "Houthi activity slows strait traffic",
    summary: "Tankers are waiting longer to transit; insurers have raised war-risk premiums for the route.",
    event_time: "2026-11-01T08:00:00.000Z",
    assessed_at: "2026-11-01T12:00:00.000Z",
    markets: ["USOIL", "UKOIL"],
    body: {
      what_happened: "Reported strikes near the strait slowed commercial transit for several vessels.",
      exposure: [{ market: "USOIL", mechanism: "route", note: "Longer transit times raise shipping cost per barrel." }],
      evidence: ["Three independent shipping trackers reported the same vessel delays."],
      uncertainty: ["The duration of the slowdown is not yet known."],
      what_to_watch: [{ date: "2026-11-05", item: "Next scheduled convoy transit", source: "Shipping authority bulletin" }],
    },
    sources: [
      { publisher: "Example Wire", title: "Tankers delayed near strait", url: "https://example.com/a", published_at: "2026-11-01T09:00:00.000Z" },
    ],
    status: "published",
    published_at: "2026-11-01T12:30:00.000Z",
    created_at: "2026-11-01T12:00:00.000Z",
    updated_at: "2026-11-01T12:30:00.000Z",
    ...overrides,
  };
}

async function main() {
  await runTest("a good row parses", () => {
    const parsed = parseAssessmentRow(goodRow());
    assert.ok(parsed);
    assert.equal(parsed?.slug, "houthi-strait-traffic");
    assert.equal(parsed?.body.exposure[0].mechanism, "route");
    assert.equal(parsed?.sources[0].url, "https://example.com/a");
  });

  await runTest("a bad slug (uppercase, too short) is rejected", () => {
    assert.equal(parseAssessmentRow(goodRow({ slug: "AB" })), null);
    assert.equal(parseAssessmentRow(goodRow({ slug: "has space" })), null);
  });

  await runTest("a bad exposure mechanism is rejected", () => {
    const row = goodRow();
    (row.body as any).exposure = [{ market: "USOIL", mechanism: "speculation", note: "x" }];
    assert.equal(parseAssessmentRow(row), null);
  });

  await runTest("missing sources is rejected", () => {
    assert.equal(parseAssessmentRow(goodRow({ sources: [] })), null);
    assert.equal(parseAssessmentRow(goodRow({ sources: undefined })), null);
  });

  await runTest("a non-https source url is rejected", () => {
    const row = goodRow();
    (row.sources as any)[0].url = "http://example.com/a";
    assert.equal(parseAssessmentRow(row), null);
  });

  await runTest("a summary over 400 chars is rejected", () => {
    assert.equal(parseAssessmentRow(goodRow({ summary: "a".repeat(401) })), null);
    assert.ok(parseAssessmentRow(goodRow({ summary: "a".repeat(400) })));
  });

  await runTest("a null event_time is accepted (event time is optional)", () => {
    const parsed = parseAssessmentRow(goodRow({ event_time: null }));
    assert.ok(parsed);
    assert.equal(parsed?.eventTime, null);
  });

  await runTest("a missing/invalid assessed_at is rejected", () => {
    assert.equal(parseAssessmentRow(goodRow({ assessed_at: "not-a-date" })), null);
    assert.equal(parseAssessmentRow(goodRow({ assessed_at: undefined })), null);
  });

  await runTest("a non-object row is rejected, never throws", () => {
    assert.doesNotThrow(() => {
      assert.equal(parseAssessmentRow(null), null);
      assert.equal(parseAssessmentRow("x"), null);
      assert.equal(parseAssessmentRow(42), null);
    });
  });

  await runTest("SLUG_REGEX matches the DB check constraint shape", () => {
    assert.ok(SLUG_REGEX.test("abc"));
    assert.ok(SLUG_REGEX.test("a-b-c-123"));
    assert.equal(SLUG_REGEX.test("ab"), false);
    assert.equal(SLUG_REGEX.test("Has-Caps"), false);
  });

  await runTest("getPublishedAssessmentBySlug validates the slug before querying — no client call for a bad slug", async () => {
    let called = false;
    const fakeClient = {
      from() {
        called = true;
        throw new Error("should not be reached");
      },
    } as any;
    const result = await getPublishedAssessmentBySlug("NOT VALID", fakeClient);
    assert.equal(result, null);
    assert.equal(called, false);
  });

  await runTest("getPublishedAssessmentBySlug queries by slug and status=published for a valid slug", async () => {
    const calls: { table: string; filters: Record<string, unknown> }[] = [];
    const fakeClient = {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const chain: any = {
          select() {
            return chain;
          },
          eq(col: string, val: unknown) {
            filters[col] = val;
            return chain;
          },
          maybeSingle: async () => {
            calls.push({ table, filters });
            return { data: goodRow(), error: null };
          },
        };
        return chain;
      },
    } as any;
    const result = await getPublishedAssessmentBySlug("houthi-strait-traffic", fakeClient);
    assert.ok(result);
    assert.equal(calls[0].table, "public_assessments");
    assert.equal(calls[0].filters.slug, "houthi-strait-traffic");
    assert.equal(calls[0].filters.status, "published");
  });

  await runTest("getPublishedAssessmentBySlug with no client returns null", async () => {
    assert.equal(await getPublishedAssessmentBySlug("houthi-strait-traffic", null), null);
  });
}

void main();
