// Repo-wide guard (TASK NQ-2 Part 5): the public surface must not resurrect
// the performance-claim wording TASK NQ-2 removed. Fails if any of PHRASES
// reappears outside a test file. "hit rate" additionally allows the admin
// dashboard (internal, not the public surface) and two pre-existing,
// non-claim uses listed in ALLOWED_HIT_RATE_FILES below.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(dir, "..");
const repoRoot = path.join(webRoot, "..", "..");
const SCOPE_ROOTS = ["app", "components", "lib"];
const BACKEND_FILE = "apps/backend/src/lib/search-catalog.ts";

const PHRASES = [
  "published track record",
  "hit rate",
  "fabricated model",
  "as our sources publish them",
  "See the accuracy record",
];

// Pre-existing, non-claim uses of "hit rate" that are not the thing this
// guard exists to catch: one explicitly disclaims a hit rate, the other is
// a dated corrections-log entry quoting a past wrong caption, not a live
// claim. Listed here (and in the task report) rather than silently excluded.
const ALLOWED_HIT_RATE_FILES = new Set([
  "app/page.tsx", // "Uncertainty for this assessment — not a hit rate"
  "lib/corrections-log.ts", // quotes the wrong caption the 2026-11-08 correction fixed
]);

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
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

runTest("no removed-wording phrase reappears outside test files, the admin dashboard, or the listed exceptions", () => {
  const webFiles = SCOPE_ROOTS.flatMap((root) => walk(path.join(webRoot, root)));
  assert.ok(webFiles.length > 50, "expected to find many in-scope web source files");

  const checked: { relPath: string; source: string }[] = webFiles.map((file) => ({
    relPath: path.relative(webRoot, file).split(path.sep).join("/"),
    source: readFileSync(file, "utf8"),
  }));
  checked.push({
    relPath: BACKEND_FILE,
    source: readFileSync(path.join(repoRoot, BACKEND_FILE), "utf8"),
  });

  const violations: string[] = [];
  for (const { relPath, source } of checked) {
    const lower = source.toLowerCase();
    for (const phrase of PHRASES) {
      if (!lower.includes(phrase.toLowerCase())) continue;
      if (phrase === "hit rate") {
        if (relPath.startsWith("app/(dashboard)/admin/")) continue;
        if (ALLOWED_HIT_RATE_FILES.has(relPath)) continue;
      }
      violations.push(`${relPath}: "${phrase}"`);
    }
  }

  assert.deepEqual(violations, [], `unexpected removed wording:\n${violations.join("\n")}`);
});
