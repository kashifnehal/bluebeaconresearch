import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

// Plain tsx + node:assert, same pattern as spend-limit-alert.test.ts — no
// jest/vitest in this backend. pickDiverse itself is a pure function (no
// Supabase/email calls), but digest-sender.ts's module top level eagerly calls
// getSupabaseAdmin() (unlike spend-limit-alert.ts), and ESM hoists static
// imports ahead of this file's own statements — so the env vars above must be
// set via a dynamic import, not a static one, or they'd be set too late.
const {
  pickDiverse,
  selectDigestSignalsForUser,
  renderDigestEmail,
  runDigestOnce,
  __setDigestSupabaseForTests,
  __setDigestEmailForTests,
} = await import("./digest-sender.js");
type SignalRow = Parameters<typeof pickDiverse>[0][number];

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        () => console.log(`✔ ${name}`),
        (err) => {
          console.error(`✖ ${name}`);
          console.error(err);
          process.exitCode = 1;
        },
      );
    }
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function row(id: string, title: string, severity: number, createdAt: string): SignalRow {
  return {
    id,
    title,
    summary: null,
    ai_analysis: null,
    severity,
    region: null,
    commodity_impacts: null,
    currency_pair_impacts: null,
    raw_event_ids: null,
    event_date: createdAt,
    created_at: createdAt,
  };
}

function digestClient(signals: SignalRow[], deferredIds: string[]) {
  return {
    from(table: string) {
      if (table === "alerts_sent") {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          update: () => builder,
          in: () => builder,
          then: (resolve: (value: { data: Array<{ signal_id: string }>; error: null }) => unknown) =>
            Promise.resolve({
              data: deferredIds.map((id) => ({ signal_id: id })),
              error: null,
            }).then(resolve),
        };
        return builder;
      }
      if (table === "signals") {
        let ids: string[] | null = null;
        let since: string | null = null;
        const builder: Record<string, unknown> = {
          select: () => builder,
          in: (_col: string, values: string[]) => {
            ids = values;
            return builder;
          },
          gte: (_col: string, value: string) => {
            since = value;
            return builder;
          },
          eq: () => builder,
          or: () => builder,
          order: () => builder,
          limit: () => builder,
          then: (resolve: (value: { data: SignalRow[]; error: null }) => unknown) => {
            const data = signals.filter((s) => {
              if (ids && !ids.includes(s.id)) return false;
              if (since && s.created_at < since) return false;
              return true;
            });
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return builder;
      }
      if (table === "user_preferences") {
        const builder: Record<string, unknown> = {
          select: () => builder,
          not: () => builder,
          eq: () => builder,
          in: () => builder,
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({
              data: [
                {
                  user_id: "user-1",
                  commodities: [],
                  regions: [],
                  forex_pairs: [],
                  min_severity: null,
                },
              ],
              error: null,
            }).then(resolve),
        };
        return builder;
      }
      if (table === "profiles") {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: [{ id: "user-1", email: "reader@example.com" }] } };
        },
      },
    },
  };
}

const emptyPref = {
  user_id: "user-1",
  commodities: [] as string[],
  regions: [] as string[],
  forex_pairs: [] as string[],
  min_severity: null,
};

async function ageTests() {
  const now = new Date("2026-10-14T06:00:00.000Z");
  const old = row("old", "Deferred signal from before the window", 9, "2026-10-13T00:00:00.000Z");
  const fresh = row("fresh", "Deferred signal inside the window", 7, "2026-10-14T01:00:00.000Z");

  await runTest("a deferred signal 30h old is excluded and one 5h old is included", async () => {
    __setDigestSupabaseForTests(digestClient([old, fresh], ["old", "fresh"]));
    const picked = await selectDigestSignalsForUser(emptyPref, now);
    assert.deepEqual(
      picked.map((s) => s.id),
      ["fresh"],
    );
  });

  await runTest("the footer line shows the max created_at in html and text", async () => {
    const earlier = row("early", "Earlier signal", 5, "2026-10-14T01:00:00.000Z");
    const later = row("later", "Later signal", 8, "2026-10-14T05:00:00.000Z");
    const rendered = renderDigestEmail(
      [earlier, later],
      emptyPref,
      new Map(),
      "https://bluebeaconresearch.com",
    );
    const line = "Newest signal in this email: 2026-10-14T05:00:00.000Z";
    assert.ok(rendered.text.endsWith(line));
    assert.match(rendered.html, /Newest signal in this email: 2026-10-14T05:00:00\.000Z/);
  });

  await runTest("zero signals left after filtering does not send", async () => {
    const sends: unknown[] = [];
    __setDigestSupabaseForTests(digestClient([old], ["old"]));
    __setDigestEmailForTests({
      enabled: true,
      async send(opts: { to: string }) {
        sends.push(opts);
        return { sent: true as const, id: "fake" };
      },
    } as unknown as import("../services/email.service.js").EmailService);
    const result = await runDigestOnce();
    assert.equal(result.eligible, 1);
    assert.equal(result.skippedNoSignals, 1);
    assert.equal(result.sent, 0);
    assert.equal(sends.length, 0);
  });
}

function main() {
  runTest("5 near-duplicate stories + 3 different stories → output contains the different ones", () => {
    // High-severity near-duplicates all covering the same Red Sea tanker strike —
    // a flat top-5-by-severity pick would return only these 5 and miss every other
    // story (the real CORN/WHEAT-only digest bug noted in LIVE_TODO #83).
    const nearDuplicates = [
      row("dup-1", "Houthi forces strike tanker in Red Sea shipping lane", 8, "2026-10-01T06:00:00Z"),
      row("dup-2", "Houthi forces strike tanker in Red Sea shipping lane again", 8, "2026-10-01T05:50:00Z"),
      row("dup-3", "Houthi forces strike tanker in Red Sea shipping route", 8, "2026-10-01T05:40:00Z"),
      row("dup-4", "Houthi forces strike tanker near Red Sea shipping lane", 8, "2026-10-01T05:30:00Z"),
      row("dup-5", "Houthi forces strike tanker in Red Sea shipping corridor", 8, "2026-10-01T05:20:00Z"),
    ];
    // Lower-severity but mutually unrelated stories — zero title-token overlap
    // with the near-duplicate cluster or each other.
    const different = [
      row("diff-1", "Brazil central bank raises benchmark interest rate", 5, "2026-10-01T04:00:00Z"),
      row("diff-2", "Japan automaker halts production over chip shortage", 5, "2026-10-01T03:50:00Z"),
      row("diff-3", "Australia wildfire season forecast worse than average", 5, "2026-10-01T03:40:00Z"),
    ];

    const candidates = [...nearDuplicates, ...different]; // pre-ordered severity desc, as the real query does
    const picked = pickDiverse(candidates, 5);

    assert.equal(picked.length, 5);
    const pickedIds = new Set(picked.map((s) => s.id));
    for (const d of different) {
      assert.ok(pickedIds.has(d.id), `expected ${d.id} in the diverse pick, got ${[...pickedIds].join(",")}`);
    }
  });

  runTest("a candidate pool no larger than the limit is returned unchanged", () => {
    const candidates = [
      row("a", "Story one", 9, "2026-10-01T06:00:00Z"),
      row("b", "Story two", 7, "2026-10-01T05:00:00Z"),
      row("c", "Story three", 5, "2026-10-01T04:00:00Z"),
    ];
    const picked = pickDiverse(candidates, 5);
    assert.deepEqual(picked, candidates);
  });
}

main();
void ageTests();
