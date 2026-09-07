# Live Task Tracker

Status icons: 🔴 blocking · 🟡 ready · ⚪ not started · 🤔 needs founder decision · ✅ done, verified.
[founder-led] = founder's own action, no engineering needed.

## Closed, verified
- #75 Vercel Fluid/SSE retirement — ac356ed
- #76 Telegram bot token + linking — re-verified 2026-09-06
- #79 Real usage/analytics tracking — 99975cc; ADMIN_EMAILS follow-up closed
  2026-09-07, live-verified on both Railway and Vercel (HTTP 200 + real data on
  /admin/metrics and /v1/admin/metrics)
- #80 Unsourced TAM figures fixed — 57a16b1
- #88 Telegram webhook secret-token hardening — 3dd675b
- #100 Vercel API_URL misconfiguration — fixed 2026-09-06
- #93 richfeed clarified — founder's own social pipeline; open low-priority
  follow-up: confirm overlap with the Social Auto-Poster spec
- #94 Cost/waste "do now" batch — 59ccf2b, all 7 items closed
- #81 Personalization core (user_preferences extended, onboarding capture, feed
  filter) — 517f796, e4bcaf6, 817fdee
- #89 Watchlist preference-aware defaults — 598678e
- #82 Alerts rework + trust/differentiation — c0698fc (in-app card: Event → Why
  it matters → Which instruments → Alert threshold; prominent "alert only above
  this threshold" control; per-card "Built from" source links; one-time
  not-financial-advice line) + a269547 (same four-section reframe in the
  Telegram/Slack template). Verified 2026-09-07: Playwright screenshot of the
  reworked card against the test account + 3 real Telegram messages from a live
  dispatchAlertsForSignal() run (all delivered:1), identical structure in both,
  ai_analysis-present and ai_analysis-null branches both exercised. Threshold
  control DB round-trip confirmed (6→8).
- #83 Personalized daily digest — bc8f4e0 + 57516b0 (from-address). Migration
  adds user_preferences.digest_enabled (default true). digest-sender.ts selects
  each onboarded, digest-enabled user's own top-5 signals from the last 24h
  matched to their watched commodities/regions (no global fallback), same
  four-section email framing + trust line, scheduled via node-cron (DIGEST_CRON,
  default 06:00 UTC). Settings → Notifications opt-out toggle wired to
  digest_enabled (true→false→true round-trip confirmed). Verified 2026-09-07:
  SQL check — with test user prefs regions=[africa]/commodities=[CORN,WHEAT] the
  digest pulled 5 signals ALL matching CORN/WHEAT, only 1 of which was in the
  unfiltered global top-5 (Iran-dominated) → genuinely personalized. One real
  digest email delivered to romantannison@gmail.com via the existing Resend
  account (id e06df2b3-ea1d-410d-ac01-019fbbb678dc, status delivered).
  REMAINING PROD STEP — RESOLVED 2026-09-07: founder added `RESEND_API_KEY` to
  the Railway `workers` service and redeployed (deployment `cfcce75c`, SUCCESS).
  Confirmed via Railway deploy logs: `"workers: digest cron schedule"` fired at
  boot with `schedule: "0 6 * * *"`, so the worker is live with the cron active.
  Not yet confirmed: an actual send from the deployed worker with the new key
  (that only happens at the next 06:00 UTC run, or via a manual trigger) — check
  Resend's Logs tab after the next run, or trigger `runDigestOnce()` manually,
  to see a real `POST /emails` from production. Resend still shows only the one
  pre-existing API key (`bbr-supabase-smtp`), so the same key is being reused
  for the digest's HTTP calls — that's fine, Resend keys aren't SMTP-only.
- #86 Economic calendar — 30cf1f2. New `/calendar` page (this week + upcoming
  tables, 🔴/🟡/🟢 impact indicators, live countdown to the next high-impact
  event) backed by a **static, manually-curated** `apps/web/data/economic-calendar.json`
  — a deliberate v1 choice, not a gap: no new paid API/vendor credential before
  there's real usage to justify it. Dates pulled from each institution's own
  published schedule as of 2026-09-07 (federalreserve.gov, ecb.europa.eu,
  boj.or.jp, bls.gov, bea.gov, opec.org) — 10 events, Sept 10 → Oct 30 2026 (ECB
  x2, FOMC x2, BOJ x2, US NFP, US CPI, US GDP Q3 advance, OPEC Monthly Oil
  Market Report). Window runs ~7.5 weeks, slightly past the nominal 4-6 to avoid
  cutting the next FOMC/BOJ/ECB/GDP cluster in half. No OPEC+ ministerial
  production-quota meeting date has been published yet for this window, so only
  the confirmed Monthly Report date is listed — not guessed. Forecast/Previous/
  Actual are `null` → rendered as "—", never fabricated. Swapping to a live
  provider (e.g. Trading Economics) later is a data-source change to one JSON
  file, not a rebuild. Verified live via Playwright: real dates render, "This
  Week" correctly isolates just the Sept 10 ECB decision (today is Mon Sept 7),
  everything else falls into "Upcoming", and the countdown ticks down correctly
  against the real system clock (confirmed two reads 13s apart: 3d 09h 44m 04s
  → 3d 09h 43m 51s).

## Decisions confirmed 2026-09-07
1. Forex gate — softened, forex only, not equity. Desk-research-validated (see
   ADR amendment below).
2. India go-to-market — NO special treatment. Same as any other market unless a
   real signal appears later on its own.
3. Priya (SMB importer) persona — no more trader-community search time. If
   pursued opportunistically: NCBFAA (National Customs Brokers & Forwarders
   Association of America), weekly eBriefing reaching 250,000+ importers/exporters.
4. #77 (10-15 live interviews) — retired as scoped. Closed via desk research
   (Perplexity/Grok transcripts reviewed directly, plus independent web
   verification) instead of live interviews.
5. #78 (manual Stripe test) — deprioritized to last. Free-first strategy: no
   payment method added until real free-tier traction is observed.
6. #91 (distribution test) — no personal outreach; substituted with independent
   research.
7. #92 (concierge digest test) — dropped as a pre-build gate; digest builds now,
   corrected against real usage post-launch.
8. Validation checkpoint — CLEARED, on desk research plus the free-first launch
   strategy, not on live interviews or a payment test.

## Priority queue (updated 2026-09-07)
- #82, #83, and #86 closed 2026-09-07 (see "Closed, verified"). #83's
  RESEND_API_KEY prod follow-up is resolved (key added + redeployed by
  founder); only the first-actual-send confirmation is still pending.
- Next: #87 (forex taxonomy expansion, forex only — gate cleared)
- Gated on real free-tier traction, no fixed date: #84 (full billing), #78
- Independent, no dependency: WhatsApp Business API approval (lead-time only)
- Parked: #90 (individual-stock-idea feature), #96 (Railway service merge —
  decided against)

## Known open technical item — RESOLVED 2026-09-07
Playwright MCP's browser profile had locked twice in this environment (orphaned
`ms-playwright-mcp/mcp-chrome-*` Chrome processes from a prior session holding
the profile's singleton lock), blocking the mandated visual-verification step
both times. Fixed by re-registering the server with `--isolated` (`claude mcp
remove playwright` / `claude mcp add playwright npx '@playwright/mcp@latest' --
--isolated`) and killing the orphaned processes so the live session could pick
up a clean profile. Confirmed working: full Playwright walkthrough of #81/#89
completed same day (fresh signup → onboarding steps 1-2 → SQL-confirmed
user_preferences row → dashboard "My Feed" toggle narrows 2622→816 and reverts
→ watchlist "My Commodities"/"Show All" toggle → drill-down "You follow this"
chip). Direct SQL/API verification remains the default per token-discipline
policy; Playwright is for visual/rendering/interaction checks specifically.
