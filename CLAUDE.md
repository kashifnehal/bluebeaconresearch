# CLAUDE.md — Blue Beacon Research

This file is auto-loaded at the start of every Claude Code session in this repo. It exists so you don't have to re-explain the business context every time — read the two files below before doing substantial work.

## What this project is

Blue Beacon Research (BBR) is a geopolitical intelligence SaaS: it converts global events (conflicts, sanctions, policy shifts) into structured market signals for commodity traders, import/export SMBs, and boutique fund analysts. Pitch: Bloomberg-grade geopolitical intelligence at 1/40th the price, delivered as alerts before markets open.

**Read first, in order:**
1. [`docs/claude_project/21_PROJECT_BRIEFING.md`](docs/claude_project/21_PROJECT_BRIEFING.md) — the *why*: vision, target users, positioning, competitors, pricing, standing product decisions. This is the canonical onboarding doc; it says so explicitly ("paste this file FIRST").
2. [`docs/brain/08_CURRENT_STATUS.md`](docs/brain/08_CURRENT_STATUS.md) and [`docs/brain/14_CHANGELOG.md`](docs/brain/14_CHANGELOG.md) — the *current technical truth*: what's built, what's degraded, what's still open. These are kept live session-to-session.

## Doc-precedence rule (there are two doc trees — this matters)

- **`docs/claude_project/` is the canonical documentation tree.** It is the authoritative source for everything — vision, positioning, competitors, roadmap, product/business decisions, architecture, API, database, and status. When onboarding or resolving "what is true," start here. `21_PROJECT_BRIEFING.md` is the canonical entry point.
- **`docs/brain/` is a technical-detail annex, not a competing source of truth.** It is still actively maintained and, for several topics, carries deeper implementation detail and more recent session-by-session notes than its `docs/claude_project/` counterpart — notably `08_CURRENT_STATUS.md`, `10_DECISIONS.md` (ADRs 008–010 on the rate limiter, implicit-flow auth clients, and cross-source signal merge live only here), `14_CHANGELOG.md` (runs to the latest version; the `claude_project/` copy lags), `15_INGESTION_PIPELINE.md`, and `16_MIGRATION_CHECKLIST.md`. Use it to fill in detail; it *supplements* `docs/claude_project/`, it does not override it.
- If the two appear to disagree on a *technical* fact, don't assume either — run `git log -1 --format=%cd -- <path>` on both files and trust the more recently updated one, and flag the conflict instead of silently picking one.
- The two trees were kept separate rather than consolidated (see #55, resolved 2026-08-30): a real merge would have lost content that no inline note could capture, so the fix was to declare precedence here instead.
- Don't take a doc's self-reported status ("✅ 100% Operational") as ground truth without a reason to believe it — this codebase has a history of docs claiming things work that screenshots/testing showed were broken. Verify before relying on a claim, especially for UI/interactive elements.

## Standing rules (do not re-litigate)

- **Never call it "an AI tool."** Always "a research platform" / "analyst team." This is a deliberate positioning choice.
- **Global positioning, not India-specific.**
- **No buy/sell recommendations** in signal copy or UI — informational only, not financial advice.
- **Never suggest rewriting the stack.** Tech stack (Turborepo/pnpm, Next.js 16, Fastify, Supabase, BullMQ+Upstash Redis, Yahoo Finance for prices) is settled; extend it, don't replace it.
- **`rediss://` not `redis://`** — Upstash requires TLS for ioredis/BullMQ.
- **`window.location.href` not `router.push` after auth** — needed for Supabase SSR cookie attachment.
- **Never fabricate data in the UI.** There's a known past incident of static/hardcoded content (fake "AI Prediction" quotes, decorative progress bars) shipped as if real — treat any such thing found in the codebase as a bug to remove, not a pattern to follow.
- **Scope discipline.** A UI-only task previously scope-crept into adding unrelated Redis/Terraform/load-test infrastructure and had to be reverted (see `docs/brain/14_CHANGELOG.md` v0.13.0). Stay inside the files a task actually names; if something looks like it needs infra work outside that scope, stop and ask rather than building it.
- **Never commit secrets.** `docs/brain/CLAUDE_CONTEXT.md` previously had live API keys (Anthropic, Supabase service role, Upstash) committed in plaintext — this has been cleaned up and pushed, but treat it as a hard rule going forward: credentials belong in `.env.local` / platform env vars only, never in a doc.

## Session efficiency (token discipline — do not re-litigate)

Verification rigor stays high — this is a real company, not a toy repo. What's restricted below is *reaching for the expensive tool by default* when a cheaper one gives equal confidence. (Founder decision, 2026-08-28.)

- **Playwright / full live-browser verification only when the user explicitly asks for it, or the task is itself about a visual/rendering/UI-interaction bug** (e.g. "this renders with the wrong color," "the tiles show a watermark," "clicking X does nothing"). For everything else — data correctness, backend logic, API behavior, whether a fix actually changed what's stored — verify with a direct Supabase query or a direct API/curl call instead. Spinning up a dev server and driving a browser is the most expensive verification path available; don't default to it.
- **Reuse the standing test account instead of creating a throwaway one.** A confirmed, working production test account already exists — check memory for `reference-test-account` (the actual credentials are intentionally kept out of this repo, never in a doc or `.env.example`, per "Never commit secrets" above). Only create+delete a fresh throwaway account via the Supabase admin API when a task is specifically testing the signup/account-creation flow itself.
- **Don't read a full large `docs/brain/*.md` file just to append one section.** Grep for the insertion anchor (the latest `## v0.NN.0` heading, or the `Last updated:` line) and edit around it directly.
- **Don't spawn a subagent for work the current session can just do directly.** A fresh subagent pays a real cold-start cost to re-derive context (project background, file locations, prior findings in this conversation) that the current session already has loaded. Reserve `Agent`/background-agent spawns for genuinely large, independently parallelizable chunks of work.
- **When live-browser verification is genuinely warranted, don't trial-and-error it.** Inspect the actual DOM/layer/element structure once up front (e.g. query what the map's rendered layers/sources are) rather than guessing pixel coordinates or selectors repeatedly across several screenshot round-trips.
- **Batch investigative queries.** Decide what evidence would actually settle the question first, then run the minimum number of precise DB/API/grep calls to get it, rather than exploring iteratively in many small steps.
- **Scope every session to what the prompt actually asks.** Before running anything, restate (to yourself) the minimum work the prompt requires and do only that. Don't run environment/process/port/key diagnostics, don't restart or health-check services, don't "just verify one more thing" unless the prompt needs it or something actually broke. A question ("why can't X reach Y?") wants a short answer, not a full investigation + fix unless asked. (Founder feedback, 2026-08-28 — repeated over-checking was a concrete token sink.)
- **One dev server, reused, rate-limiter off.** When a local run is needed: check `lsof -ti:3000` once; if it's up, reuse it. Start it with `RATE_LIMIT_SAFE_MODE=true` in `apps/web/.env.local` (not as a shell prefix — Turbo doesn't forward ad-hoc env vars) so verification spends **zero** Upstash quota. Never fire parallel `curl` bursts at the dev server — it's single-threaded and each blocked upstream call stacks latency. Don't `pkill`/restart it repeatedly to chase env changes; edit `.env.local`, restart **once**, move on.
- **A dead/quota-exhausted paid service is a report line, not a debugging project.** If Upstash/Supabase/Anthropic return quota or auth errors, note it once and continue on the code's existing graceful-degradation path. Never hammer a metered service to "confirm" it's down. Transient network failures to `*.supabase.co` are usually just flakiness — retry once, don't conclude the environment is broken.

### Context bloat — the biggest token sink (founder feedback, 2026-08-29)

A usage review showed **93% of spend happened at >150k context** and **~11% came purely from Playwright MCP results sitting in context**. Everything above is about *tool choice*; this is about *not carrying dead weight*.

- **One session ≠ one week of work.** If the conversation already contains one or more *completed, unrelated* task batches and a new pasted prompt/"CTO TASK" arrives, **stop before starting it** and tell the user: "This session already covers `<X>`; that's unrelated — recommend `/clear` first, the stale context is what's expensive." Then wait. Do not silently carry the auth-outage saga into an accessibility task. Mid-batch, if a single task balloons, suggest `/compact` at the next clean checkpoint.
- **MCP / browser tool results are permanent for the session.** Every inline return from `browser_snapshot`, `browser_evaluate`, `browser_run_code_unsafe`, `browser_network_request`, and Supabase `execute_sql` stays in context to the end. Treat each as a bill you keep paying.
  - Never return a full `browser_snapshot` accessibility tree or a full DOM dump. Use the tool's `filename:` param to write large snapshots to disk, or have `browser_evaluate` return only derived values — counts, ids, booleans, `≤200`-char samples.
  - Never dump a full API response body (`browser_network_request` response-body, or `fetch().then(r=>r.json())` in an eval). Return `status` + row count + one trimmed field.
  - `browser_run_code_unsafe` echoes your entire `code` string back in the result. Keep snippets short, or load them from a file via `filename:`.
- **Verification is one pass, not a loop.** Baseline scan of *all* target pages in a single script returning a compact `{page: [finding…]}` summary → apply every fix → **one** post-deploy re-scan. Never interleave scan → fix → scan → fix per item; that multiplies the most expensive kind of result.
- **Don't re-read a file you've already read this session** (the harness tracks file state; Edit/Write would have errored if stale). Re-read only after an external change.
- **Cap investigation at ~5 DB/API/grep calls per question.** Write down the evidence that would settle it, get exactly that, stop. (Reinforces "Batch investigative queries" above with a number.)
- **Keep commit messages tight** — 3–6 lines. They're echoed on commit and re-read from `git log` later.

## Current known-open items (check `docs/brain/08_CURRENT_STATUS.md` for the live version)

- Anthropic API credit — restore real Claude classification (heuristic fallback currently covering).
- `SUPABASE_SERVICE_ROLE_KEY` on Vercel.
- Telegram alerts — intentionally deferred by founder decision, not a bug.
- ACLED collector credentials.
