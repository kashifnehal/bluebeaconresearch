# R3 — Why only ~52% of new signals get `event_category`

**Type:** Investigative finding (research-only, no code changes).
**Scope:** every write site for `signals.event_category`. `apps/backend/src/services/claude.service.ts` and `apps/backend/src/workers/` were read but not modified, per task instructions.
**Data source:** live production Supabase project `evavcgfmemwryggdkjmx`, queried directly (see Methodology). All percentages below are measured, not estimated, unless marked GUESS.

## Answer, short version

Coverage is not one bug. Two proven, additive causes account for essentially all of the gap in *recently created* signals, plus two proven historical artifacts that make older windows look far worse than they are:

1. **Heuristic-fallback classifications never set `event_category` — proven by code and by data, and currently the dominant cause.** When Anthropic's daily ingestion budget is exhausted (or the client/API call fails), `classifyEvent()` falls back to a keyword heuristic that has no article to read and cannot populate the materiality-gate fields at all. Every heuristic row in the sampled windows has `event_category = NULL`, with no exceptions. This directly matches the open item already logged in `docs/brain/08_CURRENT_STATUS.md` / this file's parent CLAUDE.md: *"Anthropic API credit — restore real Claude classification (heuristic fallback currently covering)."*
2. **The cross-source merge path never writes `event_category` on an update — proven by code, not yet observed causing a miss in the sampled data (small merge sample).** `insertOrMergeSignal()` in `signal-merge.ts` only sets `event_category` in the fresh-insert branch. Both the duplicate-update and escalation-update branches omit it entirely, so a signal whose *first* insert landed with a null category (heuristic fallback, or a pre-migration row) stays null forever, even after later cross-source articles bring in a real Claude classification.
3. **A one-time deploy-ordering gap on 2026-09-13 — proven by data, bounded, not ongoing.** The schema migration that added the column landed before the code that populates it went live; 16 real Claude-classified rows from that day have every materiality-gate field null together (not just `event_category`), which rules out a sanitizer rejection and points specifically at an old code path running briefly after the new column existed.
4. **Rows created before the 2026-09-13 migration inherently have no category — proven by data, expected, not a bug.** The column didn't exist yet. This is why 30/60-day windows show much lower coverage (6.0% / 1.4%) than the 14-day window (54.3%) — those denominators are dominated by pre-migration history that was never supposed to have this field.

A fifth mechanism exists in code but was **not observed firing** in the sampled data — see "Unconfirmed / code-only" below.

## Write-site inventory

| # | File : line | Write? | When it's skipped |
|---|---|---|---|
| 1 | `apps/backend/src/workers/signal-merge.ts:250` | Yes — `event_category: classification.eventCategory ?? null` | Only reached on a **fresh insert** (no merge candidate found). Null whenever `classification.eventCategory` is null (heuristic fallback, or a sanitizer-rejected value — see below). |
| 2 | `apps/backend/src/workers/signal-merge.ts:296-318` (duplicate-merge `update`) | **No** — the update payload (`raw_event_ids`, `sources_count`, `updated_at`, optional `event_date`) does not include `event_category` at all | Always skipped on this branch. The existing signal's category (whatever it was at first insert) is never touched, even if the new incoming classification has a real category. |
| 3 | `apps/backend/src/workers/signal-merge.ts:320-335` (escalation-merge `update`) | **No** — same shape, adds only `severity` | Same as above: never writes `event_category`, regardless of the new classification. |
| 4 | `apps/backend/src/workers/acled-collector.ts:144` | Yes — `event_category: classification.eventCategory ?? null` | Direct insert (ACLED does not go through `insertOrMergeSignal`). Null whenever `classification.eventCategory` is null. |
| 5 | `apps/backend/src/workers/reconciliation.ts:159` | Yes — `event_category: classification.eventCategory ?? null` | Direct insert (reconciliation does not go through `insertOrMergeSignal` either). Null whenever `classification.eventCategory` is null. |
| 6 | `apps/backend/src/workers/ai-classifier.ts:90-111` | **No** — the insert object omits the `event_category` key entirely (not even `null` is passed explicitly; the column just defaults to `NULL`) | This worker is explicitly dormant: line 116-127's own comment states nothing currently enqueues jobs onto the `aiClassification` queue, so this path contributes 0% of live signals today. Flagged because if it is ever reactivated (the comment itself warns about this), it will insert with `event_category` always null until someone adds the field — a latent bug, not a live one. |

Rows 1, 4, 5 are gated by the same upstream condition (`materiality_pass === true` — checked by each collector right after `classifyEvent()` returns; a `false` result skips the `signals` insert entirely, so materiality-gate rejections are **not** a cause of null `event_category` on existing rows — they're a separate "never became a signal" bucket).

## Why `classification.eventCategory` itself is null (upstream of every insert site)

Read from `claude.service.ts` (not modified):

- **Heuristic fallback** (triggered when `isAnthropicBudgetAvailable("ingestion")` is false, or the Anthropic call/JSON-parse fails): `heuristicClassify()` has no real article read and, per the type's own doc comment (`claude.service.ts:222-233`), never attempts `relevance`/`novelty`/`eventCategory`/`marketMechanism`/`sourceConfirmation` — only `materialityPass` + `materialityReasoning` are set. This is a documented, intentional limitation, not a bug in the heuristic itself.
- **Sanitizer rejection** (`sanitizeEventCategory()`, `claude.service.ts:926-929`): if Claude returns a value outside the fixed 9-value allowlist, it's coerced to `null` rather than trusted into a column with a CHECK constraint. **Code-only finding — not observed in the sampled data.** The live DB constraint (verified directly against `pg_constraint`, not just the migration file) uses exactly the same 9 values as the sanitizer's allowlist and the prompt text (`claude.service.ts:440`), so there is currently no naming mismatch between what Claude is asked for, what the sanitizer accepts, and what the DB allows. This path could still fire on a genuinely malformed/hallucinated response; it just didn't account for any of the nulls we traced.
- **Deploy-ordering gap** (see cause #3 above): a claude-classified row can have `eventCategory` null not because of either mechanism above, but because the code version that ran that day never asked the model for it.

## Data behind this (methodology)

Project: `evavcgfmemwryggdkjmx` (Supabase, "The Blue Zone"). All queries run directly against `public.signals` / `public.raw_events` / `public.anthropic_daily_usage`; no Playwright, no dev server — per the project's session-efficiency rules, this was a data-correctness question, so it was answered with direct SQL.

| Window | Total signals | With `event_category` | % |
|---|---|---|---|
| Last 1 day | 5 | 5 | 100.0% |
| Last 3 days | 30 | 30 | 100.0% |
| Last 7 days | 47 | 32 | 68.1% |
| **Last 14 days** | **70** | **38** | **54.3%** ← closest match to "about 52%" |
| Last 30 days | 713 | 43 | 6.0% |
| Last 60 days | 2,996 | 43 | 1.4% |

Breakdown of the last-14-days window by classification path:

| `classification_method` | merged (`sources_count > 1`)? | rows | with `event_category` |
|---|---|---|---|
| `claude` | no | 36 | 36 |
| `claude` | yes | 2 | 2 |
| `heuristic` | no | 32 | 0 |

**Every single row missing `event_category` in this window is a heuristic-fallback row (32/32). Every claude-classified row in this window has a category, merged or not.** In this specific sample the merge-path gap (cause #2) didn't fire — the merge candidates here happened to already carry a category — but the code path that would cause it to fire on an older base signal is real and unconditional; it just needs a base signal whose *first* insert was null.

The 30/60-day collapse is fully explained by migration timing: splitting `classification_method = 'claude'` rows by `created_at >= 2026-09-13` (the migration's date) and by merge status:

| Post-migration? | Merged? | rows | with `event_category` |
|---|---|---|---|
| No (pre-migration) | no | 47 | 0 |
| No (pre-migration) | yes | 1 | 0 |
| Yes | no | 57 | 41 |
| Yes | yes | 2 | 2 |

All 48 pre-migration claude rows: null, because the column didn't exist at insert time. Of the 57 post-migration, non-merged claude rows, 16 are null — and every one of those 16 was created on 2026-09-13 between 02:00 and 09:30 UTC, with `relevance`, `novelty`, `source_confirmation`, and `market_mechanism` **also** null on the same rows. All-fields-null together, clustered in one ~7.5 hour window on the migration's own date, is the deploy-ordering signature (cause #3) — not a sanitizer rejection, which would leave the *other* fields populated.

All 2,953 signals currently missing `event_category` (all-time) still have a resolvable `raw_events` row via `raw_event_ids` (verified directly — `2953 / 2953`), so nothing here is unrecoverable for a backfill; it would require re-classification, not a data-recovery exercise.

## Backfill cost estimate (sourced, not guessed)

`public.anthropic_daily_usage` (bucket = `'ingestion'`) has real historical call-level aggregates for this exact model/call shape:

- 1,981 ingestion calls, 4,195,850 input tokens, 583,697 output tokens, $7.1955 total recorded spend.
- Average ≈ 2,118 input tokens / 295 output tokens / **$0.00363 per call**.
- Cross-check against current Haiku 4.5 list pricing ($1.00/1M input, $5.00/1M output — the model in use is `claude-haiku-4-5-20251001`): 2,118 × $0.000001 + 295 × $0.000005 ≈ $0.00359/call. Consistent with the measured average.

Backfilling all 2,953 currently-null rows by re-running `classifyEvent()` against each row's joinable `raw_events` record:

**2,953 × ~$0.0036/call ≈ $10.60–$10.75 in raw Anthropic API cost.**

Caveats on this number (explicitly not hidden):

- This is model-call cost only. It does not include engineering time to write/run a one-off backfill script, or the operational question of which budget bucket those calls draw from.
- The `ingestion` bucket has a **default $2/day cap** (`ANTHROPIC_DAILY_BUDGET_USD_INGESTION`, defaults to `DEFAULT_DAILY_BUDGET_USD = 2` per `apps/backend/src/lib/anthropic-budget.ts`) that `classifyEvent()` checks before every real API call. Run through the same bucket as live ingestion, ~2,953 backfill calls at ~$0.0036 each (~$10.70 total) would take roughly 5 days to clear at the default cap, and would compete with live classification for that same daily budget — unless it's given a separate bucket/override, which is a decision, not a number, and is out of scope for this doc.
- 48 of the 2,953 rows are pre-migration and were classified under an older prompt version that never asked for these fields at all — re-running them isn't "backfilling a rejected value," it's a fresh classification of old text, so results may differ slightly from what a live classification would have produced at the time.

## Documentation drift flagged (not a cause of the coverage gap — informational)

`docs/brain/04_DATABASE.md:83` lists the 9 `event_category` values as `armed_conflict_security | sanctions_export_controls | trade_policy_tariffs | energy_supply_disruption | agriculture_food_security | central_bank_macro | shipping_logistics | official_communication | other_market_relevant`. `docs/claude_project/18_AI_ENGINE.md:76` and `docs/claude_project/13_PROMPTS.md:506` list a different, older 10-value short-form enum (`conflict|sanctions|trade_policy|central_bank|food_security|energy|election|natural_disaster|macro_release|other`). **Neither matches the live system.** The actual values — verified three ways (the `EVENT_CATEGORIES` allowlist in `claude.service.ts:901-911`, the prompt text sent to Claude at `claude.service.ts:440`, and the live DB CHECK constraint read directly via `pg_constraint` on project `evavcgfmemwryggdkjmx`) — are `armed_conflict_security | supply_disruption_logistics | sanctions_trade_policy | production_output_decision | central_bank_monetary_policy | scheduled_economic_data | official_statement_commentary | elections_political_transition | other_market_relevant`, and all three of those sources agree with each other exactly. Per the CLAUDE.md doc-precedence rule, this is flagged rather than silently fixed (`docs/brain/04_DATABASE.md`'s last commit postdates the migration's, so recency doesn't resolve it here — the migration/code/live-DB agreement is what settles it). Not fixed in this task since it's a docs-only correction outside the read/report scope given.

## What's proven vs. what's a guess

**Proven by code (read-only, cited file:line above):**
- Heuristic fallback never sets any materiality-gate field, including `event_category`.
- The merge-update branches in `signal-merge.ts` never include `event_category` in their payload.
- `ai-classifier.ts`'s insert omits the field entirely, and is dormant (per its own comment).
- The sanitizer's allowlist, the prompt's allowlist, and the live DB CHECK constraint are identical — so a naming mismatch is not currently a live cause.

**Proven by data (queried directly against the live Supabase project, numbers above):**
- Heuristic-fallback rows are 100% null on `event_category` in every sampled window — this is the dominant cause of the ~54% figure in the last 14 days.
- The pre-migration / deploy-gap artifacts fully explain why 30/60-day coverage looks far worse than 14-day coverage.
- All 2,953 currently-null rows have a recoverable source article for a backfill.
- The backfill cost figure is built from real historical per-call token/cost averages, not assumed tokens.

**Unconfirmed / code-only (plausible, not seen in this data pull):**
- The merge-path gap (cause #2) causing an *actual* observed null on a live signal. The mechanism is unconditional in the code, but the 14-day sample's 2 merged rows both already had a category from their base signal, so this sample doesn't contain a case where it visibly bit. A larger sample (more merged signals, especially ones whose base insert was a heuristic-fallback row) would likely surface it; this doc does not claim it has, only that the code guarantees it will eventually.
- Sanitizer rejection of a malformed/hallucinated `eventCategory` value from Claude — allowed for by the code, not observed causing any of the traced nulls.

## Non-goals of this task

No code was changed. No migration was written or applied. No backfill was run. This is strictly the causal inventory and sourced cost estimate requested.
