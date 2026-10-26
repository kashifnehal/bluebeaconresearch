import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  formatFallbackShareLine,
  formatStatNumber,
  loadAcledState,
  loadHowItWorksSignalCounts,
  loadKeywordFallbackShare,
  OTHER_COLLECTOR_COUNT,
  TOTAL_COLLECTOR_COUNT,
  type HowItWorksAcledClient,
  type HowItWorksCountClient,
  type HowItWorksRowsClient,
} from "./how-it-works-stats";

declare module "linkedom" {
  export function parseHTML(html: string): { window: any; document: Document };
}

import { parseHTML } from "linkedom";

const { window: domWindow, document: domDocument } = parseHTML("<!doctype html><html><body></body></html>");
const g = globalThis as any;
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "DocumentFragment", "MutationObserver"] as const) {
  Object.defineProperty(g, key, {
    value: key === "window" ? domWindow : key === "document" ? domDocument : (domWindow as any)[key],
    configurable: true,
  });
}
const computedStyle = () => ({ getPropertyValue: () => "", contentVisibility: "visible", display: "block" });
g.getComputedStyle = computedStyle;
(domWindow as any).getComputedStyle = computedStyle;
const raf = (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 0);
const caf = (id: number) => clearTimeout(id);
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = caf;
(domWindow as any).requestAnimationFrame = raf;
(domWindow as any).cancelAnimationFrame = caf;
g.IS_REACT_ACT_ENVIRONMENT = true;

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

runTest("formatStatNumber adds thousands separators", () => {
  assert.equal(formatStatNumber(2996), "2,996");
  assert.equal(formatStatNumber(44), "44");
  assert.equal(formatStatNumber(0), "0");
});

runTest("how-it-works sources caption names sources, and the ACLED/keyword-fallback lines are computed live, not hardcoded", () => {
  const page = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../app/how-it-works/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("RSS feeds plus other data sources."), true);
  assert.equal(page.includes("data collectors configured in the ingestion pipeline"), false);
  // The old hardcoded ACLED claim and keyword-fallback line are gone; both
  // now come from loadAcledState/loadKeywordFallbackShare at request time.
  assert.equal(
    page.includes(
      "ACLED conflict data: ACLED is configured but returning no data (access pending), so no ACLED events are ingested yet.",
    ),
    false,
  );
  assert.match(page, /loadAcledState/);
  assert.match(page, /loadKeywordFallbackShare/);
});

runTest("TOTAL_COLLECTOR_COUNT is RSS feeds plus the collectors that actually ingest", () => {
  // 28 RSS feeds (packages/shared/src/constants/ingestion.ts) + 2 other collectors
  // that ingest today (gdelt, gnews) = 30. ACLED is excluded while it ingests
  // nothing (HTTP 403 on the data read); add it back when acled raw events exist.
  assert.equal(OTHER_COLLECTOR_COUNT, 2);
  assert.equal(TOTAL_COLLECTOR_COUNT, 28 + OTHER_COLLECTOR_COUNT);
  assert.equal(TOTAL_COLLECTOR_COUNT, 30);
});

function fakeClient(responses: Array<{ count: number | null; error: unknown }>) {
  const selects: Array<{
    table: string;
    columns: string;
    options: unknown;
    gte?: { column: string; value: string };
  }> = [];
  let i = 0;
  const client: HowItWorksCountClient = {
    from(table: string) {
      return {
        select(columns: string, options: { count: "exact"; head: true }) {
          const record: (typeof selects)[number] = { table, columns, options };
          selects.push(record);
          const next = responses[i] ?? responses[responses.length - 1];
          i += 1;
          const result = Promise.resolve(next);
          return Object.assign(result, {
            gte(column: string, value: string) {
              record.gte = { column, value };
              return Promise.resolve(next);
            },
          });
        },
      };
    },
  };
  return { client, selects };
}

async function runAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  const now = Date.parse("2026-10-16T00:00:00.000Z");
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  await runAsync("how-it-works counts use head: true", async () => {
    const { client, selects } = fakeClient([
      { count: 1200, error: null },
      { count: 40, error: null },
    ]);
    const result = await loadHowItWorksSignalCounts(async () => client, now);
    assert.deepEqual(result, { total: 1200, last7Days: 40 });
    assert.equal(selects.length, 2);
    assert.equal(selects[0].table, "signals");
    assert.equal(selects[1].table, "signals");
    assert.equal(selects[0].columns, "id");
    assert.equal(selects[1].columns, "id");
    assert.deepEqual(selects[0].options, { count: "exact", head: true });
    assert.deepEqual(selects[1].options, { count: "exact", head: true });
    assert.equal(selects[0].gte, undefined);
    assert.deepEqual(selects[1].gte, { column: "created_at", value: sevenDaysAgo });
  });

  await runAsync("a zero total stays hidden and a zero 7-day count is kept", async () => {
    const { client } = fakeClient([
      { count: 0, error: null },
      { count: 0, error: null },
    ]);
    const result = await loadHowItWorksSignalCounts(async () => client, now);
    assert.deepEqual(result, { total: null, last7Days: 0 });
  });

  function fakeRowsClient(result: { data: Array<{ classification_method: string | null }> | null; error: unknown }) {
    const seen: { column?: string; value?: string } = {};
    const client: HowItWorksRowsClient = {
      from() {
        return {
          select() {
            const base = Promise.resolve(result);
            return Object.assign(base, {
              gte(column: string, value: string) {
                seen.column = column;
                seen.value = value;
                return Promise.resolve(result);
              },
            });
          },
        };
      },
    };
    return { client, seen };
  }

  await runAsync("loadKeywordFallbackShare computes the heuristic share over the last 7 days", async () => {
    const { client, seen } = fakeRowsClient({
      data: [
        { classification_method: "claude" },
        { classification_method: "heuristic" },
        { classification_method: "heuristic" },
        { classification_method: "claude" },
      ],
      error: null,
    });
    const result = await loadKeywordFallbackShare(async () => client, now);
    assert.deepEqual(result, { heuristicCount: 2, total: 4, pct: 50 });
    assert.equal(seen.column, "created_at");
    assert.equal(seen.value, sevenDaysAgo);
  });

  await runAsync("loadKeywordFallbackShare returns null with no rows or a query error", async () => {
    const { client: emptyClient } = fakeRowsClient({ data: [], error: null });
    assert.equal(await loadKeywordFallbackShare(async () => emptyClient, now), null);
    const { client: erroredClient } = fakeRowsClient({ data: null, error: new Error("boom") });
    assert.equal(await loadKeywordFallbackShare(async () => erroredClient, now), null);
  });

  function fakeAcledClient(result: { data: { status: string | null; detail: string | null } | null; error: unknown }) {
    const client: HowItWorksAcledClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit() {
                        return { maybeSingle: () => Promise.resolve(result) };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    return client;
  }

  await runAsync("loadAcledState maps three stored inputs to fixed lines and never prints the error text", async () => {
    const inputs: Array<{
      result: { data: { status: string; detail: string } | null; error: unknown };
      expected: string | null;
    }> = [
      { result: { data: { status: "ok", detail: "fetched 12 event(s)" }, error: null }, expected: "ACLED conflict data: connected." },
      {
        result: {
          data: {
            status: "error",
            detail: "ACLED data access denied (HTTP 403). Awaiting licence or tier upgrade. Login works.",
          },
          error: null,
        },
        expected: "ACLED conflict data: not connected. Conflict signals use news sources only.",
      },
      { result: { data: null, error: null }, expected: null },
    ];
    const shown: string[] = [];
    for (const input of inputs) {
      const state = await loadAcledState(async () => fakeAcledClient(input.result));
      assert.equal(state, input.expected);
      if (state) shown.push(state);
    }
    const text = shown.join("\n");
    for (const word of ["HTTP", "403", "licence", "Login"]) {
      assert.equal(text.includes(word), false, word);
    }
  });

  const TABLE_COLUMN_RE = /[a-z_]+\.[a-z_]+_[a-z_]+|classification_method|signals\./;

  await runAsync("formatFallbackShareLine renders with the percent and counts and no table/column name", async () => {
    const line = formatFallbackShareLine({ heuristicCount: 2, total: 4, pct: 50 });
    const host = domDocument.createElement("div");
    domDocument.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(createElement("p", null, line));
      });
      const text = host.textContent ?? "";
      assert.match(text, /50%/);
      assert.match(text, /2 of 4/);
      assert.equal(TABLE_COLUMN_RE.test(text), false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  await runAsync("formatFallbackShareLine with no signals also renders clean", async () => {
    const line = formatFallbackShareLine(null);
    const host = domDocument.createElement("div");
    domDocument.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(createElement("p", null, line));
      });
      const text = host.textContent ?? "";
      assert.equal(TABLE_COLUMN_RE.test(text), false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
}

/**
 * Guard (extra, not the required rendered test above): scans app/component
 * source for string literals that leak a raw table.column name into what
 * could become user-facing copy. Skips import lines and comments, and only
 * inspects string-literal contents, not code identifiers like `signals.map`.
 */
const GUARDED_TABLE_COLUMN_RE = /\b(signals|prices|alert_rules|digest_send_log|cot_positions)\.[a-z_]+/;
// Literals are not allowed to cross a line break: JSX source has stray quote
// characters (className text, apostrophes in copy) that are not real string
// delimiters, and without this a naive scan can pair a quote on one line
// with an unrelated one many lines later and swallow real code in between.
const STRING_LITERAL_RE = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\\n]|\\.)*`/g;

function stripCommentsAndImports(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/^[ \t]*import\b[\s\S]*?;/gm, (m) => m.replace(/[^\n]/g, " "));
  return out;
}

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

function runSync(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

runSync("no raw table.column string literal leaks into apps/web/app or apps/web/components", () => {
  const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const roots = [join(webDir, "app"), join(webDir, "components")];
  const hits: string[] = [];
  for (const root of roots) {
    for (const file of listTsxFiles(root)) {
      const src = readFileSync(file, "utf8");
      const sanitized = stripCommentsAndImports(src);
      let match: RegExpExecArray | null;
      STRING_LITERAL_RE.lastIndex = 0;
      while ((match = STRING_LITERAL_RE.exec(sanitized))) {
        const literal = match[0];
        if (GUARDED_TABLE_COLUMN_RE.test(literal)) {
          const line = sanitized.slice(0, match.index).split("\n").length;
          hits.push(`${file}:${line}: ${literal}`);
        }
      }
    }
  }
  assert.deepEqual(hits, []);
});

void main();
