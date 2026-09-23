# HANDOFF — #186 Mobile Responsive Rework, Phase 6/7 in progress

**Written:** 2026-09-24, end of session, moving to a new thread purely for token cost — not because of a blocker.
**Read this whole file before touching anything.** It supersedes `HANDOFF_186_PHASE5.md` (previous handoff, still useful for Phase 1-5b history) — this file picks up from where that one left off.

---

## 1. What this project is, and what this specific work is

Blue Beacon Research (BBR) is a geopolitical intelligence SaaS — converts global events into structured market signals for commodity traders, import/export SMBs, and fund analysts, priced at roughly 1/40th of Bloomberg. Full business context: `docs/claude_project/21_PROJECT_BRIEFING.md` — **read this in full**, not just skimmed; several decisions this session were grounded directly in its positioning/pricing/competitor sections, and the next thread will need that same grounding to evaluate the open recommendations below. Full doc-tree rules and standing engineering policy: `/CLAUDE.md` at repo root — read its "Standing rules" and "Session efficiency" sections, not optional.

**This work stream (#186):** the product was desktop-only; the goal is making it genuinely usable on mobile — UI/layout only, never business logic, algorithms, or data. Phases 1-5b (previous session, see `HANDOFF_186_PHASE5.md`) fixed overflow bugs and tap-targets across all 24 routes. **This session (Phase 6/7) found that "fixed" was not the same as "good"** — see §3.

A parallel input: commit `d10626b` added 15 Stitch-generated mobile mockups under `docs/stitch_mobile/`, one per major screen, plus a design-system doc. **Standing rule for using them (D29/ADR 025): take geometry/layout from Stitch, take copy/data from live code only, never verbatim.** New this session: **D30/ADR 026** — a passing overflow check is not the same as a readable screen; verification needs a nested-overflow DOM walk *and* visual inspection of a real screenshot, not size checks alone.

---

## 2. Everything completed this session — 1 commit, pushed; 3 commits from earlier in the day also pushed

Verified before writing this: `git log --oneline origin/main..HEAD` is **empty**. All 4 of today's commits are pushed, not just committed locally.

| Commit | What |
|---|---|
| `7a71b53` | Homepage footer tap-targets fixed (10 links, not 9 as `HANDOFF_186_PHASE5.md` miscounted — verified and corrected) |
| `061d27f` | `TopBar`/`PublicHeader`/5 auth-page tap-targets fixed, full 24-page discovery sweep run |
| `9aad1ba` | Remaining ~13 per-page dense-control tap-targets fixed (selects, chips, toggles, range buttons) — #186 Phase 5b's tap-target sweep fully closed |
| `0dc48d7` | **Real** overflow bugs found and fixed on `/dashboard` and `/settings` after the founder reported still seeing horizontal-scroll issues despite prior "0px, verified" claims. Root cause: `overflow-y-auto` containers auto-compute `overflow-x: auto` too (real CSS spec behavior), hiding overflow from `document.documentElement`-only checks. Fixed the two overflow bugs; **also fixed the verification method itself** (D30/ADR 026 first version, refined further this session — see §3). |

**Every commit is `className`-only or docs-only** — audited via `git diff` before each commit, confirmed in commit messages and `LIVE_TODO.md`.

**What did NOT get committed, and why:** after `0dc48d7`, an attempted follow-up fix to `/dashboard`'s feed-row headline truncation was written, tested live, found not to actually work, and **reverted** (`git checkout --`) rather than committed. Full diagnosis in §3 — this is important, the next thread should not retry the same approach.

Docs updated in lockstep (per `/CLAUDE.md`'s sync protocol): `docs/brain/LIVE_TODO.md`, `docs/claude_project/{08_CURRENT_STATUS,09_BACKLOG,14_CHANGELOG}.md` (now at PHASE 64), and both `10_DECISIONS.md` files (D30/ADR 026, new this session).

---

## 3. The core finding this session: "fixed" was not the same as "good" — and it happened twice

### 3a. What went wrong

Every #186 phase through PHASE 61 (previous session) verified mobile layouts using only `document.documentElement.scrollWidth - clientWidth`. The founder reported still seeing horizontal-scroll issues on pages already marked "0px overflow, verified." Investigation found the real gap: **any container using `overflow-y-auto` (the main scroll wrapper on `/dashboard`, `/settings`, `/backtesting`, `/watchlist`, `/watchlist/[symbol]`, `/events/[id]`, `/map`) auto-computes `overflow-x: auto` on itself too** — a real, if obscure, CSS Overflow spec rule (if one axis is set to something other than `visible`, the other is forced to `auto` rather than left ambiguous). That creates a second, invisible, independently-scrollable region nested inside the page that never shows up in the document-level number.

Fixed in commit `0dc48d7`: `/dashboard`'s feed rows (headline had no `min-w-0`, so 150px of content including the trailing chevron was pushed off-screen) and `/settings`'s tabs (a 5th "DATA" tab, missed by the earlier tap-target pass's viewport-only measurement).

### 3b. The fix itself then turned out to be insufficient — a second, harder lesson

After `0dc48d7` shipped, the founder pasted a direct side-by-side screenshot: current live `/dashboard` vs. the Stitch mock. The "fixed" (non-overflowing) feed row is **visually near-useless** — headlines truncate to ~8-10 characters ("North Kore...", "Deal or destr..."). The overflow bug was real and the fix genuinely closed it, but the result traded one problem (hidden horizontal scroll) for another (illegible content) — because the fix (`min-w-0 truncate`) let the headline shrink to accommodate everything else, rather than giving the headline itself enough room.

**This is the actual lesson, not just a bug report:** a passing overflow/size check proves nothing is clipped or scrolling invisibly. It does not prove the screen is *usable*. That gap is now D30/ADR 026, in both `10_DECISIONS.md` files.

### 3c. Applying that harder look found two more instances of the identical pattern

Once told to re-check with this in mind, going back over pages previously called "fine":

- **`/alerts`** — an alert rule's own configured name truncates to `"News ..."` (real text: `"News — Middle East — Severity 6+"`). Confirmed via DOM inspection (`className="text-lg font-bold font-headline text-on-surface truncate"`, sharing a `flex items-center gap-3` row with the `ACTIVE` badge). Not fixed.
- **`/calendar`** — the event table's default column order is `Date, Time, Country, Event, Impact, Forecast, Previous, Actual`. A mobile user sees Date/Time/Country by default; the actual **event name** is the 4th column, scrolled off-screen inside the table's own `overflow-x-auto` (which is itself the correct pattern — the bug is column order, not the scroll mechanism). Not fixed.

### 3d. The attempted `/dashboard` fix that was tried and reverted — read this before touching that file again

An edit was written: add `line-clamp-2` to the headline (instead of single-line `truncate`) and add a mobile-only region chip (`item.country`, free — already on the same object used by the featured/hero card). Tested live, and **verified — not assumed — to not work**, specifically ruling out the stale-dev-server-cache issue this exact project has hit twice before (see `HANDOFF_186_PHASE5.md` §6 and this session's own PHASE 63 note): checked via `getComputedStyle`/`getBoundingClientRect` on a fresh render, confirmed `webkitLineClamp: "2"` was genuinely applied and the box was genuinely 48px tall (2 lines worth) — but the box was only **59px wide**. The new region chip (full country names like "UNITED STATES") made the metadata line *more* crowded, not less, leaving even less horizontal room for the headline than before. Wrapping text into a 59px-wide box just produces 2 lines of ~6 characters each — same illegible result, different mechanism.

**Correct diagnosis for the real fix:** the headline needs its own **full-width line**, not a tweak that lets it wrap within whatever horizontal space happens to be left over after the metadata icons/badges claim theirs first. That means a `flex-col` restructure — metadata row (dot, timestamp/freshness, region) on line 1, headline spanning the full row width on line 2 — not a one-line change. `md:` variants must revert to the *exact* current desktop layout (single line, everything inline, unchanged) — this was working and verified correctly reverting at 1440px before the revert; do not regress it.

The change was reverted (`git checkout -- apps/web/app/(dashboard)/dashboard/page.tsx`), not committed — the working tree is currently clean at commit `0dc48d7`'s state for this file.

---

## 4. The full Stitch-mock review — done properly this time, all 14 images actually opened

Earlier in this session, before the founder pushed back, a review of the Stitch mocks was attempted **by re-reading a prior session's summary of them, not by actually opening the images.** The founder caught this directly ("have you really seen and analyzed all the stitch images?") and it was a fair catch — the answer was no. All 14 mock folders under `docs/stitch_mobile/*/screen.png` were then actually opened and visually inspected, cross-referenced against `21_PROJECT_BRIEFING.md`'s positioning/pricing/competitor-table sections.

**Calibration finding worth remembering:** the mock PNGs render at **563px wide**, not a real phone width (360-428px). Some apparent mismatches (e.g., the watchlist mock's 2-column card grid vs. live's 1-column stack) are live correctly adapting a layout that wouldn't fit a real device at all — not gaps to close.

**Per-page verdict** (good = no changes recommended, matches or exceeds the mock's intent at real mobile width):

| Verdict | Pages |
|---|---|
| ✅ Good | `/login`, `/signup`, `/backtesting`, `/status`, `/accuracy`, `/events/[id]`, `/map`, `/settings` (has *more* tabs than the mock), `/watchlist`, `/watchlist/[symbol]` (correlated-signals list already exists, simpler and more honest than the mock — see correction below), `/admin/metrics`, `/admin/service-status`, `/` + pricing (tier names/prices match the mock almost exactly) |
| ⚠️ Needs work — real bug | `/dashboard` (§3b), `/alerts` rule cards (§3c), `/calendar` table (§3c) |
| ❓ Unverifiable live | `/onboarding` — redirects once an account is onboarded; only ever source-audited, never rendered. Standing rule (`/CLAUDE.md` token-discipline section) reserves throwaway-account creation for actual signup-flow testing, not just to look at this one page — do not create one solely for this. |

**Correction to an assumption made earlier in this same session:** it was initially claimed `/watchlist/[symbol]`'s "Correlated Signals" feature doesn't exist and needs event clustering (repeating a note from `HANDOFF_186_PHASE5.md`). On actually checking the live page, it **does** exist — simpler than the mock, and more honest (shows "Not enough price history around this signal to measure a move" instead of fabricating an impact percentage when data is thin). The genuinely-deferred item is the *event-detail* page's "Related Precedent Events" section, which needs cross-event clustering that doesn't exist — don't conflate the two.

### Three specific builds recommended (NOT approved, NOT built — founder has not confirmed scope)

Grounded in `21_PROJECT_BRIEFING.md`'s stated differentiators (personalized alerts + backtesting vs. WorldMonitor; price vs. Bloomberg) and its explicit warning: *"Never add features competing with WorldMonitor on breadth (more data feeds, data layers)."*

1. **Dashboard:** a compact, real price-impact chip per feed row (data already computed for the hero/featured card — free). Explicitly **not** a CARDS/STREAM view toggle (the mock offers one) — that's UI surface area for a preference nobody asked for.
2. **Alerts:** a lightweight "recent matches" sparkline using real matched-signal counts. Explicitly **not** the mock's embedded map thumbnail per alert or its fabricated "price elasticity" stat — decoration that doesn't make an alert more useful, and edges into the "compete on breadth" trap the briefing doc warns against.
3. **Calendar:** a weekly day-picker strip (pure navigation, zero new data). Explicitly **not** the mock's per-event volatility forecast — BBR doesn't compute that number today, and inventing one edges toward the no-buy/sell-recommendation line.

Standing exclusion, everywhere, reconfirmed: georisk indices, implied-vol stats, "Sentinel"/"Autonomous Agent" AI branding, price-target directional calls, fake SLA/latency numbers, military-clearance copy (all already covered by D29/ADR 025).

---

## 5. Issues/doubts hit and resolved this session

- **"Is this a stale dev-server cache issue again?"** — this exact project hit a genuine Turbopack stale-file-watcher bug twice in the previous session (`HANDOFF_186_PHASE5.md` §6). When the `line-clamp-2` fix (§3d) appeared not to work, this was the first suspicion. Explicitly ruled out this time via `getComputedStyle` inspection proving the CSS *was* applied correctly — the fix was verified as genuinely insufficient, not stale. Worth this habit continuing: before concluding "the fix didn't work," rule out staleness first, the way this session did.
- **"Have you actually looked at the images, or are you inferring?"** — caught directly by the founder, and the honest answer was no at first. Resolved by actually opening and describing all 14 mock PNGs (§4) rather than continuing to reason from a prior session's notes.
- **"Do you still think current is better than Stitch?"** — after seeing a direct screenshot comparison, the honest answer flipped from "dashboard is fine" to "no, it's genuinely worse, I was too quick to defend it." This is now the standing lesson behind D30/ADR 026 — don't certify a screen "done" on structural/overflow grounds alone.

---

## 6. What's still open — in priority order

### 6a. Phase 7 — fix the 3 readability bugs found this session (ready to start, diagnosis done)

1. **`/dashboard` feed rows** — restructure to `flex-col` (metadata line, then full-width headline line) per the exact diagnosis in §3d. Do not retry `line-clamp-2`-within-the-existing-row alone; it's been tried and confirmed insufficient.
2. **`/alerts` rule cards** — same underlying pattern (title crowded on one line with a status badge). Give the rule name its own line or enough room to read fully.
3. **`/calendar` event table** — reorder columns so `Event` is visible by default (before `Country`, ideally right after `Date`/`Time`), or consider adopting the mock's stacked-card pattern instead of a table for mobile specifically (table stays for desktop). This is the one place this session judged the mock's actual layout choice as genuinely better for mobile, not just a style preference.

**Verification standard for all three (D30/ADR 026): a real screenshot, inspected by eye, not just a passing overflow check.** Also apply the two-check rule from `feedback_functionality_parity_and_stitch_scrutiny` (memory) — verify by interaction (click through, confirm the underlying data/link still works), not just visual size.

### 6b. The three recommended Stitch-inspired builds (§4) — need founder go-ahead before starting

Not scoped as tickets yet because they haven't been approved. If approved, each should get its own `LIVE_TODO.md`/`09_BACKLOG.md` entry before work starts (per the sync protocol).

### 6c. Phase 6 — 768px tablet pass — still not started

Only `/alerts` (183px overflow, tracked, expected) and `/calendar` (0px, clean) have been measured at 768px. The other 22 routes have not. Now that D30/ADR 026 is standing policy, this pass must include the nested-overflow check and real screenshots, not just the document-level number.

### 6d. Lower priority — final unresponsive-file sweep

From the original Phase 1 audit (~59 files with zero Tailwind breakpoint prefixes). Most have been fixed or confirmed already-safe by construction (fluid width + max-width patterns are common false positives here — see `HANDOFF_186_PHASE5.md` §6). Not urgent.

---

## 7. Patterns and mistakes worth knowing before you start (carried forward + new)

**From this session:**
- **A size/overflow check passing is not the same as a screen being good.** Always look at a real screenshot. (D30/ADR 026 — the core lesson of this entire session.)
- **When you think you've fixed something, verify by re-measuring the specific thing that was wrong** (e.g., box width, not just "does line-clamp apply") — don't just re-run the same overflow check and call it done.
- **Rule out dev-server staleness explicitly before concluding a fix doesn't work** — this project's Turbopack setup has shown this exact failure mode twice.
- **Actually open reference images/docs before reasoning about them** — summarizing a summary compounds errors. If asked "have you seen X," the honest answer matters more than a plausible-sounding one.
- **The Stitch mocks render at 563px, not real phone width** — factor this into any future mock-vs-live comparison; don't flag a column-count or density difference as a gap without checking whether the mock's own layout would even fit a real device.

**Carried forward from `HANDOFF_186_PHASE5.md` (still true, not re-verified this session, no reason to doubt them):**
- Grep for exact bug patterns across the whole codebase rather than re-reading files one at a time when you find one instance of a bug class.
- "Zero Tailwind breakpoint prefix" does not mean broken — many components are fluid-by-construction.
- Check import counts before touching any file that looks unresponsive or dead.
- Use one long-running `next dev` server; avoid repeated restarts unless there's hard evidence of a stale build (see PHASE 63's justified one-time restart for the actual protocol: gather evidence first, then restart once).
- Passwords are never typed by the agent; `/onboarding` stays source-audited only, per standing policy.

---

## 8. Files and docs the next thread should read first

1. **`/CLAUDE.md`** (repo root) — mandatory, doc-precedence rule, sync protocol, standing engineering rules.
2. **This file.**
3. **`docs/claude_project/21_PROJECT_BRIEFING.md`** — business context (positioning, pricing, competitors). Needed to evaluate the three recommended builds in §4.
4. **`docs/brain/LIVE_TODO.md`**, the `#186 responsive rework` block under "Priority queue update — 2026-09-10/11" — the full evidence trail for Phase 7's three bugs, including the exact reverted-fix diagnosis. Long, but primary source, not a summary.
5. **`docs/claude_project/09_BACKLOG.md`**, the `## #186 — FULL RESPONSIVE REWORK` section — phase table now through Phase 7.
6. **`docs/claude_project/10_DECISIONS.md`** D28/D29/D30, and **`docs/brain/10_DECISIONS.md`** ADR 024/025/026 — standing rules, don't re-litigate.
7. **`docs/stitch_mobile/tactical_intelligence_terminal/DESIGN.md`** — canonical design system.
8. **`HANDOFF_186_PHASE5.md`** (previous handoff) — Phase 1-5b history, the earlier stale-cache incident, the MapLibre canvas-click technique if map interaction testing is needed again.
9. Git log: `git log --oneline bb14b6b..0dc48d7` for this session's exact commit sequence (4 commits, all pushed).

---

## 9. What the next thread must be careful not to break or repeat

- **Do not retry the `line-clamp-2`-in-place fix on `/dashboard`'s feed rows** — tried, verified not stale-cache, confirmed insufficient (§3d). The real fix is a `flex-col` restructure with the headline on its own full-width line.
- **Do not mark `/dashboard`, `/alerts`, or `/calendar` "done" based on an overflow check alone** — that is exactly the mistake that produced this whole session. Screenshot and look.
- **Do not start building the 3 recommended Stitch-inspired features (§4) without founder confirmation** — they are recommendations, not approved scope.
- **Do not create a throwaway account just to view `/onboarding`** — reserved for actual signup-flow testing per standing policy.
- **Do not copy any string verbatim out of a Stitch `code.html`** — D29/ADR 025, still in force. Geometry only.
- **Desktop must not regress.** Every fix in this session was verified reverting correctly at 1440px before being called done (except the reverted `/dashboard` attempt, which never got that far because it failed at mobile width first).

---

## 10. First prompt for the new thread

Paste this verbatim to start the next session:

```
We're continuing #186, the mobile responsive rework of Blue Beacon Research. This is a
fresh thread started purely to save token cost — the previous session did substantial
work and left a full handoff. Do NOT re-derive context from scratch, and do NOT assume
anything marked "done" in an older summary is actually good — this exact project just
had a real incident where "0px overflow, verified" turned out to mean "technically not
broken, but the headline is unreadable." Verify, don't assume.

First: read /CLAUDE.md at the repo root in full. Then read docs/claude_project/
21_PROJECT_BRIEFING.md in full (business context — you'll need it to evaluate open
recommendations). Then read docs/brain/HANDOFF_186_PHASE6.md in full — it has the
complete current state, exactly what was found broken this session and why, a precise
diagnosis for each open bug (including one attempted fix that was tried and reverted —
do not retry it), and three recommended-but-not-approved UI builds. Skim
docs/brain/LIVE_TODO.md's #186 block for the full evidence trail behind that handoff's
summary, and docs/claude_project/10_DECISIONS.md's D28-D30 for standing rules.

Confirm your own understanding before doing anything: what #186 is, what's shipped and
pushed (verify with git log/git status yourself, don't trust the handoff's claim blindly),
the standing rules (no Playwright, mobile-first 360px floor, Stitch mocks are
layout-reference-only, D30's "screenshot + nested-overflow check, not size checks alone"
verification standard), and the current priority: Phase 7's three readability bugs
(/dashboard feed rows, /alerts rule-name truncation, /calendar table column order) —
diagnosed, not fixed.

Do your own spot-check before trusting the handoff fully: re-screenshot /dashboard,
/alerts, and /calendar's event list at 375px and confirm the three described problems
still look the way the handoff describes them. If anything doesn't match, say so before
proceeding rather than building on a stale assumption.

Then: fix the three Phase 7 bugs, verifying each with both a nested-overflow DOM check
AND a real inspected screenshot (D30/ADR 026) plus an interaction check (click through,
confirm the link/data still works) before calling any of them done. After that, either
start Phase 6 (768px tablet pass, not started) or the three recommended builds — ask the
founder which, since the builds need explicit go-ahead first.
```
