// Source-text guard (reads file contents, does not render anything): every
// page.tsx / *Client.tsx under app/(dashboard) must import PageShell, except
// a documented allow-list of thin wrappers or out-of-scope pages for TASK UI-ALL.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.join(dir, "..", "app", "(dashboard)");

const ALLOW_LIST: Record<string, string> = {
  "calendar/page.tsx": "out of scope for TASK UI-ALL (HARD LIMITS: do not touch the calendar page)",
  "map/page.tsx": "out of scope for TASK UI-ALL (HARD LIMITS: do not touch the map page)",
  "events/[id]/page.tsx": "out of scope except the one label change in PART 5; not moved onto PageShell",
  "watchlist/page.tsx": "thin wrapper around WatchlistClient.tsx, which imports PageShell",
  "archive/page.tsx": "thin wrapper around ArchiveClient.tsx, which imports PageShell",
};

function walk(d: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(d)) {
    const full = path.join(d, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (entry === "page.tsx" || entry.endsWith("Client.tsx")) out.push(full);
  }
  return out;
}

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

runTest("every dashboard page.tsx/*Client.tsx imports PageShell, or is on the documented allow-list", () => {
  const files = walk(dashboardRoot);
  assert.ok(files.length > 5, "expected to find multiple dashboard pages");
  const missing: string[] = [];
  for (const file of files) {
    const rel = path.relative(dashboardRoot, file);
    if (rel in ALLOW_LIST) continue;
    const source = readFileSync(file, "utf8");
    if (!/from ["']@\/components\/layout\/PageShell["']/.test(source)) {
      missing.push(rel);
    }
  }
  assert.deepEqual(missing, [], `pages missing PageShell import: ${missing.join(", ")}`);
});
