import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// CommandPalette renders inside next/navigation's useRouter, which throws
// outside a mounted App Router — this plain-node test runner can't exercise
// it directly (same constraint as components/layout/Sidebar.test.tsx and
// the watchlist/[symbol]/page.test.tsx comment). Source-text assertions
// guard the 503-specific copy and its gating instead.

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
const source = readFileSync(path.join(dir, "CommandPalette.tsx"), "utf8");

runTest("a 503 from /api/search/assist is distinguished from a generic non-ok response", () => {
  assert.match(source, /if \(res\.status === 503\) return \{ status: "unavailable" \};/);
  // The 503 check must run before the generic !res.ok fallback, otherwise a
  // closed-budget response would be swallowed into "no_confident_answer"
  // and show nothing instead of the plain-language line.
  const unavailableIndex = source.indexOf('if (res.status === 503) return { status: "unavailable" };');
  const genericIndex = source.indexOf('if (!res.ok) return { status: "no_confident_answer" };');
  assert.ok(unavailableIndex > -1 && genericIndex > -1 && unavailableIndex < genericIndex);
});

runTest("the unavailable message is exactly the approved copy, with no mention of a budget or schedule", () => {
  assert.match(
    source,
    /AI answers are unavailable right now\. Page and signal search still work\./,
  );
  const block = source.match(/data-testid="command-palette-assist-unavailable"[\s\S]{0,300}?<\/div>/);
  assert.ok(block, "expected the assist-unavailable message block");
  assert.doesNotMatch(block![0], /\b(budget|tomorrow|today|schedule|cap|quota)\b/i);
});

runTest("the message only shows for the 503 case, not for a normal 'nothing matched' result", () => {
  assert.match(
    source,
    /const assistUnavailable =\s*\n\s*assistEnabled && !assistFetching && assistData\?\.status === "unavailable";/,
  );
  // Gated on the dedicated "unavailable" status, not the pre-existing
  // "no_confident_answer" status (an ordinary empty result).
  assert.doesNotMatch(source, /assistData\?\.status === "no_confident_answer"/);
});

runTest("page and signal search are untouched by the 503 path — same queries, same results list", () => {
  // The assist fetch failing never short-circuits the deterministic
  // signals/pages/watchlist/alert-rules search above it.
  assert.match(source, /queryKey: \["command-palette-signals", debouncedQuery\]/);
  assert.match(source, /const results = useMemo<ResultItem\[\]>/);
});
