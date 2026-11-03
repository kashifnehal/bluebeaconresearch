// Source-text guard (reads file contents, does not render anything): TASK
// UI-TYPE raised every in-scope tiny text size to the 11px type-scale floor
// (see PART 2/3). This fails if a text-[8px]/[9px]/[10px] class (with or
// without an md: prefix) or an inline fontSize under 11 reappears, outside
// the documented exceptions below.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(dir, "..");
const dashboardRoot = path.join(webRoot, "app", "(dashboard)");
const componentsRoot = path.join(webRoot, "components");

const TINY_TEXT_CLASS = /text-\[(8|9|10)px\]/;
// Matches fontSize: 8 / "8px" / '8' etc., including Recharts tick={{ fontSize: 10 }}.
const INLINE_FONT_SIZE = /fontSize:\s*['"]?(\d{1,2}(?:\.\d+)?)(?:px)?['"]?/g;

type AllowEntry = { file: string; snippet: string; reason: string };

// One entry per exception found during PART 3. Matched by file + a unique
// substring of the violating line, not by line number, so an unrelated edit
// elsewhere in the file doesn't silently break this list.
const ALLOW_LIST: AllowEntry[] = [
  {
    file: "components/ui/InfoCitation.tsx",
    snippet: 'h-3.5 w-3.5 items-center justify-center rounded-full border border-on-surface-variant/50 text-[9px]',
    reason: "fixed 14x14px circular info-icon trigger holding one character; 11px overflows the circle",
  },
  {
    file: "components/layout/TopBar.tsx",
    snippet: 'fontSize: "10px"',
    reason: "fixed 32x32px avatar circle holding two-character initials; 11px overflows the circle",
  },
  {
    file: "components/layout/MobileTabBar.tsx",
    snippet: 'text-[10px] uppercase tracking-wide',
    reason: "bottom-nav tab label, fixed-width flex-1 slot (~75px at phone width); 'Watchlist' is already tight at 10px uppercase+tracking-wide",
  },
  {
    file: "components/layout/MobileTabBar.tsx",
    snippet: 'text-[10px] uppercase tracking-wide',
    reason: "second tab label sharing the same fixed-width flex-1 slot as the first",
  },
  {
    file: "components/layout/MobileTabBar.tsx",
    snippet: 'min-w-[14px] text-center',
    reason: "unread-count badge dot, fixed min-w-[14px] box",
  },
  {
    file: "app/(dashboard)/watchlist/[symbol]/page.tsx",
    snippet: 'tick={{ fontSize: 10, fontFamily: "monospace" }}',
    reason: "Recharts axis tick label",
  },
  {
    file: "app/(dashboard)/watchlist/[symbol]/page.tsx",
    snippet: 'tick={{ fontSize: 10, fontFamily: "monospace" }}',
    reason: "Recharts axis tick label",
  },
  {
    file: "app/(dashboard)/watchlist/[symbol]/page.tsx",
    snippet: 'tick={{ fontSize: 10, fontFamily: "monospace" }}',
    reason: "Recharts axis tick label",
  },
  {
    file: "app/(dashboard)/watchlist/[symbol]/page.tsx",
    snippet: 'tick={{ fontSize: 10, fontFamily: "monospace" }}',
    reason: "Recharts axis tick label",
  },
  {
    file: "components/signals/MarketImpactChart.tsx",
    snippet: 'tick={{ fontSize: 10, fontFamily: "monospace", fill: "var(--text-muted)" }}',
    reason: "Recharts axis tick label",
  },
  {
    file: "components/signals/MarketImpactChart.tsx",
    snippet: 'style={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "monospace" }}',
    reason: "Recharts axis label style",
  },
  {
    file: "components/signals/DriverBreakdownChart.tsx",
    snippet: 'tick={{ fontSize: 10, fontFamily: "monospace" }}',
    reason: "Recharts axis tick label",
  },
  {
    file: "components/signals/DriverBreakdownChart.tsx",
    snippet: 'tick={{ fontSize: 10, fontFamily: "monospace" }}',
    reason: "Recharts axis tick label",
  },
  {
    file: "components/assets/PositioningPanel.tsx",
    snippet: 'tick={{ fontSize: 10, fontFamily: "monospace" }}',
    reason: "Recharts axis tick label",
  },
  {
    file: "components/assets/PositioningPanel.tsx",
    snippet: 'tick={{ fontSize: 10, fontFamily: "monospace" }}',
    reason: "Recharts axis tick label",
  },
];

function isExcludedDir(relPath: string, scope: "dashboard" | "components"): boolean {
  const segments = relPath.split(path.sep);
  if (scope === "dashboard") return segments.includes("calendar");
  if (segments.includes("marketing")) return true;
  const base = path.basename(relPath);
  return base.startsWith("PublicHeader");
}

function walk(root: string, scope: "dashboard" | "components"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    const rel = path.relative(scope === "dashboard" ? dashboardRoot : componentsRoot, full);
    if (isExcludedDir(rel, scope)) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full, scope));
    } else if (/\.(tsx?|TSX?)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
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

runTest("no text-[8px|9px|10px] class or inline fontSize under 11 in scope, outside the allow-list", () => {
  const files = [...walk(dashboardRoot, "dashboard"), ...walk(componentsRoot, "components")];
  assert.ok(files.length > 20, "expected to find many in-scope source files");

  const remainingAllow = ALLOW_LIST.map((entry) => ({ ...entry, consumed: false }));
  const violations: string[] = [];

  for (const file of files) {
    const webRelRoot = webRoot;
    const relFile = path.relative(webRelRoot, file).split(path.sep).join("/");
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");

    lines.forEach((line, idx) => {
      const hits: string[] = [];
      if (TINY_TEXT_CLASS.test(line)) hits.push(line.match(TINY_TEXT_CLASS)![0]);
      let m: RegExpExecArray | null;
      INLINE_FONT_SIZE.lastIndex = 0;
      while ((m = INLINE_FONT_SIZE.exec(line))) {
        if (Number.parseFloat(m[1]) < 11) hits.push(m[0]);
      }
      if (hits.length === 0) return;

      for (const hit of hits) {
        const allowed = remainingAllow.find(
          (a) => !a.consumed && a.file === relFile && line.includes(a.snippet),
        );
        if (allowed) {
          allowed.consumed = true;
        } else {
          violations.push(`${relFile}:${idx + 1}: ${hit} -> ${line.trim()}`);
        }
      }
    });
  }

  assert.deepEqual(violations, [], `unexpected tiny-text violations:\n${violations.join("\n")}`);

  const unconsumed = remainingAllow.filter((a) => !a.consumed);
  assert.deepEqual(
    unconsumed.map((a) => `${a.file}: ${a.snippet}`),
    [],
    `allow-list entries that no longer match anything (stale, remove them):\n${unconsumed
      .map((a) => `${a.file}: ${a.snippet}`)
      .join("\n")}`,
  );
});
