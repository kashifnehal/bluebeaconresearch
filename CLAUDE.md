# CLAUDE.md — Blue Beacon Research

This file is auto-loaded at the start of every Claude Code session in this repo. It exists so you don't have to re-explain the business context every time — read the two files below before doing substantial work.

## What this project is

Blue Beacon Research (BBR) is a geopolitical intelligence SaaS: it converts global events (conflicts, sanctions, policy shifts) into structured market signals for commodity traders, import/export SMBs, and boutique fund analysts. Pitch: Bloomberg-grade geopolitical intelligence at 1/40th the price, delivered as alerts before markets open.

**Read first, in order:**
1. [`docs/claude_project/21_PROJECT_BRIEFING.md`](docs/claude_project/21_PROJECT_BRIEFING.md) — the *why*: vision, target users, positioning, competitors, pricing, standing product decisions. This is the canonical onboarding doc; it says so explicitly ("paste this file FIRST").
2. [`docs/brain/08_CURRENT_STATUS.md`](docs/brain/08_CURRENT_STATUS.md) and [`docs/brain/14_CHANGELOG.md`](docs/brain/14_CHANGELOG.md) — the *current technical truth*: what's built, what's degraded, what's still open. These are kept live session-to-session.

## Doc-precedence rule (there are two doc trees — this matters)

- `docs/brain/` = technical state, actively maintained, most trustworthy for "is X actually built / working right now."
- `docs/claude_project/` = business/product/planning content from prior strategy discussions — most trustworthy for "why are we building this," positioning, competitors, roadmap reasoning.
- If the two disagree on a *technical* fact, trust `docs/brain/` (more recently synced) over `docs/claude_project/`, and flag the conflict instead of silently picking one.
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

## Current known-open items (check `docs/brain/08_CURRENT_STATUS.md` for the live version)

- Anthropic API credit — restore real Claude classification (heuristic fallback currently covering).
- `SUPABASE_SERVICE_ROLE_KEY` on Vercel.
- Telegram alerts — intentionally deferred by founder decision, not a bug.
- ACLED collector credentials.
