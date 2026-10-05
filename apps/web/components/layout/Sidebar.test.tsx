import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Sidebar renders inside next/navigation's useRouter/usePathname, which throw
// outside a mounted App Router — renderToStaticMarkup can't exercise it in
// this plain-node test runner. Asserting on source text is the next best
// regression guard: it still fails if the aria-label/title are ever removed
// or detached from the badge span.
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
const source = readFileSync(path.join(dir, "Sidebar.tsx"), "utf8");

runTest("unread count badge carries an 'unread alerts' aria-label and title", () => {
  const badgeMatch = source.match(/\{item\.showBadge && unreadCount > 0 && \(([\s\S]*?)\)\}/);
  assert.ok(badgeMatch, "expected to find the unread-count badge block");
  const badgeBlock = badgeMatch![1];
  assert.match(badgeBlock, /aria-label="unread alerts"/);
  assert.match(badgeBlock, /title="unread alerts"/);
});
