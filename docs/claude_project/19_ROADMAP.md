# 19_ROADMAP.md — Product & Company Roadmap

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**

---

## MONTH 1 — GET IT WORKING

> ⚠️ UPDATED 2026-08-19 — this Month 1 checklist reflects a much earlier project phase; most items below (signal pre-filter, country extraction, Yahoo Finance migration, Google OAuth, search bar, notification bell, footer links, empty states, error boundaries) are long since shipped. The exception: Telegram delivery is still blocked (`TELEGRAM_BOT_TOKEN` still not configured), and note that alert dispatch overall (not just Telegram) also had a separate, more severe wiring bug — a dormant/unfed BullMQ queue meant nothing ever triggered dispatch to any channel — that was only fixed 2026-08-18.

**Goal: First 10 real users receiving working alerts**

Infrastructure:
- [ ] Railway billing added, backend deployed, workers service created
- [ ] Telegram webhook set
- [ ] Signal pre-filter implemented (no more FIFA news)
- [ ] Country extraction fixed (no more UNKNOWN)
- [ ] Yahoo Finance replacing Alpha Vantage
- [ ] Google OAuth working

Product:
- [ ] Search bar functional
- [ ] Notification bell panel
- [ ] Help modal
- [ ] User avatar dropdown
- [ ] Footer links fixed
- [ ] Empty states on all pages
- [ ] Error boundaries
- [ ] Demo mode banner on backtesting
- [ ] Telegram onboarding fixed

Success metric: 10 users → at least 3 receiving real Telegram alerts for real geopolitical events. NPS > 7.

---

## MONTH 2 — MAKE IT VALUABLE

**Goal: 50 active users, first revenue conversation**

Product:
- [ ] Economic Calendar page (/calendar) with Trading Economics API
- [ ] Price-at-signal display on signal cards
- [ ] Central bank rates widget on watchlist
- [ ] Morning brief automated (07:45 UTC Telegram + email)
- [ ] Public Telegram channel (@BlueBeaconResearch) with delayed free signals
- [ ] /accuracy public page with live track record
- [ ] Settings Notifications tab built
- [ ] Settings Security tab (change password, sessions)
- [ ] Guardian API as second news source
- [ ] Outcome tracker worker (fills outcome_direction for accuracy)

Marketing:
- [ ] Twitter @BlueBeaconHQ active: daily signal + outcome posts
- [ ] LinkedIn: weekly intelligence brief every Monday
- [ ] Product Hunt launch
- [ ] Show HN post
- [ ] Reddit r/algotrading methodology post

Success metric: 50 active users, /accuracy page showing > 65% directional accuracy, first person asking "how do I pay for this?"

---

## MONTH 3 — FIRST REVENUE

**Goal: First 10 paying customers, $2,000 MRR**

Product:
- [ ] Stripe billing implemented (checkout, webhook, portal)
- [ ] Plan enforcement middleware active (free tier delay enforced)
- [ ] Referral program ("1 month free per invite")
- [ ] Email alerts via Resend
- [ ] PostHog analytics (understand where users drop off)
- [ ] Sentry error monitoring

> ⚠️ UPDATED 2026-08-19 — both of these are now done: Sentry is wired on the web app, and PostHog is wired for a signup→first-signal-view→first-alert-rule funnel (landed in the 2026-08-18/19 reliability/observability pass).
- [ ] Severity 9+ audio alert in browser
- [ ] Real backtesting (Alpha Vantage paid, GDELT historical)
- [ ] Watchlist alert toggle → auto-creates alert rule

Infrastructure:
- [ ] Supabase upgraded to Pro
- [ ] Claude daily spend cap implemented
- [ ] Redis pub/sub for SSE (prepare for scale)

Success metric: 10 paying customers ($490–$1,990 MRR), churn < 10%/month.

---

## MONTHS 4-6 — GROWTH

**Goal: 100 paying users, $15,000 MRR**

Product (new features):
- [ ] Multi-seat support (Pro tier, 3 seats)
- [ ] Saved signals with personal notes
- [ ] Signal search with full-text (Supabase tsvector)
- [ ] CSV export for Pro tier
- [ ] Mobile app: App Store submission (iOS)
- [ ] Mobile app: Play Store submission (Android)
- [ ] API console UI (currently placeholder)
- [ ] Historical signal archive (40-year backtesting)
- [ ] Country-specific signal feeds (user selects watched regions)
- [ ] WhatsApp Business alerts (India market expansion)

Marketing:
- [ ] Press outreach: TechCrunch, Hacker News, financial trade publications
- [ ] Paid Twitter/X ads during major geopolitical events ($50-200/event)
- [ ] Affiliate program for financial newsletter writers
- [ ] Bloomberg/Stratfor comparison landing page

Infrastructure:
- [ ] CI/CD pipeline (GitHub Actions)

> ⚠️ UPDATED 2026-08-19 — a CI workflow now exists (`.github/workflows/ci.yml`, runs type-check on push/PR); it was empty before the 2026-08-18/19 pass.

- [ ] Read replica for Supabase signal queries
- [ ] Redis pub/sub SSE (if > 2K concurrent users)

Success metric: 100 paying users, $15K MRR, CAC < $50.

---

## 6-MONTH ROADMAP SUMMARY

| Month | Theme | Users | MRR | Key Milestone |
|-------|-------|-------|-----|---------------|
| 1 | Fix | 10 | $0 | Real alerts delivered |
| 2 | Value | 50 | $0 | Accuracy page live, organic traffic |
| 3 | Revenue | 100 | $2K | First paying customers |
| 4 | Growth | 250 | $8K | Product Hunt #1 |
| 5 | Scale | 500 | $18K | Press coverage |
| 6 | Expand | 1,000 | $35K | Mobile apps live |

---

## 12-MONTH ROADMAP

**Goal: $100K ARR, 500+ paying users, Series A ready**

Q3 2026 (Months 7-9):
- [ ] Enterprise/API tier fully operational (bb_live_ keys, webhooks, rate limits)
- [ ] White-label discussions with first institutional client
- [ ] Economic calendar → signal pipeline: when CPI/NFP/Fed decision releases, auto-generate signal
- [ ] Supply chain module: user enters supplier routes → alerts when those routes threatened
- [ ] Signal accuracy certification: independent audit of BBR accuracy methodology
- [ ] Mobile app: 500+ downloads on App Store/Play Store

Q4 2026 (Months 10-12):
- [ ] $1M ARR run rate target
- [ ] Team: hire 1 data engineer (pipeline reliability), 1 growth marketer
- [ ] Enterprise sales: outbound to boutique commodity funds, import/export associations
- [ ] API partnerships: integrate with broker platforms (data feed to trading platforms)
- [ ] Launch in 3 new markets: Middle East traders, European commodity traders, Southeast Asia
- [ ] Raise seed round if growing organically ($1-2M to accelerate sales team)

---

## 24-MONTH VISION

**Goal: $1M ARR, 2,000+ paying users, institutional credibility**

**Product expansion:**
- Decision intelligence layer: "Based on this event pattern, here are the historical playbooks"
- Portfolio overlay: connect broker API → show P&L impact of each signal
- Custom signal feeds by sector (energy-only, agriculture-only, metals-only)
- Real-time data API (streaming WebSocket) for algo traders and quant funds
- Multilingual briefings (Arabic, Russian, Mandarin — for local market expansion)
- Physical commodity supply chain module (track specific shipping routes, supplier locations)

**Business expansion:**
- Institutional white-label: sell BBR's signal data pipeline to banks, hedge funds, commodity exchanges
- Data licensing: license classified signal data to academic researchers and financial data vendors
- Research reports: monthly paid deep-dive reports on specific geopolitical risk themes
- Corporate risk advisory: premium tier for multinational companies managing supply chain risk

**Company structure:**
- 10-15 person team: engineering (5), data/research (3), sales (3), marketing (2), ops (2)
- Offices: one international presence (London or Dubai — both major commodity trading hubs)
- Annual revenue target: $3-5M ARR
- Exit options: strategic acquisition by Bloomberg/Refinitiv/S&P Global/MSCI, or Series A → independent growth
