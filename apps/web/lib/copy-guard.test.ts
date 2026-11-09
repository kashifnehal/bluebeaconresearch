// Repo-wide guard (TASK W-COPY Part 7): the per-row "tracked BBR signals"
// sentence was removed from every row and now lives once, inside the
// collapsed "View historical pattern" method note built by
// marketImpactMethodNote() in lib/market-impact-assessment.ts. This fails if
// the phrase reappears in any other source file (a regression would mean
// someone re-added the old inline sentence).
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(dir, "..");
const SCOPE_ROOTS = ["app", "components", "lib"];
const PHRASE = "tracked BBR signals";
const ALLOWED_FILE = "lib/market-impact-assessment.ts";

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

runTest(`"${PHRASE}" appears nowhere outside the method note`, () => {
  const files = SCOPE_ROOTS.flatMap((root) => walk(path.join(webRoot, root)));
  assert.ok(files.length > 50, "expected to find many in-scope source files");

  const violations: string[] = [];
  for (const file of files) {
    const relFile = path.relative(webRoot, file).split(path.sep).join("/");
    if (relFile === ALLOWED_FILE) continue;
    const source = readFileSync(file, "utf8");
    if (source.includes(PHRASE)) violations.push(relFile);
  }

  assert.deepEqual(violations, [], `unexpected "${PHRASE}" outside the method note:\n${violations.join("\n")}`);
});
