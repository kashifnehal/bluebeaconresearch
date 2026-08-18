# 13_PROMPTS.md — AI Rebuilder Prompt Specifications

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

This document contains modular system prompts designed to allow an autonomous AI engineer or LLM to independently rebuild or extend any module of Blue Beacon Research from scratch without prior repository context.

---

## Prompt 1: Rebuilding the AI Ingestion & Classifier Pipeline (`apps/backend/src/workers`)

```markdown
Role: Principal Backend & AI Engineer
Task: Rebuild the autonomous news ingestion and Claude 3.5 AI classifier pipeline.

Specifications:

1. Create cron-based ingestion collectors (GDELT 2.0 API, ACLED API, GNews API) running every 15 minutes.
2. Store raw articles in a PostgreSQL `raw_events` table with unique constraint `UNIQUE(source, external_id)` for deduplication.
3. Queue new raw events into a BullMQ queue named `ai-classification`.
4. Create a BullMQ worker using `@anthropic-ai/sdk` (Claude 3.5 Sonnet).
> ⚠️ UPDATED 2026-08-19 — Anthropic API credit is currently exhausted; a heuristic classifier fallback is what's actually running in production, not live Claude classification.
5. Send structured prompt to Claude demanding a JSON response with schema:
   - severity (1 to 10)
   - confidence (0 to 1.0)
   - summary (string)
   - ai_analysis (string)
   - commodity_impacts (array of { symbol: string, impact: "BULLISH" | "BEARISH" | "VOLATILE", score: number })
   - event_type (string)
   - lat, lng (coordinates)
6. Write enriched output to `signals` table in Supabase.
```

---

## Prompt 2: Rebuilding the Web Terminal Feed & Map (`apps/web`)

```markdown
Role: Senior Frontend Engineer
Task: Rebuild the Next.js 16 App Router Web Terminal for tactical market intelligence.

Specifications:

1. Setup Next.js 16 with Tailwind CSS v4, Lucide icons, and Mapbox GL JS.
2. Build a dark-mode terminal layout featuring:
   - Fixed TopBar with real-time scrolling commodity price ticker (`PriceTicker.tsx`).
   - Vertical Navigation Sidebar with links to `/dashboard`, `/map`, `/alerts`, `/backtesting`, `/watchlist`, `/settings`.
3. Implement `/dashboard` tactical signal feed displaying signal cards with expandable AI summaries, color-coded severity badges (1-10), and commodity impact chips.
4. Implement `/map` using Mapbox GL JS, populating interactive conflict markers with popups linking to `/events/[id]`.
5. Enforce gating middleware (`middleware.ts`) that checks `isProjectReady` flag and redirects ungated traffic to `/` waitlist modal (`AccessLimitedModal.tsx`).
```

<!-- Implementation Note: During actual implementation we diverged from the original Prompt 2 to remove a hard dependency on Mapbox tokens. The web client uses MapLibre GL (`maplibre-gl`) with OpenStreetMap raster tiles (`https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png`). The map maintains the specified features (heatmap, clustering, popups, link to `/events/[id]`) while avoiding the need for a Mapbox account or token. -->

---

## Prompt 3: Rebuilding the Multi-Channel Alert Router (`apps/backend/src/workers/alert-dispatcher.ts`)

```markdown
Role: Systems & Integration Engineer
Task: Rebuild the sub-second alert dispatch engine for Telegram, Slack, Webhooks, and Mobile Push.

Specifications:

1. Listen to `alert-dispatch` BullMQ queue triggered whenever a new `signal` record is created.
2. Fetch active `alert_rules` matching the signal's region, commodity impact, and minimum severity threshold.
3. Fetch user target channels from `user_channels` table (`telegram_chat_id`, `slack_webhook_url`, `push_tokens`).
4. Dispatch parallel notifications via Axios HTTP POST:
   - Telegram Bot API (`https://api.telegram.org/bot<TOKEN>/sendMessage`).
   - Slack Incoming Webhooks (`https://hooks.slack.com/...`).
   - Expo Push Notification API (`https://exp.host/--/api/v2/push/send`).
   - Custom HTTP Webhooks (`webhook_endpoints` table).
5. Log dispatch outcome in `alerts_sent` table.
```

<!-- Implementation Note (⚠️ UPDATED 2026-08-19): Actual implementation diverged from the queue-triggered design above. The `alert-dispatch` BullMQ queue was never fed by any collector — a wiring gap, not a credentials problem — so dispatch was completely non-functional until 2026-08-18, when collectors (rss/gnews/gdelt) were changed to call `dispatchAlertsForSignal()` inline right after each signal insert instead of going through the queue. The dormant BullMQ queue/worker was deliberately kept in the codebase (commented as dormant), not deleted. Separately, Telegram specifically remains non-functional today because `TELEGRAM_BOT_TOKEN` is still not configured anywhere (deferred by founder decision), independent of the dispatch-wiring fix. -->
