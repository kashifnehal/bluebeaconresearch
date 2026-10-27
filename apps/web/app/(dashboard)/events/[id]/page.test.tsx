import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This page cannot be rendered in the plain-node/tsx test harness: it imports
// EventLocationMap, which does `import "maplibre-gl/dist/maplibre-gl.css"` —
// a bare CSS import with no loader outside Next's own build pipeline, which
// throws (confirmed by hand before adding this test; same constraint class as
// WatchlistClient.test.tsx's useSearchParams note, but unrecoverable here with
// a context Provider since it's a module-resolution failure, not a missing
// context). Source-text assertion only, per TASK UI-ALL Part 5's own fallback
// for this exact case.

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

const dir = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(dir, "page.tsx"), "utf8");

runTest("the fixed 'Acknowledge Status: ACTIVE' label is gone (no acknowledge feature exists)", () => {
  assert.doesNotMatch(source, /Acknowledge Status/);
});
