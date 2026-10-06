import assert from "node:assert/strict";
import { tryTitlePreFilterSkip } from "./title-prefilter.js";

let failed = false;
function runTest(name: string, fn: () => Promise<void>) {
  return fn()
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      failed = true;
      console.error(`✖ ${name}`);
      console.error(err);
    });
}

const TITLE = "Strait of Hormuz: Tanker Seizure Reported!";
const TITLE_FOLDED = "strait of hormuz — tanker seizure reported";

type RawRow = {
  id: string;
  title: string;
  source: string;
  created_at: string;
  materiality_checked_at: string | null;
};

type SignalRow = {
  id: string;
  raw_event_ids: string[];
  sources_count: number;
  updated_at?: string;
};

type Filter = { type: string; col: string; val: unknown };

type QueryLog = {
  table: string;
  op: "select" | "update";
  select?: string;
  limit?: number;
  patch?: Record<string, unknown>;
  filters: Filter[];
};

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function rowMatches(row: Record<string, unknown>, filters: Filter[]): boolean {
  for (const f of filters) {
    const value = row[f.col];
    if (f.type === "in") {
      if (!(f.val as unknown[]).includes(value)) return false;
    } else if (f.type === "neq") {
      if (value === f.val) return false;
    } else if (f.type === "gte") {
      if (String(value) < String(f.val)) return false;
    } else if (f.type === "eq") {
      if (value !== f.val) return false;
    } else if (f.type === "contains") {
      const haystack = (value as string[] | null) ?? [];
      const needles = f.val as string[];
      if (!needles.every((n) => haystack.includes(n))) return false;
    }
  }
  return true;
}

function createFake(rawEvents: RawRow[], signals: SignalRow[]) {
  const logs: QueryLog[] = [];

  function from(table: string) {
    const filters: Filter[] = [];
    let selectCols = "";
    let patch: Record<string, unknown> | null = null;

    const builder = {
      select(cols: string) {
        selectCols = cols;
        return builder;
      },
      in(col: string, val: unknown) {
        filters.push({ type: "in", col, val });
        return builder;
      },
      neq(col: string, val: unknown) {
        filters.push({ type: "neq", col, val });
        return builder;
      },
      gte(col: string, val: unknown) {
        filters.push({ type: "gte", col, val });
        return builder;
      },
      order() {
        return builder;
      },
      contains(col: string, val: unknown) {
        filters.push({ type: "contains", col, val });
        return builder;
      },
      limit(n: number) {
        const source = table === "raw_events" ? rawEvents : signals;
        const data = source
          .filter((row) => rowMatches(row as unknown as Record<string, unknown>, filters))
          .sort((a, b) =>
            String((b as { created_at?: string }).created_at ?? "").localeCompare(
              String((a as { created_at?: string }).created_at ?? ""),
            ),
          )
          .slice(0, n);
        logs.push({
          table,
          op: "select",
          select: selectCols,
          limit: n,
          filters: [...filters],
        });
        return Promise.resolve({ data, error: null });
      },
      update(next: Record<string, unknown>) {
        patch = next;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push({ type: "eq", col, val });
        logs.push({
          table,
          op: "update",
          patch: patch ?? {},
          filters: [...filters],
        });
        const source = table === "raw_events" ? rawEvents : signals;
        const row = source.find((r) => (r as { id: string }).id === val);
        if (row && patch) Object.assign(row, patch);
        return Promise.resolve({ error: null });
      },
    };
    return builder;
  }

  return { logs, supabase: { from } };
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = orig;
  }
  return lines;
}

await runTest("reuses a prior rejection for the same normalized title", async () => {
  const priorId = "prior-rejected";
  const rawEventId = "new-repeat";
  const { logs, supabase } = createFake(
    [
      {
        id: priorId,
        title: TITLE_FOLDED,
        source: "rss",
        created_at: hoursAgo(2),
        materiality_checked_at: hoursAgo(2),
      },
    ],
    [],
  );

  const lines = await captureLogs(async () => {
    const result = await tryTitlePreFilterSkip({
      supabase: supabase as never,
      collectorLabel: "RSS",
      rawEventId,
      source: "newsapi",
      title: TITLE,
    });
    assert.deepEqual(result, { skipped: true, signalId: null });
  });

  const selects = logs.filter((l) => l.op === "select" && l.table === "raw_events");
  assert.equal(selects.length, 2);
  assert.equal(selects[0].limit, 50);
  assert.equal(selects[0].select, "id, title, created_at");
  assert.equal(selects[1].limit, 200);
  assert.equal(selects[1].select, "id, title, created_at, materiality_checked_at");

  const stamp = logs.find((l) => l.op === "update" && l.table === "raw_events");
  assert.ok(stamp, "new row must be stamped");
  assert.equal(
    stamp!.filters.find((f) => f.type === "eq" && f.col === "id")?.val,
    rawEventId,
  );
  assert.equal(typeof stamp!.patch?.materiality_checked_at, "string");
  assert.ok(
    lines.some(
      (line) =>
        line.includes("[RSS] [PRE-FILTER:reject-reused]") &&
        line.includes(`rawEvent=${rawEventId}`) &&
        line.includes(`earlier=${priorId}`),
    ),
    lines.join("\n"),
  );
});

await runTest("does not reuse a deferred row that was never judged", async () => {
  const { logs, supabase } = createFake(
    [
      {
        id: "prior-deferred",
        title: TITLE,
        source: "newsapi",
        created_at: hoursAgo(3),
        materiality_checked_at: null,
      },
    ],
    [],
  );

  const result = await tryTitlePreFilterSkip({
    supabase: supabase as never,
    collectorLabel: "GNews",
    rawEventId: "new-after-defer",
    source: "newsapi",
    title: TITLE,
  });

  assert.deepEqual(result, { skipped: false });
  assert.equal(
    logs.some((l) => l.op === "update"),
    false,
  );
});

await runTest("still merges a passed row into its signal inside 45 minutes", async () => {
  const priorId = "prior-passed";
  const rawEventId = "new-refetch";
  const signalId = "signal-1";
  const signals: SignalRow[] = [
    { id: signalId, raw_event_ids: [priorId], sources_count: 1 },
  ];
  const { logs, supabase } = createFake(
    [
      {
        id: priorId,
        title: TITLE,
        source: "newsapi",
        created_at: minutesAgo(10),
        materiality_checked_at: null,
      },
    ],
    signals,
  );

  const lines = await captureLogs(async () => {
    const result = await tryTitlePreFilterSkip({
      supabase: supabase as never,
      collectorLabel: "GNews",
      rawEventId,
      source: "newsapi",
      title: TITLE,
    });
    assert.deepEqual(result, { skipped: true, signalId });
  });

  const rawSelects = logs.filter((l) => l.op === "select" && l.table === "raw_events");
  assert.equal(rawSelects.length, 1);
  assert.equal(rawSelects[0].limit, 50);

  assert.deepEqual(signals[0].raw_event_ids, [priorId, rawEventId]);
  assert.equal(signals[0].sources_count, 2);
  assert.equal(
    logs.some((l) => l.op === "update" && l.table === "raw_events"),
    false,
  );
  assert.ok(lines.some((line) => line.includes("[PRE-FILTER:skipped]") && line.includes(signalId)));
});

await runTest("does not match the same title from a different source group", async () => {
  const { logs, supabase } = createFake(
    [
      {
        id: "gdelt-rejected",
        title: TITLE,
        source: "gdelt",
        created_at: hoursAgo(1),
        materiality_checked_at: hoursAgo(1),
      },
    ],
    [],
  );

  const result = await tryTitlePreFilterSkip({
    supabase: supabase as never,
    collectorLabel: "GNews",
    rawEventId: "news-copy",
    source: "newsapi",
    title: TITLE,
  });

  assert.deepEqual(result, { skipped: false });
  assert.equal(
    logs.some((l) => l.op === "update"),
    false,
  );
  const rawSelects = logs.filter((l) => l.table === "raw_events" && l.op === "select");
  assert.equal(rawSelects.length, 2);
  for (const q of rawSelects) {
    const sourceFilter = q.filters.find((f) => f.type === "in" && f.col === "source");
    assert.deepEqual(sourceFilter?.val, ["newsapi", "rss"]);
  }
});

if (failed) {
  console.error("\nSome title-prefilter tests failed.");
  process.exit(1);
} else {
  console.log("\nAll title-prefilter tests passed.");
}
