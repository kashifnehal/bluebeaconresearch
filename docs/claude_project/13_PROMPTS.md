# 13_PROMPTS.md — All Reusable Prompts

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Classification: Internal — CTO Level**
**Includes:** Cursor/Antigravity IDE prompts, Claude AI signal prompts, marketing prompts

---

## SECTION A: CURSOR / ANTIGRAVITY IDE PROMPTS

### PROMPT A1 — Fix Signal Quality + Pre-filter
**Use when:** Dashboard shows irrelevant signals (sports, celebrity), COUNTRY = UNKNOWN, duplicates, all 40% confidence.

```
You are fixing signal quality in Blue Beacon Research (apps/backend = Fastify + workers, apps/web = Next.js).

TASK 1 — Add pre-filter in gdelt-collector.ts and gnews-collector.ts
BEFORE sending events to the BullMQ classification queue, apply this filter:

const HIGH_RELEVANCE_KEYWORDS = [
  'war','conflict','attack','strike','missile','bomb','explosion','troops','military',
  'sanction','blockade','invasion','offensive','airstrike','ceasefire','troops','coup',
  'oil','crude','gas','pipeline','refinery','opec','hormuz','energy','fuel','tanker',
  'tariff','embargo','trade war','inflation','rate decision','central bank','interest rate',
  'cpi','gdp','recession','iran','russia','ukraine','china','taiwan','israel','hamas',
  'houthi','nato','nuclear','protest','riot','civil war','tension','terrorist','conflict zone',
  'wheat','grain','food','gold','copper','commodity','shortage','supply chain','sanctions',
  'shipping','suez','malacca','red sea','vessel','port','chokepoint'
]

const EXCLUDE_KEYWORDS = [
  'sports','football','soccer','fifa','nfl','nba','olympics','marathon','cricket',
  'celebrity','music','movie','film','award','oscar','grammy','fashion','lifestyle',
  'recipe','cooking','tourism','travel','entertainment','celebrity','romance'
]

function isRelevantEvent(title: string, summary: string = ''): boolean {
  const text = (title + ' ' + summary).toLowerCase()
  const hasExclude = EXCLUDE_KEYWORDS.some(kw => text.includes(kw))
  if (hasExclude) return false
  return HIGH_RELEVANCE_KEYWORDS.some(kw => text.includes(kw))
}

In the event processing loop, BEFORE adding to BullMQ:
if (!isRelevantEvent(event.title, event.summary)) {
  console.log('[FILTER] Skipped:', event.title)
  skipCount++
  continue
}

Apply this in BOTH gdelt-collector.ts AND gnews-collector.ts.

TASK 2 — Fix COUNTRY = UNKNOWN
In ai-classifier.ts or wherever signals are generated:
GDELT provides ActionGeo_CountryCode (2-letter ISO). Map it:

const COUNTRY_CODES: Record<string, string> = {
  US:'United States', IR:'Iran', UA:'Ukraine', RU:'Russia', IL:'Israel',
  SA:'Saudi Arabia', CN:'China', SY:'Syria', IQ:'Iraq', AF:'Afghanistan',
  YE:'Yemen', LY:'Libya', SD:'Sudan', ET:'Ethiopia', IN:'India', PK:'Pakistan',
  TR:'Turkey', EG:'Egypt', KW:'Kuwait', AE:'UAE', OM:'Oman', QA:'Qatar',
  MY:'Malaysia', ID:'Indonesia', NG:'Nigeria', MZ:'Mozambique', SO:'Somalia',
  KR:'South Korea', JP:'Japan', KP:'North Korea', MM:'Myanmar', BD:'Bangladesh',
  VE:'Venezuela', CO:'Colombia', MX:'Mexico', BR:'Brazil', AR:'Argentina',
  FR:'France', DE:'Germany', GB:'United Kingdom', PL:'Poland', RO:'Romania'
}

const country = COUNTRY_CODES[rawEvent.ActionGeo_CountryCode]
  || rawEvent.ActionGeo_CountryCode
  || 'Global'

TASK 3 — Fix duplicate signals
In ai-classifier.ts, before inserting a new signal:
const { data: existing } = await supabase
  .from('signals')
  .select('id')
  .contains('raw_event_ids', [rawEventId])
  .single()

if (existing) {
  console.log('[DEDUP] Skipped duplicate for raw_event:', rawEventId)
  return
}

TASK 4 — Fix confidence calibration
In claude.service.ts classification prompt, update the confidence instruction:
"confidence: A float 0.0–1.0. Score 0.85–1.0 ONLY for direct kinetic attacks on infrastructure or announced policy changes already in effect. Score 0.60–0.84 for credible threats or near-term developments. Score 0.40–0.60 for indirect or escalation risks. Score below 0.40 for speculative or unlikely impacts."

After changes: pnpm turbo build. Fix TypeScript errors.
Commit: "fix: signal quality pre-filter + country codes + dedup + confidence calibration"
```

---

### PROMPT A2 — Fix Railway + Price Syncer (Yahoo Finance)
**Use when:** Watchlist shows skeleton loading forever. Alpha Vantage exhausted.

```
Fix the commodity price syncer in Blue Beacon Research (apps/backend).
The current Alpha Vantage implementation (25 req/day free) is exhausted immediately.
Replace with Yahoo Finance which is free and unlimited.

TASK 1 — Install yahoo-finance2
In apps/backend: add "yahoo-finance2": "^2.11.0" to package.json dependencies.
Run: pnpm install

TASK 2 — Rewrite price-syncer.ts
Replace the entire file content:

import yahooFinance from 'yahoo-finance2'
import { supabase } from '../lib/supabase'
import { redis } from '../lib/redis'
import cron from 'node-cron'

const COMMODITY_SYMBOLS: Record<string, string> = {
  USOIL:  'CL=F',
  UKOIL:  'BZ=F',
  XAUUSD: 'GC=F',
  NGAS:   'NG=F',
  WHEAT:  'ZW=F',
  COPPER: 'HG=F',
  XAGUSD: 'SI=F',
  CORN:   'ZC=F',
}

const FALLBACK_PRICES: Record<string, number> = {
  USOIL: 78.50, UKOIL: 82.30, XAUUSD: 2340.00,
  NGAS: 2.85, WHEAT: 540.00, COPPER: 4.25, XAGUSD: 29.50, CORN: 430.00
}

async function syncPrices(): Promise<void> {
  console.log('[PRICE SYNC] Starting price sync...')
  const records = []

  for (const [symbol, yahooSymbol] of Object.entries(COMMODITY_SYMBOLS)) {
    try {
      const quote = await yahooFinance.quote(yahooSymbol)
      if (quote.regularMarketPrice) {
        const record = {
          symbol,
          price: quote.regularMarketPrice,
          change_24h: quote.regularMarketChange ?? 0,
          change_pct_24h: quote.regularMarketChangePercent ?? 0,
          high_24h: quote.regularMarketDayHigh ?? quote.regularMarketPrice,
          low_24h: quote.regularMarketDayLow ?? quote.regularMarketPrice,
          fetched_at: new Date().toISOString(),
        }
        records.push(record)
        await redis.set(`prices:${symbol}`, JSON.stringify(record), { ex: 900 })
        console.log(`[PRICE SYNC] ${symbol}: $${record.price}`)
      }
    } catch (err: any) {
      console.error(`[PRICE SYNC] Failed for ${symbol}:`, err.message)
      // Serve stale cached price — never serve null
      const cached = await redis.get(`prices:${symbol}`)
      if (!cached && FALLBACK_PRICES[symbol]) {
        await redis.set(`prices:${symbol}`, JSON.stringify({
          symbol, price: FALLBACK_PRICES[symbol],
          change_24h: 0, change_pct_24h: 0,
          fetched_at: new Date().toISOString()
        }), { ex: 900 })
      }
    }
  }

  if (records.length > 0) {
    await supabase.from('commodity_prices').insert(records)
    console.log(`[PRICE SYNC] Synced ${records.length} symbols`)
  }
}

// Run every 15 minutes
cron.schedule('*/15 * * * *', syncPrices)

// Run immediately on start
syncPrices()

TASK 3 — Ensure fallback in prices API route
In apps/backend/src/routes/prices.ts:
If Supabase query returns empty array → fetch from Redis → if Redis miss → return FALLBACK_PRICES.
Never return empty array. Always return some price data.

After changes: pnpm turbo build. Fix TypeScript errors.
Commit: "fix: Yahoo Finance price sync (unlimited free) + Redis fallback + hardcoded fallback"
```

---

### PROMPT A3 — Google OAuth Fix
**Use when:** "Continue with Google" button does nothing on login/signup.

```
Fix Google OAuth in Blue Beacon Research. The button exists but does not work.

TASK 1 — Create OAuth callback route
Create file: apps/web/app/auth/callback/route.ts

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const errorParam = searchParams.get('error')
  const errorDesc = searchParams.get('error_description')

  if (errorParam) {
    console.error('[OAuth Error]', errorParam, errorDesc)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDesc ?? errorParam)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=No+auth+code+received`)
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }) },
        remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }) },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  if (data.session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', data.session.user.id)
      .single()
    if (!profile?.onboarding_completed) {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}

TASK 2 — Fix the Google button in login and signup pages
In both apps/web/app/(auth)/login/page.tsx AND apps/web/app/(auth)/signup/page.tsx:

Find the "Continue with Google" button. Add this function and attach it to onClick:

const handleGoogleLogin = async () => {
  const { createBrowserClient } = await import('@supabase/ssr')
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
  if (error) {
    console.error('[Google OAuth]', error)
    // Show error in UI
  }
}

TASK 3 — Show URL error params on login page
In apps/web/app/(auth)/login/page.tsx, at top of component:
const searchParams = useSearchParams()
const urlError = searchParams.get('error')

If urlError, show below the form:
<div className="text-red-400 text-sm text-center mt-3 p-3 border border-red-800 rounded-md bg-red-950/30">
  {decodeURIComponent(urlError)}
</div>

TASK 4 — Supabase trigger for OAuth users
Run this SQL in Supabase SQL Editor:

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, plan_tier, onboarding_completed)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    'free', false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

After code changes: pnpm turbo build. Fix TypeScript errors.
Commit: "fix: Google OAuth callback route + login/signup handler + profile trigger"
```

---

### PROMPT A4 — Fix All Non-Functional UI Elements
**Use when:** Search bar, bell, ?, avatar dropdown, footer links, signal rows all doing nothing.

```
Fix all non-functional UI elements in Blue Beacon Research. Every interactive element must work.

TASK 1 — Search bar (TopBar)
Find TopBar.tsx. The search input has no onChange/onSubmit.
Add:
- const [query, setQuery] = useState('')
- onChange: setQuery + debounce 300ms → useFeedStore.setSearchQuery(query)
- onKeyDown Enter: call GET /v1/signals?search=query → update feed
- Show X button (Lucide X, 14px) inside input when query non-empty → onClick: setQuery('')
In signal feed component: filter signals by searchQuery (client-side, title+country+event_type)

TASK 2 — Notification Bell
Create NotificationPanel.tsx at apps/web/components/NotificationPanel.tsx:
- Fixed right drawer, w-[360px], slides in from right, full height
- Header: "Recent Alerts" + X close button + "Mark all read" button
- Fetch GET /v1/alerts/recent → list of last 10 alerts_sent with signal titles
- Each row: severity dot (colored by signal.severity) + "X min ago" + signal title + "View →" link to /events/[id]
- Unread rows: bg-elevated. Read rows: normal.
- Empty state: Bell icon + "No alerts yet"
- Footer: "Manage alert rules →" → /alerts
- On open: mark all as read (PATCH /v1/alerts/mark-read)
In TopBar: bell onClick toggles useUIStore.notificationPanelOpen. Render <NotificationPanel> when open.

TASK 3 — Help Icon (?)
Create HelpModal.tsx at apps/web/components/HelpModal.tsx:
Centered modal, max-w-lg, 5 accordion sections:
1. "Reading signal cards" — severity 1-10 scale, confidence %, direction arrows
2. "Setting up Telegram alerts" — step 1: go to /alerts, step 2: click Connect Telegram, step 3: message @BlueBeaconBot
3. "Using the Global Map" — click conflict dots, Global Tension Index explained
4. "Backtesting" — disclaimer that current data is illustrative
5. "Contact support" — <a href="mailto:support@bluebeaconresearch.com">support@bluebeaconresearch.com</a>
Close: X button + click outside overlay.
In TopBar: ? onClick toggles useUIStore.helpModalOpen.

TASK 4 — User Avatar Dropdown
In TopBar, find the user avatar circle (shows initials).
Add onClick → small dropdown:
- User full_name (bold, non-clickable)
- User email (text-muted text-sm, non-clickable)
- Separator
- "Settings" → router.push('/settings')
- "Alerts" → router.push('/alerts')
- Separator
- "Sign out" → supabase.auth.signOut() then router.push('/login')
Use useEffect with document.addEventListener('click') to close dropdown on outside click.

TASK 5 — Rename DEPLOY COUNTERMEASURES
In apps/web/app/(dashboard)/alerts/page.tsx:
Find the red "DEPLOY COUNTERMEASURES" button.
RENAME text to: "Set Alert for This Signal"
CHANGE className: remove all red/danger classes, replace with bg-accent text-black
CHANGE onClick: open alert rule creation form/modal pre-filled with the current featured signal's region and event_category

TASK 6 — Fix Footer Links on Landing Page
In apps/web/app/page.tsx footer:
Replace non-working hrefs:
  Terminal → /dashboard
  Global Map → /map
  Signals → /dashboard
  Research → /backtesting
  Documentation → /terms
  Compliance → /privacy
  Auth Center → /login
  System Status → /status
  Encrypted Support → mailto:support@bluebeaconresearch.com

Create apps/web/app/status/page.tsx:
Simple static page. Title: "System Status". Show 4 green dots: Intelligence Feed, Alert Delivery, Global Map, Data Pipeline — all "Operational". Add "Last updated: [date]".

TASK 7 — Make signal rows clickable
In dashboard/page.tsx: every row in "Recent Signal Stream" needs onClick: router.push('/events/' + signal.id)
In alerts/page.tsx: every row in "Geospatial Intelligence Stream" needs same
In map/page.tsx: "CRITICAL INTERVENTION →" links in right panel need href="/events/[id]"

After all changes: pnpm turbo build. Fix TypeScript errors.
Commit: "feat: search bar + notification panel + help modal + avatar dropdown + footer links + signal row clicks"
```

---

### PROMPT A5 — Error Boundaries + Empty States + Backtesting Disclaimer
```
Add stability features to Blue Beacon Research.

TASK 1 — ErrorBoundary component
Create apps/web/components/ErrorBoundary.tsx as a class component:
class ErrorBoundary extends React.Component<{children: ReactNode, fallback?: ReactNode}, {hasError: boolean}> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[BBR Error]', error, info) }
  render() {
    if (this.state.hasError) return this.props.fallback ?? <DefaultErrorUI onReset={() => this.setState({hasError:false})} />
    return this.props.children
  }
}

DefaultErrorUI: centered dark card, Lucide AlertTriangle amber 40px, "Something went wrong", "Reload Feed" button → window.location.reload()

Wrap in apps/web/app/(dashboard)/layout.tsx:
  <ErrorBoundary><Sidebar /></ErrorBoundary>
  <ErrorBoundary><SignalFeed /></ErrorBoundary>
  <ErrorBoundary><PriceTicker /></ErrorBoundary>

Create apps/web/app/error.tsx (global):
'use client'
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html><body style={{background:'#050914',display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>
      <div style={{textAlign:'center',color:'white'}}>
        <div style={{fontSize:48,marginBottom:16}}>⚠</div>
        <div style={{fontSize:20,marginBottom:8}}>Terminal Telemetry Offline</div>
        <div style={{color:'#94A3B8',marginBottom:24,fontSize:13}}>Node: BB-ALPHA-09</div>
        <button onClick={reset} style={{background:'#10B981',border:'none',padding:'8px 24px',borderRadius:6,cursor:'pointer',fontWeight:500}}>
          RELOAD FEED
        </button>
      </div>
    </body></html>
  )
}

Create apps/web/app/(dashboard)/error.tsx with same content.
Create apps/web/app/(dashboard)/loading.tsx with terminal loading spinner.

TASK 2 — EmptyState component
Create apps/web/components/EmptyState.tsx:
interface EmptyStateProps { icon: LucideIcon; title: string; description: string; action?: { label: string; href?: string; onClick?: () => void } }
Layout: flex-col items-center text-center py-16 px-8. Icon 48px text-muted opacity-50. Title text-primary font-medium. Description text-secondary text-sm mb-6.
Action: if href use <Link>, else use <button onClick={action.onClick}>, both styled bg-accent text-black rounded-md px-4 py-2 text-sm.

Use in:
- Dashboard feed (0 signals): Globe icon + "Monitoring global events" + "First signal appears within 15 minutes."
- Alerts (0 rules): Bell icon + "No alert rules yet" + "Create first rule" button opening create form
- Watchlist (empty): BarChart2 icon + "Add commodities to track"
- Calendar (0 events): Calendar icon + "No high-impact events today"
- events/[id] (not found): Search icon + "Signal not found" + "Return to feed" link href="/dashboard"

TASK 3 — Demo Mode banner on backtesting
In apps/web/app/(dashboard)/backtesting/page.tsx:
After results are returned, add this banner ABOVE the results content:
<div className="border border-amber-500/30 bg-amber-950/20 rounded-lg p-3 flex items-center gap-3 mb-4">
  <span className="text-amber-400 text-lg">⚠</span>
  <div>
    <span className="text-amber-400 text-sm font-medium">Scenario Research Mode</span>
    <span className="text-slate-400 text-sm"> — Results are illustrative simulations. Real historical backtesting with live data is coming in Beta.</span>
  </div>
</div>

TASK 4 — Loading states
Create apps/web/app/(dashboard)/loading.tsx:
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0D1117]">
      <div className="text-center">
        <div className="text-[#10B981] text-sm font-mono animate-pulse tracking-widest">ESTABLISHING SECURE CONNECTION...</div>
        <div className="text-[#4B5563] text-xs mt-2 font-mono">Node: BB-ALPHA-09</div>
      </div>
    </div>
  )
}

After all changes: pnpm turbo build. Fix TypeScript errors.
Commit: "fix: error boundaries + empty states + loading states + backtesting disclaimer"
```

---

## SECTION B: CLAUDE AI SIGNAL PROMPTS

### PROMPT B1 — Event Classification Prompt
Used in `claude.service.ts` classifyEvent method.

```
You are an expert geopolitical analyst specializing in commodity market impact assessment.
Analyze the following event and return ONLY a valid JSON object — no preamble, no explanation, no markdown.

EVENT TITLE: {title}
EVENT SUMMARY: {summary}
COUNTRY: {country}
REGION: {region}
SOURCE: {source}
EVENT DATE: {eventDate}
ADDITIONAL CONTEXT: {actorContext}

Return this exact JSON structure:
{
  "severity": <integer 1-10>,
  "confidence": <float 0.0-1.0>,
  "event_type": "<string: conflict|sanctions|trade_policy|naval_exercise|military_buildup|cyber_attack|election|coup|protest|energy_disruption|food_security|natural_disaster|central_bank|other>",
  "event_category": "<string: conflict|sanctions|trade_policy|central_bank|food_security|energy|election|natural_disaster|macro_release|other>",
  "commodity_impacts": [
    {
      "asset": "<USOIL|UKOIL|XAUUSD|NGAS|WHEAT|COPPER|XAGUSD|CORN|EURUSD|USDRUB>",
      "direction": "<up|down|volatile|neutral>",
      "confidence": <float 0.0-1.0>
    }
  ],
  "summary": "<1-2 sentence neutral factual summary of what happened>",
  "consumer_impact": "<1 sentence on how this affects consumer prices, or null>",
  "is_breaking": <true if this is an unfolding crisis in last 2 hours, false otherwise>
}

Severity scale:
10 = Active nuclear threat, direct attack on major oil infrastructure, war declaration between major powers
9 = Major military strike, Strait of Hormuz closure, critical sanctions on G20 member
8 = Significant escalation, major sanctions package, oil field attack
7 = Credible military threat, sanctions on secondary actors, significant protest that disrupts trade
1-6 = Diplomatic tensions, minor protests, policy statements, market commentary

Confidence scale:
0.85-1.0 = Direct physical attack on commodity infrastructure already confirmed
0.60-0.84 = High credibility threat with multiple source confirmation
0.40-0.60 = Indirect risk, escalation pathway, speculative
0.00-0.39 = Unlikely to materially impact commodity markets

Only include commodity_impacts where there is a plausible market mechanism linking this event to that commodity.
Maximum 3 commodity_impacts. Return empty array [] if no clear commodity connection.
```

### PROMPT B2 — Full Intelligence Briefing Prompt
Used in `claude.service.ts` generateBriefing method for severity ≥ 7 signals.

```
You are Blue Beacon Research's senior intelligence analyst.
Write a professional intelligence briefing for the following geopolitical event.

EVENT: {title}
COUNTRY: {country}
REGION: {region}
SEVERITY: {severity}/10
EVENT TYPE: {eventType}
SOURCES CONFIRMED: {sourcesCount}

ADDITIONAL CONTEXT:
- Actors involved: {actors}
- Recent related events in this region: {relatedEvents}
- Commodity impact assessment: {commodityImpacts}
- Shipping proximity: {shippingProximity}

Write a 5-7 paragraph intelligence briefing structured exactly as:

Paragraph 1 — SITUATION: What happened, confirmed facts only, neutral tone.
Paragraph 2 — CONTEXT: Historical background, why this region/actor matters geopolitically.
Paragraph 3 — MARKET MECHANISM: Specifically how this event connects to commodity markets. Name the mechanism (supply disruption, demand shock, risk premium, etc.)
Paragraph 4 — HISTORICAL PRECEDENT: What happened in 2-3 similar historical events? What were the typical market moves and over what timeframe?
Paragraph 5 — RISK ASSESSMENT: Escalation scenarios (what happens if this gets worse) vs. de-escalation (what happens if it resolves).
Paragraph 6 — WATCH INDICATORS: Specific signals analysts should monitor in the next 24-72 hours to assess whether this escalates or resolves.
Optional Paragraph 7 — SUPPLY CHAIN NOTE: If relevant to import/export businesses, note specific supply chain implications.

Style requirements:
- Professional, measured tone — no sensationalism
- Active voice, short paragraphs
- Specific numbers and dates where known
- Never make buy/sell recommendations
- End with: "Intelligence provided for informational purposes only. Not financial advice."
- Maximum 600 words total
```

### PROMPT B3 — Morning Brief Generation
Used in `morning-brief.ts` worker.

```
You are Blue Beacon Research's morning intelligence analyst.

Write a concise morning intelligence brief for commodity traders.
Today's date: {date}
Time: 07:45 UTC

TOP SIGNALS FROM LAST 24 HOURS:
{topSignals}

TODAY'S SCHEDULED HIGH-IMPACT EVENTS:
{economicCalendar}

CURRENT COMMODITY PRICES:
{prices}

Write the morning brief in this exact format:

BLUE BEACON RESEARCH — MORNING BRIEF
{date} | 07:45 UTC
━━━━━━━━━━━━━━━━━━━━

OVERNIGHT INTELLIGENCE SUMMARY
[2-3 sentences on the most important geopolitical development from the last 24 hours and its market relevance]

TODAY'S CRITICAL EVENTS
[Bullet list of max 3 high-impact scheduled events today: time UTC, event name, consensus expectation, why it matters]

MARKET CONTEXT
[2 sentences on current commodity price levels and any notable overnight moves]

ANALYST NOTE
[1 sentence on the primary risk to watch today]
━━━━━━━━━━━━━━━━━━━━
Intelligence for informational purposes only. Not financial advice.
bluebeaconresearch.com

Maximum 250 words. Direct, confident, specific. Professional tone.
```
