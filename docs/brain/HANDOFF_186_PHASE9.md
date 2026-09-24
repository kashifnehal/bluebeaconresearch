# HANDOFF — #186, button/link parity audit + Phase 6 tablet pass, both closed

**Written:** 2026-09-24, end of session. This is the final handoff for this
entire thread's work. It supersedes `HANDOFF_186_PHASE8.md` for "what's
current" purposes — that file is still useful for Phase 1-8 history, but this
file is where you start now.

**Plain-language version first, on purpose.** The previous doc updates this
session (`LIVE_TODO.md`, the changelogs) were written in this repo's normal
dense, back-to-back-facts style — a founder read one and said it was too
dense to follow. This document is written the way that should have been
written: what was broken, why it mattered, what we did about it, in that
order, before any file paths or class names.

**Verified before writing this:** `git log --oneline origin/main..HEAD` is
empty. Every commit below is pushed, not just committed. `tsc --noEmit` is
clean as of the last commit.

---

## 1. What this thread actually did (two pieces of work)

Early in this thread we corrected course. The previous thread had been
comparing the live app against the Stitch mobile mockups (`docs/stitch_mobile/`)
and proposing new features inspired by them. The founder stopped that and
reset the scope to something narrower and more concrete:

> Only fix things that already work on desktop but are broken or missing on
> mobile. No new features. No new data. Go through every button and link and
> make sure it's actually there and actually works on mobile the way it does
> on desktop.

That became two pieces of work:

1. **Button/link parity audit** (this thread numbered it Phase 9, since it's
   not a Stitch-mock phase). Went through the entire codebase looking for
   anything visible on desktop that's invisible or unreachable on mobile.
2. **Phase 6 — the 768px tablet pass.** This was already a known, planned,
   not-yet-started item from before this thread (see prior handoffs). Nobody
   had ever actually opened the app at tablet width (768px, an iPad-ish
   size) and checked whether things fit. This thread did that for the first
   time.

Both are now closed. Nothing new was built — every commit below is either a
CSS/class-level fix or a small UI element that calls a function the app
already had.

---

## 2. Commits, in order, plain-language summary

| # | SHA | What it does, in one sentence |
|---|-----|-------------------------------|
| 1 | `38dfe8b` | Fixed 3 things that exist and work on desktop but were completely invisible on mobile (see §3). |
| 2 | `8d2981f` | Docs update for commit 1 — no code. |
| 3 | `e1b0942` | Fixed a layout bug that was silently squeezing 6 different pages into almost no usable width on tablet-sized screens (see §4). |
| 4 | `5d7d5f2` | Docs update for commit 3 — no code. |

Code-only commits: `38dfe8b`, `e1b0942`. Everything else is documentation.

---

## 3. Button/link parity audit — what was actually wrong, and why

**How we found these, in plain terms:** rather than clicking through every
page by hand (which is slow and easy to miss things with), we searched the
entire codebase for a specific pattern: any element with the CSS instruction
"don't show this below tablet width." That pattern is the *only* way this
app hides things on mobile — there's no other mechanism — so finding every
instance of it and checking each one by hand gives complete coverage. There
were 16 instances. Each one was checked individually: is there a working
substitute for this on mobile, or is it just gone?

**Four real problems found. Three fixed, one left as a decision for you.**

### 3a. "Replay Tour" had no way to trigger it on mobile — FIXED

**What this is:** the app has a guided walkthrough for new users — the thing
that highlights parts of the screen with little callouts the first time you
use the product. First-time users get this automatically on both desktop and
mobile; that part was already working.

**What was broken:** once you'd seen the tour (or skipped it), the *only*
way to watch it again was a small icon in the desktop header. That icon was
coded to not exist at all below tablet width — not hidden in a menu, not
moved anywhere, just gone. A mobile user who wanted to replay the tour had
no way to.

**What we did:** added a "Replay Tour" line to the mobile navigation menu
(the slide-out drawer you get from the bottom "MORE" tab), sitting between
"Help" and "Logout." It calls the exact same underlying function the desktop
icon calls — no new logic, just a new place to trigger existing logic.

**Where:** `apps/web/components/layout/Sidebar.tsx`

**How we know it actually works, not just that the button renders:** we
clicked it in a live browser session and watched the tour's first step
actually appear on screen, then dismissed it. Not just "button exists" —
"button does the thing."

### 3b. The map's tension-score explanation was desktop-only — FIXED

**What this is:** the `/map` page shows a "Global Tension Index" — a number
plus a breakdown into Kinetic Conflict / Cyber Warfare / Diplomatic Friction
percentages. On desktop, there's a small "ⓘ" info icon next to it that
explains, in one sentence, what the score actually means and how it's
derived.

**What was broken:** that explanation only existed in the desktop version of
this panel. The mobile version of the same panel (a bottom sheet you tap to
expand) had the score and the breakdown bars, but no explanation button at
all.

**What we did:** added the identical explanation button to the mobile
version, with the exact same text as desktop.

**Where:** `apps/web/components/map/MobileTensionSheet.tsx`

**A genuine gotcha worth knowing:** the desktop and mobile info buttons
share the exact same accessibility label (`aria-label`). If you ever query
the page for this button by that label, you'll get the desktop one first —
which is invisible on mobile — and think the fix didn't work. You have to
check which one is actually visible, not just which one matches first.
Documented in the component's own comments now so this doesn't trip anyone
up again.

### 3c. Two small info badges were missing from the mobile signal list — FIXED

**What this is:** on the main dashboard feed, there's a "Recent Signal
Stream" — a compact list of signals. Each row can optionally show two small
badges: one flagging that a signal involves a notable public figure/entity
("Media-Impact"), and one showing how well-sourced the signal is ("1
High-Integrity Source" type labels).

**What was broken:** both badges were coded to not show up below tablet
width. Not a huge loss — the Media-Impact badge already shows on the bigger
featured card at the top of the page, and the sourcing badge shows on the
full signal detail page — but if you were just scrolling the compact list on
your phone, you wouldn't see either one.

**What we did:** made both badges show on mobile too, and made sure the row
lets them wrap onto their own line instead of getting cut off or squeezed
when there isn't room.

**Where:** `apps/web/app/(dashboard)/dashboard/page.tsx`

**Confirmed no side effect on desktop:** screenshotted the same row on a
1440px-wide screen before and after — pixel-identical, because desktop
already had room for these and never needed to wrap.

### 3d. Quick View modal — found, NOT fixed, needs your call

Covered in plain language in the previous chat message and again in §7
below. Short version: desktop has a "peek without leaving the page" popup
for each signal row; mobile substitutes a full page visit instead. Nothing
is missing, just different. Left for you to decide, not guessed at.

### 3e. A mistake from the previous thread, corrected

The previous thread's comparison against the Stitch mockups had claimed the
map's Kinetic/Cyber/Diplomatic breakdown "needs to be built" — implying it
didn't exist on mobile yet. That was wrong. It already existed, sitting
behind a "tap to expand" bottom sheet that simply wasn't opened during that
earlier check. No code change was needed for this — just a correction to
what we believed was true. Recorded so nobody accidentally tries to
"build" something that's already there.

---

## 4. Phase 6 — the 768px tablet pass — what was actually wrong, and why

**The size in question:** 768 pixels wide is roughly an iPad in portrait
mode, or a small laptop window. It's bigger than a phone (360-414px) and
smaller than a desktop monitor (1440px+). Nobody had checked this size
before.

**What we did, in plain terms:** loaded every page in the app at exactly
768px wide and checked, per page, whether anything was cut off, overlapping,
or forced into an awkward sideways scroll it shouldn't need. 22 of the 23
checkable pages were tested this way (the 23rd, `/onboarding`, can't be
tested without creating a throwaway account, which is against standing
policy — same as every previous session).

**What we found: one root cause, repeated on 6 different pages.**

Here's the plain version of what was wrong. Picture the screen at 768px
wide. The left 256 pixels are taken up by the sidebar navigation — that's
correct and expected. Six pages (`Backtesting`, `Settings`, `Watchlist`,
an individual watchlist asset page, `Alerts`, and `Calendar`) had also been
built to reserve an *extra* 260 pixels of empty space on the *right* side of
the screen — as if there were a second panel over there. There isn't. No
such panel exists on any of these 6 pages. It was dead space, left over from
what looks like an early design that was never finished or was copied from
a different page (the map page *does* have a real right-hand panel, and it's
likely where this pattern came from).

On a big desktop monitor (1440px or wider), losing 260px to nothing is
barely noticeable — there's still plenty of room left over. That's exactly
why nobody caught this before: it was invisible at the size everyone was
testing on. But at 768px, after the sidebar (256px) and the phantom empty
zone (260px), there were only about 190-250 pixels left for actual content
— not enough room for buttons, cards, or text to lay out properly, so things
got pushed off the edge of the screen.

One of the six pages (`Alerts`) had it even worse: it was *also*
accidentally adding the sidebar's 256px offset a second time on top of the
page-wide layout that already adds it once, so its usable content width was
squeezed even further — almost nothing.

**What we did:** removed the phantom 260px reservation on all 6 pages, and
removed the duplicated sidebar offset on the `Alerts` page. This is a
one-line CSS-class change per file — we didn't move or redesign anything,
we just stopped reserving space for a panel that was never actually there.

**Two small side effects this exposed, also fixed:**
- On the `Watchlist` page, there's a floating "+" button (bottom-right
  corner) for adding a new commodity to track. It had been positioned to
  sit in the middle of that phantom empty zone. Once we removed the empty
  zone, the button would have floated awkwardly in space with nothing
  around it. Moved it to sit at the actual right edge of the real content
  instead.
- On the `Alerts` page, a "sourced from [article title]" link at the bottom
  of each alert match was still slightly too wide to fit even after fixing
  the main bug — it had been sized assuming much more room than actually
  exists on a tablet screen. Gave it a smaller size specifically at tablet
  width (it's still the original, larger size on real desktop).

**A mistake we caught before shipping it — worth recording honestly:** in an
early attempt at the `Alerts` fix, we copied a CSS pattern from the other
5 pages that also removed some top spacing at desktop width. That pattern
was correct for the other 5 pages (they use a different, more complex
positioning technique that needs a matching top-offset elsewhere), but wrong
for `Alerts`, which doesn't use that technique. Applying it as-is would have
made the page's header hide underneath the app's top search bar at desktop
width — a real, visible bug we would have introduced while fixing another
one. We caught this by actually checking how the top search bar is built
(it turns out it's always fixed in place, not just on mobile) before
trusting the copy-paste, and corrected it before any of this was verified or
committed. Nothing broken ever reached a commit.

**One thing that looked like a bug but wasn't:** the `Settings` page has 5
tabs (Account, Notifications, Appearance, Security, Data), and at 768px the
5th one, "Data", sits just past the visible edge. This is not a bug — that
row of tabs already has the ability to scroll sideways built into it on
purpose, so the tab is one swipe away, not lost. Confirmed by checking that
it responds to a sideways scroll correctly. Left as-is.

---

## 5. Files changed — the complete list

**Code (`apps/web/`):**
| File | What changed |
|---|---|
| `components/layout/Sidebar.tsx` | Added the mobile "Replay Tour" menu item (§3a) |
| `components/map/MobileTensionSheet.tsx` | Added the mobile tension-index info tooltip (§3b) |
| `app/(dashboard)/dashboard/page.tsx` | Un-hid the two mobile stream-row badges, added row wrapping (§3c) |
| `app/(dashboard)/backtesting/page.tsx` | Removed the phantom 260px right gap (§4) |
| `app/(dashboard)/settings/page.tsx` | Removed the phantom 260px right gap (§4) |
| `app/(dashboard)/watchlist/WatchlistClient.tsx` | Removed the phantom gap + repositioned the floating "+" button (§4) |
| `app/(dashboard)/watchlist/[symbol]/page.tsx` | Removed the phantom 260px right gap (§4) |
| `app/(dashboard)/alerts/page.tsx` | Removed the phantom gap + the duplicated sidebar offset + resized the source-citation link at tablet width (§4) |
| `app/(dashboard)/calendar/page.tsx` | Removed the phantom 260px right gap (§4) |

**Docs — every file touched this session, in both trees:**
| File | What was added |
|---|---|
| `docs/brain/LIVE_TODO.md` | Two new "Closed, verified" entries — the button audit (§3) and Phase 6 (§4), each with full diagnosis |
| `docs/brain/08_CURRENT_STATUS.md` | Two new status banners at the top, same content as above, shorter |
| `docs/brain/14_CHANGELOG.md` | Two new version entries: `v0.90.0` (button audit) and `v0.91.0` (Phase 6) |
| `docs/brain/06_COMPONENTS.md` | Updated the `Sidebar.tsx` and `MobileTensionSheet.tsx` component descriptions to mention the new additions |
| `docs/claude_project/09_BACKLOG.md` | Added the "Phase 9" row (button audit) to the `#186` table; updated the Phase 6 row from "Not started" to "Done" with a summary; updated the "what's still open" line |
| `docs/claude_project/08_CURRENT_STATUS.md` | Same two new status banners as the brain copy |
| `docs/claude_project/14_CHANGELOG.md` | `PHASE 68` (button audit) and `PHASE 69` (Phase 6) entries |
| `docs/claude_project/06_COMPONENTS.md` | Same component-description updates as the brain copy |
| `docs/brain/HANDOFF_186_PHASE9.md` | **This file.** New. |

**Not touched, and why:** `04_DATABASE.md`, `05_API.md`, `18_AI_ENGINE.md`,
`10_DECISIONS.md` (both trees) — nothing in this session added a table,
column, API route, AI prompt, or a standing "never do X" rule. Everything
was existing-component styling/wiring, not a new decision.

---

## 6. Does any of this affect desktop? Full honest accounting

Short answer: **no functional/logic changes anywhere, and no *visible*
desktop changes except one deliberate, confirmed-good one.** Longer answer,
itemized, because "no impact" as a blanket claim isn't good enough:

- **Replay Tour button, tension tooltip:** both are wrapped in a "mobile
  only, never render on desktop" condition. Confirmed directly — on a
  1440px screen, both are provably absent from the page, not just visually
  hidden.
- **The two stream-row badges:** already visible on desktop before this
  session; this change only affected whether they show *below* desktop
  width. Screenshot-compared at 1440px before/after — identical.
- **The 6-page phantom-gap fix (Phase 6):** this technically *frees up*
  260px of previously-wasted space on every screen size, including desktop.
  At the desktop width we tested (1440px), it made no visible difference,
  because the page content has its own internal maximum width and was
  already narrower than the space available even with the wasted gap
  in place. **Not independently tested on very wide monitors (1920px,
  2560px+)** — theoretically, freeing that space could shift where content
  sits relative to the very edge of an unusually wide screen, though the
  same internal-max-width logic should still prevent any real visual
  change. Flagging this as untested rather than claiming certainty.
- **Watchlist's floating "+" button:** this one *does* visibly move at
  desktop width — deliberately, because its old position only made sense
  when the phantom gap existed. Confirmed via screenshot that its new
  position (bottom-right of the real content, not floating in dead space)
  looks correct and is not overlapping anything.
- **Alerts' source-citation link resize:** unchanged at real desktop width
  (1024px and up) — the resize only applies in the 768-1023px tablet
  range specifically, which is between "mobile" and "desktop" as this
  project defines them.

**No database migrations, no API routes, no AI prompts, no business logic**
touched anywhere in this session. Every commit is CSS-class-level or a
new UI element wired to a function that already existed.

---

## 7. Pending decisions — things that need a founder call, not more engineering

### 7a. Quick View modal — mobile vs. desktop interaction pattern

Explained in full in the chat reply right before this doc, and briefly in
§3d. One-line recap: desktop has an in-place "peek" popup per signal row;
mobile substitutes a full page visit. Not broken, just different. Decide:
build a lightweight mobile popup to match, or accept full navigation as
mobile's version of the same idea.

### 7b. The 6 "new functionality" ideas — full detail sheets below

These are things that came up while doing this work but are explicitly
**not** parity fixes — they don't exist on desktop OR mobile today. Per the
founder's own scope rule for this thread, none of them were built. Full
detail for each, so a code prompt could be written directly from this
section without needing to re-derive anything:

---

#### 1. Price-impact chip on every feed row

**What it is:** a small inline chip on every row of the dashboard's signal
list — not just the big featured card at the top — showing the price move
(up/down and by how much) of whichever asset that signal relates to.

**What it does:** lets someone scanning the list see market context at a
glance, without opening each row individually.

**Why:** the featured card at the top of the page already calculates and
shows this exact number for its one signal. Extending it to every row in the
list reuses that same calculation — no new data source, no new backend
work, just reusing something that already exists more places.

**How we'd build it:** reuse the existing per-signal price-lookup that
powers the featured card; render it as a small chip in each row, after the
timestamp.

**Pros:** cheap (no new data), stays within the "no buy/sell advice" rule
since it's a plain fact not a recommendation, makes the list genuinely more
useful.

**Cons:** adds visual clutter to an already busy row on a narrow phone
screen; some signals don't have a clearly-associated asset, so there needs
to be a clean "—" instead of leaving a blank gap.

**Desktop vs. mobile:** this would be the same feature built once — desktop
doesn't have this on its list rows either, so it's not mobile-only work.
On mobile specifically, the chip needs to survive the existing 2-line
headline limit without wrapping awkwardly; probably sits at the end of the
row's small metadata line.

---

#### 2. A small chart showing how often an alert rule fires

**What it is:** a tiny trend chart under each alert rule's name, showing how
many real signals matched that rule per day over roughly the last one to two
weeks.

**What it does:** answers "is this rule quiet or noisy?" at a glance,
without opening the rule to see its full match history.

**Why:** the data already exists — every rule already shows its list of
past matches with timestamps. This just turns that same real data into a
small visual summary instead of requiring someone to open the list and
count.

**How we'd build it:** take the match timestamps that are already being
fetched (or add a small "count per day" query if not all history is already
loaded), group them by day, draw a small bar or line chart.

**Pros:** entirely real numbers, nothing invented; helps someone notice a
rule is firing way more or less often than they'd expect and adjust its
sensitivity.

**Cons:** needs a decision on the time window (one week? two? a month?) —
that's a product choice, not just an engineering one. Brand new or rarely-
firing rules will show an almost-empty chart, which needs a clear "not
enough history yet" state instead of looking broken.

**Desktop vs. mobile:** same chart, same data, both places. Desktop has
more horizontal room so it could show day labels; mobile would likely just
show the shape plus one number (e.g., "12 matches this week").

---

#### 3. A day-picker strip on the calendar page

**What it is:** a row of the 5 (or 7) days of the current week, shown as
small tappable buttons above the calendar's event list — tap a day, jump to
that day's events instead of scrolling through everything.

**What it does:** pure navigation. It doesn't add or compute anything new —
every event already has a real date; this just makes it faster to jump to a
specific day.

**Why:** the calendar page today is one long continuously-scrolling list.
On a phone, finding "just Thursday's events" means scrolling past everything
else first. A day strip fixes exactly that, with zero new data.

**How we'd build it:** the current week's 5-7 days are already knowable from
the events already being loaded; tapping a day either jumps the list to that
day's section or filters down to just that day (this itself is a small
decision — jump-to vs. filter-to — worth deciding before building).

**Pros:** zero new data, zero backend work, solves a real, current
annoyance on the calendar page.

**Cons:** the jump-vs-filter interaction choice needs to be made first.
Desktop's calendar is shown as a table, not a long scroll, so it doesn't
have this same problem — this is likely mobile-only.

---

#### 4. "Add to your calendar" button on the calendar page

**What it is:** a button that lets someone export the economic calendar's
real events into their own calendar app (their phone's calendar, Google
Calendar, etc.) — either as a downloadable file or a set of "add this to my
calendar" links.

**What it does:** one-time export of data that's already real (the calendar
already uses a genuinely curated, real list of events, not invented data)
into a format other calendar apps understand.

**Why:** genuinely useful for the kind of person this product is for — a
trader who already lives inside a calendar app day to day. Very low risk,
since it's just scheduling information, not a market call or advice.

**How we'd build it:** generate a standard calendar-export file from the
same event data already shown on the page — no new data source needed.

**Pros:** low effort, real value, no compliance concern (it's just dates and
event names, not a recommendation of any kind).

**Cons:** the word "sync" implies it stays updated automatically — this
would actually be a one-time snapshot export unless there's appetite to
build something that keeps updating, which is a much bigger commitment.
Needs to be labeled honestly either way. Also needs a decision: export
everything, or only whatever the person currently has filtered/visible?

**Desktop vs. mobile:** same button both places — on desktop it'd sit in
the existing filter row; on mobile, probably at the bottom of the list
instead, since the filter area is already tight for space there.

---

#### 5. "Recenter" and "switch map layer" buttons on the map

**What it is:** two small map controls — one that snaps the map back to its
default view (useful after you've panned/zoomed around and want to get
back), and one that would switch between different visual layers on the
map, if there's more than one worth switching between.

**What it does:** standard map-app conveniences. Recenter is self-
explanatory. The layer switch depends on whether there's genuinely more than
one way to view the map's data right now.

**Why:** confirmed by checking the code directly — the map doesn't have
either of these today, on desktop or mobile. So this isn't a parity fix (it
wouldn't be restoring anything), it's a genuinely new pair of controls. The
mapping library this app already uses supports both natively, so it's not
a heavy technical lift.

**How we'd build it:** recenter is straightforward — snap the map's camera
back to its starting position, wire it to a new button. The layer switch
first needs an answer to "is there a second layer to switch to yet?" —
there's a known, separate, already-tracked item (chokepoint/pipeline map
overlays) that's currently blocked on a cost decision unrelated to this
work. If that hasn't shipped, there's nothing for a layer switch to
actually switch between.

**Pros:** recenter alone is small, safe, and a genuinely expected control on
any map you can pan around on a phone.

**Cons:** don't build a "switch layer" button with only one layer behind
it — check whether the second layer exists first.

**Desktop vs. mobile:** recenter would sit next to the existing zoom
controls on both. Layer switch is blocked on the separate map-layers
decision regardless of screen size.

---

#### 6. Combine the Status and Accuracy pages into one page with tabs

**What it is:** right now, "is the system healthy?" (`/status`) and "how
accurate have our past signals been?" (`/accuracy`) are two completely
separate pages. This would combine them into one page with a tab switch
between the two.

**What it does:** saves a click for someone who wants to check both. No new
information either way — same two real data sets, just one navigation hop
instead of two.

**Why it's not obviously worth doing:** both pages work fine as they are
today, and — importantly — each has its own shareable link. If someone
bookmarks the status page specifically (a common thing to do for a "is it
down" check), merging them risks breaking that bookmark or landing them on
the wrong tab by default. The case for merging and the case for leaving
them alone are about equally strong.

**How we'd build it:** would need an explicit decision on whether the two
existing web addresses keep working on their own (pointing into a specific
tab of the merged page) or whether they'd be allowed to change.

**Pros:** slightly faster to check both if you want both.

**Cons:** real risk to existing bookmarks/shared links; the benefit is
modest. Of all 6 items here, this is the one most likely to just not be
worth doing.

**Desktop vs. mobile:** identical either way — this is a navigation-
structure decision, not something screen size affects.

---

## 8. What's genuinely still open, all in one place

- **Quick View modal** (§7a) — needs a founder decision, not more
  engineering.
- **The 6 items in §7b** — none approved, none started. Need explicit
  go-ahead per item (or as a batch) before any code prompt gets written
  from them.
- **Nothing else is open in `#186`'s phase table.** Phase 6 (tablet pass)
  and this thread's button/link parity work are both closed as of this
  handoff.
- **`/onboarding`** remains unverifiable live, same as every prior session —
  standing policy against creating a throwaway account just to view one
  page.
- **Very-wide-monitor check** (§6, Phase 6 section) — not independently
  tested past 1440px. Low risk given the reasoning in §6, but stated
  honestly as untested rather than assumed fine.

---

## 9. References — where to look, and in what order

1. **`/CLAUDE.md`** (repo root) — mandatory, standing rules, doc-precedence,
   session-efficiency rules referenced throughout this session's work.
2. **This file.**
3. **`docs/claude_project/21_PROJECT_BRIEFING.md`** — business context,
   needed if evaluating any of the 6 items in §7b for approval.
4. **`docs/brain/LIVE_TODO.md`** — search "#186 button/link parity audit"
   and "#186 Phase 6" for the dense/technical version of everything in §3
   and §4 above, including exact file:line references.
5. **`docs/claude_project/09_BACKLOG.md`**'s `## #186` section — the phase
   table, now showing Phase 6 done and the new Phase 9 row.
6. **Two Claude Artifacts from this session** (not in this repo, per the
   "keep deep research out of the repo" rule — this file's §7b is the
   self-contained copy of the second one, for a tool without artifact
   access):
   - **"Stitch Parity Audit"** — the original mock-vs-live comparison from
     earlier in this thread, before the scope correction. Kept for
     historical reference; **its map-panel finding is superseded by §3e
     above** (it wrongly called the tension breakdown "needs building").
   - **"Button Parity & Feature Specs"** — the artifact this handoff's §3
     and §7b are drawn from and expand on; that artifact's Part 1 findings
     are now updated to show 3 of 4 items as fixed.
7. **Standing memory files** (outside this repo,
   `~/.claude/projects/.../memory/`): `feedback_mobile_verification_rigor`
   and `feedback_functionality_parity_and_stitch_scrutiny` — the
   verification standard this session's work (and this handoff's §3/§4
   claims) were held to.
8. **Git log**: `git log --oneline cf99c8c..5d7d5f2` for this thread's exact
   4-commit sequence, all pushed.

---

## 10. What the next thread should be careful not to break or repeat

- **Don't re-litigate the scope correction.** This thread is UI/parity only.
  Anything in §7b needs an explicit go-ahead before it becomes code.
- **Don't trust the `aria-label` gotcha from §3b** — always check visibility
  (`offsetParent`), not just which element a selector matches first, when
  more than one element could share a label.
- **Don't copy a CSS positioning pattern between pages without checking it
  actually applies** — §4's near-miss (the `alerts` TopBar-clearance
  mistake) happened from doing exactly that.
- **The phantom-260px-gap bug class (§4) might exist elsewhere** — this
  session found and fixed 6 instances via a full-codebase grep, but if a
  new page is ever built by copying an old one, watch for it recurring.
