# 01_PRODUCT.md — Complete Product Definition

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**

---

## 1. PRODUCT OVERVIEW

Blue Beacon Research is a SaaS intelligence terminal. The core product loop:

```
Global Event → Detection → AI Classification → Signal Card → Alert Delivery → User Action
```

Every feature exists to serve this loop. Features that don't serve this loop should be removed.

---

## 2. PAGES — COMPLETE SPECIFICATION

### 2.1 Landing Page (/)

**Purpose:** Convert visitors to signups. Present BBR as a legitimate research firm.

**URL:** bluebeaconresearch.com

**Layout sections (top to bottom):**
1. **Navigation bar** — Logo left, "Tactical Modules" + "Access Tiers" center, "Sign In" + "Start Free" right
2. **Hero section** — "High-fidelity geopolitical intelligence → actionable trading signals." with live status badge "LIVE — Monitoring active global conflicts"
3. **Live signal preview** — Shows actual latest signal from the database (blurred below fold), CTA: "AUTHORIZE FULL ACCESS →" goes to /signup
4. **How it works section** — 3 steps: Event Detection → AI Synthesis → Tactical Uplink
5. **Access Tiers (pricing)** — 3 tiers visible: $0 Monitor, $49 Analyst, $199 Pro
6. **Footer** — Navigation links, legal, social

**CTA Buttons and their destinations:**
- "ESTABLISH INTEL LINK" → /signup
- "VIEW LIVE FEED ↓" → scrolls to signal preview section
- "SIGN IN" → /login
- "START FREE" → /signup
- "SELECT TIER" (Monitor) → /signup?plan=monitor
- "SELECT TIER" (Analyst) → /signup?plan=analyst
- "SELECT TIER" (Pro) → /signup?plan=pro
- "AUTHORIZE FULL ACCESS" (on blurred signal preview) → /signup
- "Tactical Modules" nav → scrolls to How It Works section
- "Access Tiers" nav → scrolls to Pricing section
- Footer: Terminal → /dashboard (or /login if not auth'd)
- Footer: Global Map → /map (or /login)
- Footer: Signals → /dashboard
- Footer: Research → /backtesting
- Footer: Documentation → /terms (placeholder until docs page built)
- Footer: Compliance → /privacy
- Footer: Auth Center → /login
- Footer: System Status → /status (static page, build separately)
- Footer: Encrypted Support → mailto:support@bluebeaconresearch.com

**Live Signal Preview behavior:**
- Shows most recent signal from signals table in DB
- Lower half blurred with gradient overlay
- Text overlay: "Sign up to see full analysis →"
- Updates on page load (server-side render for SEO)
- If no signals in DB: show a hardcoded example signal card

**Scarcity Modal (AccessLimitedModal — already built):**
- Controlled by `PROJECT_READY` flag in lib/flags.ts
- When PROJECT_READY = false: modal shows on landing page
- Modal content: "847 of 1,000 research seats claimed" (counter in localStorage)
- Counter increments by 1–3 every 45–90 seconds using setInterval
- Cap at 999, never shows 1000
- Primary CTA: "Claim Your Research Seat →" → /signup
- Secondary: "View live feed first" → closes modal
- Dismissed state stored in localStorage key 'bbr_seat_dismissed'
- Never shows to logged-in users

**Founding Member Banner (pricing section):**
- "🔒 Founding Member Offer — First 500 subscribers lock in current pricing for life. 312 spots remaining."
- Hard-coded number, update manually weekly
- bg-[#1D2D50] border border-[#3B82F6]/30

---

### 2.2 /login

**Purpose:** Return user authentication

**Layout:**
- Centered dark card with glowing green top border
- Logo: "🛡 BLUE BEACON RESEARCH"
- Heading: "Welcome back"
- Subheading: "SIGN IN TO YOUR INTELLIGENCE FEED"
- Google OAuth button (currently broken — see Issues)
- Divider "or"
- Email input, Password input with eye toggle
- "FORGOT PASSWORD?" link right-aligned (goes to /forgot-password)
- "SIGN IN →" button (green, full width)
- "Don't have an account? Sign up" link → /signup
- Footer brand text: "SECURE NODE: BB-ALPHA-09 • V4.22.0"

**Authentication flow:**
1. User submits email + password
2. Supabase signInWithPassword called
3. On success: check profiles.onboarding_completed
4. If false → redirect to /onboarding
5. If true → redirect to /dashboard
6. On error: show error message below form (text-red-400 border border-red-800 rounded bg-red-950/30)

**Google OAuth flow (needs fix):**
1. User clicks "Continue with Google"
2. supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin/auth/callback }})
3. User redirected to Google consent
4. Google redirects to /auth/callback with code
5. /auth/callback exchanges code for session
6. Check onboarding_completed → redirect accordingly

**URL params handled:**
- ?error=message → shows error banner above form

---

### 2.3 /signup

**Purpose:** New user registration

**Layout:** Same card pattern as login
- Plan selector: 3 cards (Monitor/Analyst/Pro) — pre-selects based on ?plan= query param
- Full name input
- Email input
- Password input with strength indicator (4 segments: weak/fair/good/strong)
- "Create account" button
- Terms text: "By signing up you agree to our Terms and Privacy Policy"
- "Already have an account? Sign in" → /login

**Signup flow:**
1. User fills form, selects plan
2. supabase.auth.signUp called
3. DB trigger auto-creates profiles record (full_name, plan_tier='free', onboarding_completed=false)
4. If free plan: redirect to /verify (email verification) then /onboarding
5. If paid plan: redirect to Stripe checkout (CURRENTLY STUBBED — everyone gets pro)
6. After Stripe: redirect to /onboarding

**Current state of Stripe:** Fully stubbed. All users hardcoded to 'pro' plan via:
```sql
UPDATE profiles SET plan_tier = 'pro' WHERE plan_tier = 'free' OR plan_tier IS NULL;
```
Restore when first paying customer asks to subscribe.

---

### 2.4 /verify

**Purpose:** Email verification confirmation page

**Layout:**
- Envelope icon (Lucide Mail, 48px, text-accent)
- "Check your email"
- "We sent a verification link to [email]."
- "Resend email" button → supabase.auth.resend
- "Wrong email? Sign up again" → /signup

---

### 2.5 /forgot-password

**Purpose:** Password reset initiation

**Layout:**
- Email input
- "Send reset link" button → supabase.auth.resetPasswordForEmail
- Confirmation message after submit

---

### 2.6 /auth/callback (route handler, not a page)

**Purpose:** Handle OAuth redirect from Google/Supabase

**Behavior:**
- Exchanges code for session via supabase.auth.exchangeCodeForSession
- Checks profiles.onboarding_completed
- If false → /onboarding
- If true → /dashboard
- On error → /login?error=message

---

### 2.7 /onboarding

**Purpose:** One-time first-run setup. Collects user preferences to personalize their feed.

**Layout:**
- Globe/world map background (animated, subtle)
- Live coordinates display (cosmetic)
- "BLUE BEACON RESEARCH" header with terminal cursor
- "Set up your profile" card (centered)
- NODE STATUS + ENCRYPTION footer (cosmetic branding)

**Fields collected:**
1. YOUR NAME — text input, placeholder "Enter operator name..."
2. USE CASE — segmented toggle: TRADER / ANALYST / RISK MANAGER / OTHER
3. TELEGRAM CHAT ID — **[NEEDS FIX]** Currently shows "@yourusername" placeholder — WRONG. Telegram Chat IDs are numeric. Replace with bot connect flow (see below)

**Correct Telegram connect flow (to build):**
- Remove text input
- Show button: "Connect via Telegram Bot"
- onClick: opens t.me/BlueBeaconBot?start=connect_[6-char-code]
- Also calls POST /api/telegram/connect-code to generate code linked to user_id
- Status indicator: "Waiting for connection..." (polling every 5s for 2 min)
- On success: "Connected ✓" (green)
- "Skip for now" link below

**Missing from current onboarding (planned, not built):**
- Region selection (Middle East / Eastern Europe / Africa / Asia-Pacific / Americas / Global)
- Commodity preferences (WTI / Brent / Gold / Wheat / NatGas / etc.)
- Minimum severity threshold slider (7/8/9/10)
- Alert frequency (immediate / hourly digest / daily 06:00 UTC)
- Quiet hours toggle + start/end time

**On complete:**
- Saves to user_preferences table
- Sets profiles.onboarding_completed = true
- Redirects to /dashboard

---

### 2.8 /dashboard (Intelligence Feed)

**This is the core product. Users spend 80% of their time here.**

**Layout:**
- Left sidebar (fixed 200px)
- Top bar (search + notification bell + ? icon + user avatar)
- Main content area
- Right sidebar (signal breakdown + latest signal + active hotzones)

**Left Sidebar navigation:**
- INTELLIGENCE FEED (active: green, Lucide Activity icon)
- GLOBAL MAP (Lucide Globe icon)
- ALERTS (Lucide Bell, shows unread count badge in red)
- WATCHLIST (Lucide BarChart2)
- BACKTESTING (Lucide FlaskConical)
- SETTINGS (Lucide Settings)
- Bottom: Node status "Node: BB-ALPHA-09" + Help link + Logout

**Top Bar elements:**
- Search input: "Search signals, coordinates, entities..."
  - SHOULD: filter signal feed in real-time (client-side for 3+ chars)
  - On Enter: server-side search call /v1/signals?search=query
  - Show X clear button when query populated
  - Show "No results for '[query]'" empty state
  - CURRENT STATUS: NOT WORKING
- 🔔 Notification bell:
  - SHOULD: open slide-in right panel (360px wide)
  - Shows last 10 alerts_sent for user
  - Each item: severity dot, time ago, signal title, "View →" link
  - Red dot badge = unread count
  - "Mark all read" button
  - "Manage alert rules →" footer link
  - CURRENT STATUS: NOT WORKING
  > ⚠️ UPDATED 2026-08-25 — this "NOT WORKING" status is stale; the panel is built and
  > functional (`NotificationPanel.tsx`), live-verified. One real gap this spec didn't
  > anticipate was fixed in `3c2378c`: a "delivered" item without a real delivery
  > (`alerts_sent.status` = `queued`/`failed`) rendered identically to a real delivered
  > alert with the same "View →" link. Items now show an amber "Not Delivered" / red
  > "Delivery Failed" badge + explanation instead when status isn't `delivered` — an
  > intentional extension beyond this literal spec, not a contradiction of it. See
  > `docs/brain/08_CURRENT_STATUS.md`'s 2026-08-25 entry.
- ? Help icon:
  - SHOULD: open centered modal with 5 help sections
  - Sections: Reading signals, Setting up Telegram, Using the map, Backtesting, Contact support
  - CURRENT STATUS: NOT WORKING
- User avatar (initials circle, top-right):
  - SHOULD: dropdown with Profile / Settings / Sign Out
  - Sign Out → supabase.auth.signOut() → /login
  - CURRENT STATUS: NOT WORKING
- "Terminal Sentinel v2.4.0-STABLE" — cosmetic branding, displays username

**Main Content:**
1. Page title: "Intelligence Feed" + subtitle "Real-time global signal monitoring"
2. Tab filters: "ALL SIGNALS" (active) | "HIGH RISK" (severity ≥ 8 filter)
3. Breaking alert banner: Shows if severity ≥ 9 signal in last 4 hours (red background, pulsing siren icon, title)
4. Featured signal card (large, full width) — most recent or highest severity
5. 2-column grid of standard signal cards
6. "RECENT SIGNAL STREAM" — compact list view of last 20 signals

**Signal Card (large variant):**
- Source badge (NEWS/GEOPOLITICAL SIGNAL) + Signal ID + timestamp
- Title (h2 size, text-white)
- Summary text
- Region badge + Country badge + Confidence badge ("40% CONFIDENCE")
- "ANALYZE IMPACT →" button → /events/[signal.id]

**Signal Card (compact variant in grid):**
- Source badge + timestamp
- Title
- Summary
- Region + severity tags
- Click anywhere → /events/[signal.id]

**Recent Signal Stream row:**
- Colored dot (severity color)
- Timestamp
- Title
- Confidence badge
- Chevron → → /events/[signal.id]

**Right Sidebar:**
- "SIGNAL BREAKDOWN / LIVE COUNTS"
  - HIGH (8-10): N
  - MEDIUM (4-7): N
  - LOW (1-3): N
- "LATEST SIGNAL" — most recent signal title + country + severity
- "ACTIVE HOTZONES" — top region + risk level

**Empty states (NEEDS BUILD):**
- When signals array empty: Globe icon + "Monitoring global events. First signal appears within 15 minutes."
- When workers not running: same message (users shouldn't see "no data")

---

### 2.9 /events/[id] (Signal Deep-Dive)

**Purpose:** Full intelligence briefing for a single signal. THE most valuable page — this is what users pay for.

**Layout:**
- Breadcrumb: Dashboard / Signal ID
- Signal header: Type badge + ID + Date
- Title (large h1)
- Severity badge + Confidence % + Country + Region

**Content sections:**
1. **AI Intelligence Briefing** (Claude 3.5 Sonnet output)
   - 5–8 paragraph analysis
   - What happened → Why it matters → Historical precedent → Escalation risk → Market implications
   - Never recommends trades
2. **Affected Assets Table**
   - Columns: Asset | Direction | Confidence | Price at Signal | Current Price | % Move
   - Price at signal: captured from commodity_prices at classification time
   - Current price: live from commodity_prices
   - % move: calculated ((current - at_signal) / at_signal) * 100
3. **Sanctions Matches** (if any) — amber warning box, entity names + sanctions lists
4. **Shipping Proximity** (if within 400km of chokepoint) — "22km from Strait of Hormuz"
5. **Source Articles** — list of raw news articles that triggered the signal
6. **Related Signals** — other signals from same region/event-type in last 30 days

**"ANALYZE IMPACT" button behavior:** Navigate to this page from dashboard signal cards

---

### 2.10 /map (Global Conflict Map)

**Purpose:** Visual geographic representation of active conflicts and tensions.

**Layout:**
- Full-screen Mapbox GL JS dark map (style: dark-v11)
> ⚠️ UPDATED 2026-08-19 — the actual implementation uses `maplibre-gl` (MapLibre GL JS) with OpenStreetMap raster tiles, not Mapbox, and requires no Mapbox token (see `14_CHANGELOG.md` v0.13.0/v0.16.1 in `docs/brain/`).
- Left panel (floating): Global Tension Index + breakdown
- Right panel: "LIVE INTELLIGENCE" stream
- Bottom bar: GLOBAL TICKER + SYNCING PRICE FEED + LIVE indicator

**Left Panel content:**
- "GLOBAL TENSION INDEX" — composite score (0-100)
- Number: e.g. "57.5 LIVE"
- Breakdown bars:
  - CYBER WARFARE: N%
  - KINETIC CONFLICT: N%
  - DIPLOMATIC FRICTION: N%
- "ACTIVE SENTIMENT" — Bull/Neutral/Bear percentages

**How tension index is calculated:**
- Count signals by event_type in last 24 hours
- Kinetic: conflict/military events
- Diplomatic: sanctions/policy/political events
- Cyber: cyber/infrastructure events
- Sentiment: commodity_impacts direction aggregated across active signals

**Map markers:**
- Each signal with lat/lng → pulsing dot
- Color: severity color (#EF4444 for 9-10, #F59E0B for 8, #EAB308 for 7, gray for lower)
- Click marker → popup with signal title, severity, confidence + "View full briefing →" link to /events/[id]
- Cluster nearby markers when zoomed out

**Chokepoint markers:**
- Permanent markers for: Strait of Hormuz, Suez Canal, Bab-el-Mandeb, Strait of Malacca, Black Sea Grain Corridor
- Always visible regardless of signal data
- Click → shows chokepoint name, % global oil/trade through it

**Right Panel (LIVE INTELLIGENCE):**
- List of recent signals, most recent first
- Each: time, title (truncated), "CRITICAL INTERVENTION →" link to /events/[id]
- Current issue: showing "4 months ago" because workers not running

**Bottom bar:**
- "GLOBAL TICKER" — commodity prices scrolling (depends on price syncer working)
- "SYNCING PRICE FEED" — animated spinner
- "LIVE" — pulsing green dot
- "OPEN FULL TERMINAL" button → /dashboard

**Current issues:**
- No conflict pins (signals don't have lat/lng because GDELT extraction broken)
- Old data in right panel (workers offline)
- Global Tension Index shows 100% Diplomatic / 0% Kinetic (FIFA Vancouver effect from bad signal data)
- Price ticker shows "SYNCING" indefinitely (Alpha Vantage quota exhausted)

---

### 2.11 /watchlist (Commodity Tracker)

**Purpose:** Live commodity price monitor. The "Bloomberg price terminal" for our users.

**Layout:**
- Page title: "Watchlist"
- Grid of commodity price cards (3-column, auto-fill)
- Empty state if no watchlist items

**Commodity Card content:**
- Symbol badge (e.g. "USOIL")
- Full name (e.g. "WTI Crude Oil")
- Current price (large, font-mono, text-white)
- 24hr change: +$1.30 (text-success) or -$0.40 (text-danger)
- 24hr % change
- 7-day high/low range bar
- Risk level badge based on active signals count:
  - 0 signals: "LOW RISK" (text-success)
  - 1-2 signals: "MEDIUM RISK" (text-warning)
  - 3+ signals: "HIGH RISK" (text-danger)
  - Severity 8+ signals: "CRITICAL" (text-danger)
- Bookmark/star icon → toggles watchlist_entries
- Mini spark-line chart (last 30 data points, Recharts AreaChart 80px height)

**Central Bank Rates widget (planned, not built):**
- Position: top of /watchlist page, above commodity cards
- Horizontal scrollable row of 8 bank cards
- Each: flag + bank abbreviation + current rate (large) + expectedMove badge + nextMeeting date
- Static JSON file: apps/web/lib/central-bank-rates.json (update monthly)
- Banks: Fed, ECB, BOE, BOJ, RBI, PBoC, RBA, SNB

**Price data source:**
- commodity_prices table in Supabase
- Updated by price-syncer worker every 15 minutes
- Fallback: Redis cache key prices:[symbol] TTL 900s
- Final fallback: hardcoded FALLBACK_PRICES object (prevents empty watchlist)
- Source: Yahoo Finance free (replaces Alpha Vantage which has 25 req/day limit)
- Yahoo Finance symbols: CL=F (WTI), BZ=F (Brent), GC=F (Gold), NG=F (NatGas), ZW=F (Wheat), HG=F (Copper), SI=F (Silver), ZC=F (Corn)

**Current status:** Completely broken — shows skeleton loading forever due to Alpha Vantage quota exhaustion.

> ⚠️ UPDATED 2026-08-25 — This whole section is stale against the current implementation (`apps/web/app/(dashboard)/watchlist/WatchlistClient.tsx`), not just the "Current status" line: prices come from Yahoo Finance via `commodity_prices` (Alpha Vantage was already replaced), the sparkline is real recent-price history (not the planned 30-point Recharts AreaChart — it's a plain bar sparkline from `/api/prices/history`), and there's no risk-level badge or 7-day high/low bar built. Left as a known gap between spec and reality rather than rewritten wholesale.
>
> One gap that **was** closed this session: commodity cards are now clickable, navigating to a new drill-down route (`/watchlist/[symbol]`) not originally speced here — a real 90-day price chart plus a timeline of correlated signals (via `commodity_impacts`), each annotated with a factual, time-windowed price-move stat. No buy/sell or predictive language, per the product's hard no-recommendations rule. See `08_CURRENT_STATUS.md` and `14_CHANGELOG.md` v0.28.4 for detail.

---

### 2.12 /alerts (Alert & Signal Manager)

**Purpose:** (1) Manage alert delivery rules, (2) Browse all signals with filtering.

**IMPORTANT NOTE:** This page has drift — it was designed as an alert manager but has evolved to show signal detail as primary content. The "DEPLOY COUNTERMEASURES" button needs immediate removal/rename. This page needs UX clarification.

**Current layout (as built):**
- Featured signal detail at top (most critical signal)
- "DEPLOY COUNTERMEASURES" button — MUST BE RENAMED to "Set Alert for This Signal"
- Signal velocity bar chart (T-24H to NOW)
- Geospatial Intelligence Stream (filterable signal list)

**Intended final layout:**
Section 1: Critical Active Signal (current biggest event, featured)
Section 2: Create/Manage Alert Rules
Section 3: Connected alert channels (Telegram, Slack, Webhook)
Section 4: Signal history stream

**Alert rule creation:**
- Name: text input
- Regions: multi-select checkboxes
- Commodities: multi-select
- Minimum severity: 4-button group (7/8/9/10)
- Delivery: segmented (Immediate / Hourly Digest / Daily 06:00)
- Quiet hours: toggle + time pickers
- Channels: checkboxes (Telegram / Email / Slack / Webhook)

**Telegram channel connection:**
- Shows 12-character connect code
- Instructions: Open @BlueBeaconBot → /connect [code]
- Polling every 5s for 60s checking user_channels.status

**Slack integration:**
- Paste webhook URL field
- "Test" button → POST to webhook with sample payload
- Shows "200 OK — 234ms" or error

**"DEPLOY COUNTERMEASURES" fix:**
- Rename to "Set Alert for This Signal"
- Color: change from red to green accent
- Behavior: opens pre-filled alert rule creation modal
  - Pre-fills: region = signal.region, min_severity = signal.severity - 1, channels = ['telegram']

**Filter controls (on signal stream):**
- Tabs: ALL SIGNALS / WATCHLIST / ARCHIVES
- Severity pills: GLOBAL / HIGH / MEDIUM / LOW
- Sector dropdown: All / Energy / Metals / Agriculture / FX
- Timeframe dropdown: Last 24 Hours / 48 Hours / 7 Days

---

### 2.13 /backtesting (Quantitative Simulator)

**Purpose:** Historical scenario research. "What happened to markets when similar events occurred in the past?"

**Layout:**
- Page header: "SCENARIO RESEARCH / Backtesting Lab"
- Subtitle: "Analyze historical market volatility markers and validate predictive models against real-world geopolitical events."
- Pre-built simulations section (6 cards)
- Custom parameters form
- Results area (appears after run)
- Right panel: "GENESIS-X_V4 / ACTIVE HISTORICAL ENGINE" branding

**Pre-built simulations (6):**
1. Houthi Red Sea attack → WTI Oil (24hr)
2. Russia sanctions announcement → EUR/USD (48hr)
3. Black Sea grain corridor halt → Wheat (7d)
4. Iran vessel seizure → Brent Crude (24hr)
5. Ukraine conflict escalation → Natural Gas (48hr)
6. Sudan coup → Gold (24hr)

Each card shows: title, "INITIALIZE SIMULATION" button
Click: pre-fills form below AND auto-runs the backtest

**Custom form fields:**
- Event type: text input (e.g. "Coup, Blockade, Sanction")
- Region: dropdown (Middle East / Eastern Europe / Africa / Asia-Pacific / Americas / Global)
- Commodity: dropdown (WTI CRUDE / BRENT / GOLD / NGAS / WHEAT / COPPER)
- Analysis horizon: 4hr / 24hr / 48hr / 7d (button group)
- "RUN BACKTEST →" button

**Results display (after running):**
- 5 stat cards: Total events, Directional accuracy %, Avg move %, Max move, Min move
- Scatter plot: X = severity, Y = % price change, dots colored by direction
- Results table: Date | Country | Event | Price at Signal | Price +Horizon | % Move | Direction | Correct?

**DEMO MODE BANNER (required on all results):**
```
⚠ Scenario Research Mode — Results are illustrative simulations based on historical event patterns.
Real historical backtesting with live data coming in Beta.
```
Background: amber-subtle, text-warning. Cannot be missed.

**Current status:** Returns mock data from sine-curve mathematical generation. No real historical computation. The backtest_cache table exists but the route (backtesting.ts) calls mockResult() instead of querying real data.

**Future real implementation:**
1. Query GDELT for historical events matching event_type + region
2. Fetch Alpha Vantage historical prices for commodity at T=event_date and T=event_date+horizon
3. Cache in backtest_cache with expires_at = now() + 24hr
4. Return real results

---

### 2.14 /settings (System Configuration)

**Purpose:** User account management, notification preferences, appearance, security, data export.

**Layout:**
- Page title: "Settings / SYSTEM CONFIGURATION & USER PREFERENCES"
- 5 tabs: Account | Notifications | Appearance | Security | Data
- Footer: ACCESS_POINT: BB-ALPHA-09 | ENCRYPTION: AES-256 | SESSION_ID: [id]

**Account tab (built):**
- Full Name (editable text input)
- Email Address (locked "LOCKED BY SECURITY PROTOCOL")
- "SAVE CHANGES" button (green) → updates profiles.full_name

**Notifications tab (needs build):**
- Master toggle "All notifications"
- Per-channel toggles:
  - Telegram alerts: on/off
  - Email alerts: on/off + frequency (immediate/hourly/daily)
  - Morning brief: on/off
  - Breaking events (severity 9+): always on with explanation
- Min severity slider
- Quiet hours toggle + start/end time pickers
- "Manage alert rules →" link to /alerts

**Appearance tab (needs build):**
- Theme: Dark (default) / Light — toggle cards
- Compact mode: toggle (reduces padding)
- "Use system preference" checkbox

**Security tab (needs build):**
- Change password form (current → new → confirm)
- Active sessions table (device, IP, last active, "Revoke" button each)
- "Sign out of all devices" button

**Data tab (needs build):**
- Usage stats: signals viewed, backtests run, alerts received
- "Request data export" button → triggers async job → emailed
- "Delete account" → confirm dialog requiring typing "DELETE" → cancel subscription → anonymize data → delete auth user

**API Keys section (within Settings → shown for Pro/API tier):**
- List of existing bb_live_... keys (masked after first creation)
- "Create new key" → shows key ONCE in modal with copy button
- Key stored as SHA-256 hash, raw key never stored
- Max 5 keys per account
- Delete button for each key

---

### 2.15 /status — now automated (was: static page — needs build)

**Purpose:** Public system status page for trust

**Content:**
- "All Systems Operational" (or degraded/outage)
- 4 system checks: Intelligence Feed / Alert Delivery / Global Map / Data Pipeline
- Status for each: green Operational / amber Degraded / red Outage
- "Last updated: [timestamp]"
- Initially all hardcoded green. Later: automate via /v1/health/pipeline endpoint.

> ⚠️ UPDATED 2026-08-25 — The "Later: automate" step happened. All 4 checks listed above are now real (`apps/web/lib/status-checks.ts`), each degrading to amber "Degraded" or a distinct grey "Unknown" (a status/UI distinction this spec didn't originally call for, added so a check that itself failed — timeout, bad query — never gets silently reported as green) instead of staying hardcoded green. Implemented as direct DB/Redis checks inside apps/web rather than a dedicated `/v1/health/pipeline` backend endpoint — apps/web has no existing pattern of calling apps/backend directly, so a new cross-service endpoint would have been a bigger, riskier change than this page needed. "Last updated" is now a genuine per-request timestamp — the page was also, separately, discovered to be statically prerendered at build time until this fix (`export const dynamic = "force-dynamic"` was missing), so even that one honest-looking element wasn't actually live before. See `docs/brain/08_CURRENT_STATUS.md` and `14_CHANGELOG.md` v0.28.5.

---

### 2.16 /accuracy (public page — needs build)

**Purpose:** Public live track record page. Most powerful marketing asset.

**Content:**
- "Signal Accuracy — Live Track Record"
- 4 stat cards: Total signals (30 days), Directional accuracy 24hr, Avg move when correct, Current streak
- Recent signals table: Date | Event | Asset | Predicted | Actual Move 24hr | Correct?
- Note: uses alerts_sent.outcome_direction (filled by outcome-tracker worker)
- NO user-specific data shown — only aggregate BBR signal performance
- Link from landing page hero and pricing section

---

## 3. PLANNED FEATURES (NOT YET BUILT)

### 3.1 Economic Calendar (/calendar)

**Why needed:** ForexFactory, TradingEconomics, InvestingLive all have this. Traders need it daily. Without it, traders keep opening ForexFactory alongside BBR — we lose daily session time.

**What it does:** Shows scheduled macro events: Fed rate decisions, CPI, NFP, GDP releases, OPEC meetings, etc. When an event releases an actual value that beats/misses forecast, Claude generates a BBR signal automatically.

**Data source:** Trading Economics free API (tradingeconomics.com) + static fallback JSON

**DB table needed:** economic_events (see 04_DATABASE.md)

**Integration with signal pipeline:** When actual != previous AND impact = 'high' → trigger Claude to generate signal → appears in intelligence feed with event_type = 'macro_release'

**Page layout:**
- Two tabs: Today / This Week
- Events listed with: impact dot (red/amber/green), flag + country, time countdown, event name, forecast/previous/actual
- High impact events: border-left-2 border-danger
- Calendar added to sidebar nav (Lucide CalendarDays icon, between Map and Alerts)

### 3.2 Price-at-Signal Display on Signal Cards

**Why needed:** Stocknews.ai does this. Traders immediately know if they're early or late.

**What it shows:** "WTI at signal: $84.20 | Now: $87.31 +3.7% ↑ · 4h 23m ago"

**Implementation:**
- Add price_at_signal JSONB column to signals table
- Capture commodity price at classification time → store in price_at_signal
- On signal card: fetch current price, calculate % change, display
- Only show for signals < 72 hours old
- Green for positive, red for negative

### 3.3 Morning Intelligence Brief (Automated)

**What it is:** Daily automated brief at 07:45 UTC (weekdays) summarizing:
- Top signals from last 24 hours
- Today's high-impact economic calendar events
- Current commodity price levels

**Delivery:** Telegram public channel + email to opted-in users

**Generated by:** Claude Sonnet with structured prompt

**Worker:** morning-brief.ts, cron: '45 7 * * 1-5'

### 3.4 Public Telegram Channel (@BlueBeaconResearch)

**What it is:** Free public channel posting delayed signals (6 hours after real-time)

**Purpose:** Lead generation. Free users see value. Convert to paid.

**Format:** Daily signal card in structured Telegram format with link to bluebeaconresearch.com

**Breaking events:** Posted immediately (no delay) for severity 9-10

**Bot must be added as admin of the channel.**

### 3.5 Alert Sound (Browser)

**Inspired by:** FinancialJuice audio squawk feature

**What it does:** When severity 9+ signal arrives via SSE, plays a subtle 0.5s sine-wave tone (Web Audio API, no external file)

**User control:** Sound toggle in TopBar (Lucide Volume2 / VolumeX), persisted in localStorage, default OFF

### 3.6 Real Backtesting

**Replace:** mockResult() in backtesting.ts
**With:** Real GDELT historical query + Alpha Vantage historical prices
**Requirement:** Alpha Vantage paid tier ($50/mo) for historical data access
**Cache:** backtest_cache table with expires_at 24hr

---

## 4. REMOVED FEATURES (AND WHY)

### 4.1 India-Specific Positioning
**Originally:** BBR was to be marketed specifically at Indian commodity traders (2.5M+ on MCX/NSE).
**Removed:** Global positioning adopted instead. India remains a strong market but limiting to India reduces total addressable market and makes the product seem parochial.
**Lesson:** India-first launch is still valid as a go-to-market strategy, but the product itself must be global.

### 4.2 WhatsApp Alerts
**Discussed:** WhatsApp Business API for Indian market (500M+ users).
**Deferred:** WhatsApp API has significant friction (requires business verification, per-conversation charges, approval process). Launch with Telegram first. Add WhatsApp in V2 if Indian market adoption proves strong.

### 4.3 Portfolio Management
**Discussed:** Track user positions and calculate P&L impact of signals.
**Removed:** Outside core competency. Users have their own broker platforms. Scope creep that would require securities licensing in some jurisdictions.

### 4.4 Crypto Tracking
**Discussed:** Bitcoin, Ethereum price impact from geopolitical events.
**Deferred:** Too crowded a market. Different audience behavior. Crypto traders already have CoinGecko, CryptoCompare, Messari. Save for V3 if requested by users.

### 4.5 Stock-Specific Signals
**Discussed:** Individual equity analysis (like Stocknews.ai).
**Removed:** Different customer profile. BBR users are macro/commodity traders, not equity traders. Stay focused.

### 4.6 Claude as Sole AI Provider
**Originally:** Anthropic Claude only.
**Changed to:** Claude 3.5 Haiku (classification) + Claude 3.5 Sonnet (full briefings) as primary. Gemini Flash-Lite + Groq Llama 3.3 70B as cost-saving alternatives discussed.
**Current status:** Production still uses Claude 3.5. Cost monitoring not in place. At 350 raw events/15min without pre-filtering = $400/month risk. Pre-filter must be implemented urgently.

---

## 5. USER JOURNEYS (COMPLETE)

### 5.1 New User Complete Journey

```
Visit bluebeaconresearch.com
→ See hero + live signal preview (blurred)
→ "AUTHORIZE FULL ACCESS" or "ESTABLISH INTEL LINK"
→ /signup (select plan — all currently = pro)
→ Email verification
→ /onboarding (name + use case + Telegram connect)
→ /dashboard (see intelligence feed)
→ Notice a severity 8 signal in the feed
→ Click "ANALYZE IMPACT"
→ /events/[id] — read full Claude AI briefing
→ /alerts — create alert rule for Middle East energy events
→ Connect Telegram bot
→ Next time: Telegram message arrives before they open laptop
→ Check /watchlist to see WTI price movement
→ /map to see geographic context
→ /backtesting to research "Iran naval → oil" historical pattern
→ Upgrade to Analyst plan when Stripe is live
```

### 5.2 Daily Active User Journey

```
08:00 UTC — Morning Brief arrives on Telegram (when built)
Open link → /events/[id] of biggest overnight event
Check right sidebar severity breakdown
Filter dashboard by HIGH RISK if something significant
If signal matches their position → take action
If new concern → add commodity to /watchlist
Evening → check signal velocity chart on /alerts
Weekly → check /backtesting for research
Monthly → check /settings to adjust alert thresholds
```

### 5.3 Quant/Algo Trader Journey (API Tier)

```
Sign up → /settings → API Keys → create bb_live_... key
Read /docs API documentation
Test: curl /v1/signals?severity=8 -H "Authorization: Bearer bb_live_..."
Build webhook receiver → configure in /settings → Webhook Endpoints
Test webhook delivery
Start receiving structured JSON signal data into their system
Use signal payload for automated trading decisions
```
