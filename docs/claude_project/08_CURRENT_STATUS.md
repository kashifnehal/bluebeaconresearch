# 08_CURRENT_STATUS.md — Exact Project State (August 2026)

**Classification: Internal — CTO Level**
**Last verified: August 2026**

---

## 1. INFRASTRUCTURE STATUS

| Component | Status | Notes |
|-----------|--------|-------|
| Vercel (web) | ✅ Live | bluebeaconresearch.com serving correctly |
| Railway (API server) | ❌ OFFLINE | Never deployed. Root Directory not set, no start command configured. $1.00 credit left — needs billing added immediately. |
| Railway (workers) | ❌ DOES NOT EXIST | Second Railway service not created. Workers process has never run in production. |
| Supabase DB | ✅ Running | Database exists. Tables created. Some migrations may not all be applied. |
| Upstash Redis | ✅ Connected | Env vars set in Railway. |
| Telegram bot | ❌ Webhook not set | Bot exists (@BlueBeaconBot), token set in env, but setWebhook never called after deployment. |
| Domain | ✅ Live | bluebeaconresearch.com → Vercel. api.bluebeaconresearch.com → Railway (but Railway offline). |

---

## 2. FEATURE STATUS (GRANULAR)

### Authentication
| Feature | Status | Notes |
|---------|--------|-------|
| Email/password signup | ✅ Works | Supabase auth, profile trigger confirmed |
| Email/password login | ✅ Works | |
| Google OAuth | ❌ Broken | UI button exists. No /auth/callback route. Google Cloud Console credentials not configured. Supabase Google provider not enabled. |
| Email verification | ✅ Works | Supabase handles |
| Forgot password | ✅ Works | |
| Session persistence | ✅ Works | Cookie-based via @supabase/ssr |
| Middleware auth guard | ✅ Works | Protected routes redirect to /login |
| Profile auto-creation on signup | ⚠️ Unverified | Trigger created but not confirmed working for OAuth users |

### Onboarding (/onboarding)
| Feature | Status | Notes |
|---------|--------|-------|
| Name input | ✅ Works | Saved to profiles.full_name |
| Use case selection | ✅ Works | Saved to user_preferences.use_case |
| Telegram connect | ❌ Broken | Shows "@yourusername" placeholder — wrong. Telegram IDs are numeric. No bot connect flow built. |
| Region selection | ❌ Not built | Planned but missing from current onboarding |
| Commodity preferences | ❌ Not built | Missing |
| Min severity selection | ❌ Not built | Missing |
| Save and complete | ⚠️ Partial | Saves some fields, not all. Sets onboarding_completed = true. |

### Landing Page (/)
| Feature | Status | Notes |
|---------|--------|-------|
| Hero section | ✅ Works | Looks great |
| Live signal preview | ⚠️ Works but bad data | Shows FIFA Vancouver story from 4 months ago — workers not running |
| Pricing section | ✅ Works | 3 tiers displayed |
| ACCESS TIERS nav link | ⚠️ Unverified | Should scroll to pricing |
| Tactical Modules nav link | ⚠️ Unverified | Should scroll to features |
| SELECT TIER buttons | ⚠️ Partial | Go to /signup, but plan param may not be passed |
| AUTHORIZE FULL ACCESS button | ⚠️ Unverified | Should go to /signup |
| AccessLimitedModal (scarcity) | ✅ Built | Controlled by PROJECT_READY flag |
| Founding member banner | ⚠️ Unverified | May or may not be implemented |
| Footer links | ❌ Broken | Most 404 — Research, Documentation, Compliance, Auth Center, System Status |
| sitemap.xml | ❌ Not built | |
| robots.txt | ❌ Not built | |
| OG meta tags | ⚠️ Partial | Basic title/description, no og:image |

### Dashboard (/dashboard)
| Feature | Status | Notes |
|---------|--------|-------|
| Signal feed renders | ✅ Works | Shows 20 old signals from 4 months ago |
| Signal quality | ❌ BAD | FIFA Vancouver as top signal. Country shows UNKNOWN. All 40% confidence. Duplicates. Workers not running. |
| HIGH RISK filter tab | ⚠️ Partial | Works UI-wise but 0 HIGH signals exist |
| Search bar | ❌ Not functional | Input renders, no handler wired |
| Notification bell | ❌ Not functional | Icon renders, no panel opens |
| ? Help icon | ❌ Not functional | Icon renders, does nothing |
| User avatar dropdown | ❌ Not functional | Click does nothing |
| ANALYZE IMPACT button | ✅ Works | Navigates to /events/[id] |
| Signal rows clickable | ⚠️ Unverified | Chevron renders but click handler may not be attached |
| Breaking alert banner | ⚠️ Conditional | Shows when severity≥9 signal in last 4hr — no such signal exists currently |
| Right sidebar (breakdown) | ✅ Renders | HIGH:0, MEDIUM:20, LOW:0 |
| Right sidebar (hotzones) | ❌ Shows UNKNOWN | Country field not populated on signals |
| Real-time SSE | ⚠️ Connected but no new data | SSE stream opens but workers not sending new signals |

### Map (/map)
| Feature | Status | Notes |
|---------|--------|-------|
| Map renders | ✅ Works | Mapbox GL, dark style |
| Conflict pins | ❌ None showing | Signals have no lat/lng (country extraction broken) |
| Global Tension Index | ❌ Wrong data | 100% Diplomatic, 0% Kinetic — because only FIFA "diplomatic" signals exist |
| Right intel stream | ❌ Old data | Shows "4 months ago" timestamps — workers offline |
| Price ticker | ❌ "SYNCING" forever | Alpha Vantage quota exhausted, no prices loading |
| OPEN FULL TERMINAL button | ✅ Works | Goes to /dashboard |

### Alerts (/alerts)
| Feature | Status | Notes |
|---------|--------|-------|
| Featured signal card | ✅ Renders | Shows oldest critical signal (4 months old) |
| DEPLOY COUNTERMEASURES button | ❌ Wrong | Red button, confusing name, should be renamed/repurposed |
| Signal velocity chart | ✅ Renders | Shows bar chart (bars represent old data) |
| Geospatial intelligence stream | ✅ Renders | List of old signals |
| Signal stream items clickable | ⚠️ Unverified | Should navigate to /events/[id] |
| Filter tabs (ALL/WATCHLIST/ARCHIVES) | ⚠️ Partial | Tabs switch but filter logic unverified |
| Severity filter pills | ⚠️ Partial | Visually active, API filter unverified |
| Floating bell button | ⚠️ Unclear | Renders but behavior unknown |
| Telegram connect code | ⚠️ Unverified | POST /v1/telegram/connect-code exists but end-to-end untested |
| Alert rule creation | ⚠️ Partial | Form exists, API route exists, delivery chain untested |

### Watchlist (/watchlist)
| Feature | Status | Notes |
|---------|--------|-------|
| Page renders | ✅ Works | |
| Price cards | ❌ BLANK | Shows skeleton loading forever — Alpha Vantage quota exhausted |
| Commodity data | ❌ Not loading | price-syncer worker not running |
| Star/bookmark | ❌ No-op | Page blank so toggles can't work |

### Backtesting (/backtesting)
| Feature | Status | Notes |
|---------|--------|-------|
| Page renders | ✅ Works | Looks great |
| Pre-built simulation cards | ✅ Render | 6 scenarios shown |
| INITIALIZE SIMULATION buttons | ⚠️ Partial | Pre-fills form, may auto-trigger run |
| Form fields | ✅ Work | All inputs functional |
| RUN BACKTEST button | ⚠️ Returns mock | Runs, returns sine-curve fake data, NO "Demo Mode" disclaimer shown |
| Results display | ✅ Renders | Fake data looks convincing — dangerous without disclaimer |

### Settings (/settings)
| Feature | Status | Notes |
|---------|--------|-------|
| Account tab | ✅ Works | Name editable, SAVE CHANGES updates DB |
| Notifications tab | ❌ Empty | Tab exists but likely no content |
| Appearance tab | ❌ Empty | Tab exists but likely no content |
| Security tab | ❌ Empty | Tab exists but likely no content |
| Data tab | ❌ Empty | Tab exists but likely no content |
| API key generation | ⚠️ Unverified | UI exists in settings but flow untested end-to-end |

### events/[id]
| Feature | Status | Notes |
|---------|--------|-------|
| Page renders | ✅ Works | Navigates from signal cards |
| AI analysis | ⚠️ Shows but wrong | Shows Claude analysis of FIFA Vancouver |
| Price at signal | ❌ Not showing | price_at_signal column not added yet |
| Commodity impact table | ✅ Renders | Populated from commodity_impacts JSONB |
| Sanctions panel | ⚠️ Conditional | Shows if sanctions_matches populated — usually empty |
| Shipping proximity | ⚠️ Conditional | Shows if shipping_proximity populated — usually null |
| Source articles | ⚠️ Partial | Listed but links may not work |

---

## 3. BACKEND WORKER STATUS

| Worker | Status | Notes |
|--------|--------|-------|
| GDELT collector | ❌ NOT RUNNING | Workers process not started in Railway |
| ACLED collector | ❌ NOT RUNNING | Same |
| GNews collector | ❌ NOT RUNNING | Same |
| AI classifier | ❌ NOT RUNNING | Same |
| Signal generator | ❌ NOT RUNNING | Same |
| Alert dispatcher | ❌ NOT RUNNING | Same |
| Price syncer | ❌ NOT RUNNING + broken | Not running + Alpha Vantage free tier exhausted |
| Sanctions syncer | ❌ NOT RUNNING | Same |
| Morning brief | ❌ Not built | |
| Outcome tracker | ❌ Not built | alerts_sent.outcome_direction never filled |
| Calendar collector | ❌ Not built | |

**Root cause of all worker failures:** Railway workers service does not exist. Only API server is configured (and even that is offline). See 12_DEPLOYMENT.md for fix steps.

---

## 4. KNOWN BUGS (CRITICAL)

1. **Railway not deployed** — The backend service has never run in production. Root Directory not set in Railway Settings. No active deployment exists.

2. **Railway credits at $1.00** — Free plan almost exhausted. Services will stop when it hits $0. Add billing immediately.

3. **Signal quality broken** — FIFA Vancouver story as top signal. Country = UNKNOWN on all signals. All signals show 40% confidence (parsing issue or lack of context in prompt). Duplicate signals appearing. Pre-filter not working.

4. **Watchlist blank forever** — Alpha Vantage 25 req/day limit exhausted immediately. Yahoo Finance replacement not implemented.

5. **Google OAuth broken** — No /auth/callback route. No Google Cloud credentials configured. No Supabase provider enabled.

6. **Telegram webhook not set** — setWebhook never called against Railway URL. Bot messages never reach backend.

7. **Backtesting shows fake data without disclaimer** — Users may trust fake sine-curve data as real historical analysis.

8. **Settings has 4 empty tabs** — Notifications, Appearance, Security, Data tabs have no content.

9. **Search/Bell/? non-functional** — TopBar elements render but have no handlers.

10. **"DEPLOY COUNTERMEASURES" button** — Confusing red military-style button on alerts page. Wrong name, wrong color, wrong behavior.

---

## 5. KNOWN TECHNICAL DEBT

1. **Claude AI cost unmonitored** — No token usage logging. At 350 events/15min without pre-filter = ~$400/month risk.
2. **SSE polls DB directly** — At scale (10K+ users), 10K queries every 60 seconds will overload Supabase. Should switch to Redis pub/sub.
3. **No error boundaries** — Any React crash = white screen.
4. **No loading.tsx** — No loading states for RSC data fetching.
5. **No sitemap or robots.txt** — Bad for SEO.
6. **Backtesting returns mock data** — Core feature is fake.
7. **Empty settings tabs** — Promised features not delivered.
8. **Onboarding missing region/commodity/severity steps** — Feed not personalized.
9. **No rate limiting verified** — CRITICAL security gap if backend is brought online.
10. **No error monitoring (Sentry)** — Production crashes invisible.
11. **price_at_signal column not added** — Migration 008 not run.
12. **economic_events table not created** — Migration 009 not run.
13. **PostGIS may not be enabled** — Shipping proximity calculation would fail.
14. **Outcome tracker not built** — Alert accuracy never computed. /accuracy page impossible.

---

## 6. WHAT IS ACTUALLY WORKING END-TO-END

The only complete end-to-end flows are:

1. **Email signup → onboarding → dashboard (partial)** — User can create an account, complete basic onboarding (without Telegram), see the dashboard with old signal data.

2. **Navigate between pages** — Sidebar navigation between all 6 pages works.

3. **View old signal cards** — The 20 signals from 4 months ago display correctly in the feed with correct UI.

4. **View event detail** — Clicking ANALYZE IMPACT shows the event detail page with Claude analysis (of wrong events).

5. **Backtesting UI flow** — Can select scenario, run backtest, see results (fake data).

6. **Settings account tab** — Can update display name.
