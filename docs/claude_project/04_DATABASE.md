# 04_DATABASE.md — Complete Database Schema

**Provider:** Supabase (PostgreSQL 15 + PostGIS)
**Classification: Internal — CTO Level**

---

## 1. COMPLETE TABLE DEFINITIONS

### 1.1 profiles
Auto-created via DB trigger on auth.users INSERT.

```sql
CREATE TABLE public.profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT,
  avatar_url            TEXT,
  plan_tier             TEXT NOT NULL DEFAULT 'free'
                          CHECK (plan_tier IN ('free','analyst','pro','api')),
  stripe_customer_id    TEXT UNIQUE,
  onboarding_completed  BOOLEAN NOT NULL DEFAULT false,
  push_tokens           TEXT[] DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Key notes:**
- `id` is the Supabase auth user UUID — same UUID across all tables
- `plan_tier` currently hardcoded to 'pro' for all users (Stripe not live)
- `push_tokens` array stores Expo push tokens for mobile notifications
- Trigger auto-creates row on signup (both email and Google OAuth)

**Trigger:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, plan_tier, onboarding_completed)
  VALUES (
    new.id,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    'free',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

---

### 1.2 user_preferences
Stores per-user intelligence preferences set during onboarding.

```sql
CREATE TABLE public.user_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  regions         TEXT[] DEFAULT '{}',
  commodities     TEXT[] DEFAULT '{}',
  min_severity    INTEGER NOT NULL DEFAULT 7,
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  quiet_start     TIME,
  quiet_end       TIME,
  theme           TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system')),
  email_frequency TEXT NOT NULL DEFAULT 'immediate'
                    CHECK (email_frequency IN ('immediate','hourly','daily')),
  email_preferences JSONB DEFAULT '{"morning_brief": true, "immediate_alerts": true}',
  use_case        TEXT CHECK (use_case IN ('trader','analyst','risk_manager','other')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);
```

**Key notes:**
- `regions` and `commodities` are TEXT arrays: e.g. ['middle-east','eastern-europe']
- `quiet_start`/`quiet_end` are TIME type — compared against UTC current time in alert-dispatcher
- Severity 10 events bypass quiet hours always
- `email_preferences` JSONB for extensible notification settings

---

### 1.3 raw_events
Every inbound event from all data sources before AI classification.

```sql
CREATE TABLE public.raw_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL CHECK (source IN ('gdelt','acled','gnews','guardian','newsapi','rss','macro')),
  external_id  TEXT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT,
  country      TEXT,
  lat          FLOAT,
  lng          FLOAT,
  event_type   TEXT,
  event_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(external_id, source)
);

CREATE INDEX idx_raw_events_created ON raw_events(created_at DESC);
CREATE INDEX idx_raw_events_source ON raw_events(source);
CREATE INDEX idx_raw_events_dedup ON raw_events(external_id, source);
```

**Key notes:**
- Deduplication: UNIQUE(external_id, source) prevents same story from same source appearing twice
- `raw_data` JSONB stores the full original response payload from the source API
- GDELT external_id = GLOBALEVENTID
- GNews external_id = article URL hash
- ACLED external_id = data_id

---

### 1.4 signals
The core intelligence product. Every classified, AI-analyzed event.

```sql
CREATE TABLE public.signals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_event_ids       UUID[] DEFAULT '{}',
  title               TEXT NOT NULL,
  summary             TEXT NOT NULL,
  ai_analysis         TEXT,
  severity            INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 10),
  confidence          FLOAT NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  event_type          TEXT NOT NULL,
  event_category      TEXT CHECK (event_category IN (
                        'conflict','sanctions','trade_policy','central_bank',
                        'food_security','energy','election','natural_disaster',
                        'macro_release','other'
                      )),
  country             TEXT,
  region              TEXT NOT NULL DEFAULT 'global',
  lat                 FLOAT,
  lng                 FLOAT,
  sources_count       INTEGER NOT NULL DEFAULT 1,
  commodity_impacts   JSONB NOT NULL DEFAULT '[]',
  price_at_signal     JSONB DEFAULT '{}',
  sanctions_matches   JSONB DEFAULT '[]',
  shipping_proximity  JSONB,
  consumer_impact     TEXT,
  is_breaking         BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signals_severity    ON signals(severity DESC);
CREATE INDEX idx_signals_region      ON signals(region);
CREATE INDEX idx_signals_created     ON signals(created_at DESC);
CREATE INDEX idx_signals_category    ON signals(event_category);
CREATE INDEX idx_signals_country     ON signals(country);
CREATE INDEX idx_signals_breaking    ON signals(is_breaking) WHERE is_breaking = true;
CREATE INDEX idx_signals_fulltext    ON signals USING GIN(
  to_tsvector('english', title || ' ' || COALESCE(summary,''))
);
```

**JSONB field schemas:**

`commodity_impacts` array:
```json
[
  {
    "asset": "USOIL",
    "direction": "up",
    "confidence": 0.84
  }
]
```
Valid directions: "up" | "down" | "volatile" | "neutral"
Valid assets: USOIL, UKOIL, XAUUSD, NGAS, WHEAT, COPPER, XAGUSD, CORN, EURUSD, USDRUB

`price_at_signal` object:
```json
{
  "USOIL": 84.20,
  "capturedAt": "2026-02-28T03:42:00Z"
}
```
Captured at classification time. Used for price movement display.

`sanctions_matches` array:
```json
[
  {
    "actor": "Islamic Revolutionary Guard Corps",
    "list": "OFAC",
    "dateAdded": "2019-04-15"
  }
]
```

`shipping_proximity` object:
```json
{
  "chokepoint": "Strait of Hormuz",
  "distanceKm": 22,
  "oilPct": 19
}
```
Only populated if event lat/lng within 400km of a defined chokepoint.

---

### 1.5 commodity_prices
Live commodity price data synced from Yahoo Finance every 15 minutes.

```sql
CREATE TABLE public.commodity_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          TEXT NOT NULL,
  price           FLOAT NOT NULL,
  change_24h      FLOAT NOT NULL DEFAULT 0,
  change_pct_24h  FLOAT NOT NULL DEFAULT 0,
  high_24h        FLOAT,
  low_24h         FLOAT,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commodity_prices_symbol ON commodity_prices(symbol, fetched_at DESC);
CREATE INDEX idx_commodity_prices_recent ON commodity_prices(fetched_at DESC);
```

**Symbols tracked:**
| BBR Symbol | Yahoo Finance | Full Name |
|-----------|--------------|-----------|
| USOIL | CL=F | WTI Crude Oil |
| UKOIL | BZ=F | Brent Crude Oil |
| XAUUSD | GC=F | Gold |
| NGAS | NG=F | Natural Gas |
| WHEAT | ZW=F | Wheat (CBOT) |
| COPPER | HG=F | Copper |
| XAGUSD | SI=F | Silver |
| CORN | ZC=F | Corn |

**Data retention:** Keep last 30 days. Older records purged via cron.

---

### 1.6 alert_rules
User-defined alert delivery rules.

```sql
CREATE TABLE public.alert_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  regions          TEXT[] DEFAULT '{}',
  commodities      TEXT[] DEFAULT '{}',
  min_severity     INTEGER NOT NULL DEFAULT 8 CHECK (min_severity BETWEEN 1 AND 10),
  channels         TEXT[] NOT NULL DEFAULT '{email}',
  frequency        TEXT NOT NULL DEFAULT 'immediate'
                     CHECK (frequency IN ('immediate','hourly','daily')),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_triggered_at TIMESTAMPTZ
);

CREATE INDEX idx_alert_rules_user ON alert_rules(user_id);
CREATE INDEX idx_alert_rules_active ON alert_rules(is_active) WHERE is_active = true;
```

**Matching logic in alert-dispatcher:**
A signal matches a rule if:
- signal.severity >= rule.min_severity
- AND (rule.regions is empty OR signal.region IN rule.regions)
- AND (rule.commodities is empty OR any commodity_impacts[].asset IN rule.commodities)
- AND current UTC time NOT in user quiet_hours window (unless signal.severity = 10)

---

### 1.7 alerts_sent
Record of every alert delivery attempt plus outcome tracking.

```sql
CREATE TABLE public.alerts_sent (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule_id             UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  signal_id           UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('telegram','email','slack','webhook','push')),
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','delivered','failed')),
  delivered_at        TIMESTAMPTZ,
  outcome_direction   TEXT CHECK (outcome_direction IN ('up','down','neutral')),
  outcome_price_change FLOAT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_sent_user    ON alerts_sent(user_id, created_at DESC);
CREATE INDEX idx_alerts_sent_signal  ON alerts_sent(signal_id);
CREATE INDEX idx_alerts_sent_outcome ON alerts_sent(outcome_direction) WHERE outcome_direction IS NULL;
```

**Outcome tracking (outcome-tracker worker):**
- Runs daily 03:00 UTC
- Finds alerts_sent WHERE outcome_direction IS NULL AND created_at BETWEEN now()-48hr AND now()-24hr
- Fetches commodity price at signal.created_at from commodity_prices
- Fetches most recent commodity price
- If % change > 0.5%: outcome_direction = 'up'
- If % change < -0.5%: outcome_direction = 'down'
- Else: outcome_direction = 'neutral'
- Updates outcome_price_change with actual % change

**Accuracy calculation:**
```sql
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN s.commodity_impacts->0->>'direction' = a.outcome_direction THEN 1 END) as correct,
  ROUND(
    COUNT(CASE WHEN s.commodity_impacts->0->>'direction' = a.outcome_direction THEN 1 END)
    * 100.0 / COUNT(*), 1
  ) as accuracy_pct
FROM alerts_sent a
JOIN signals s ON a.signal_id = s.id
WHERE a.outcome_direction IS NOT NULL
  AND a.created_at > NOW() - INTERVAL '30 days';
```

---

### 1.8 user_channels
Stores connected alert delivery channels per user.

```sql
CREATE TABLE public.user_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_type    TEXT NOT NULL CHECK (channel_type IN ('telegram','slack','email','webhook')),
  channel_config  JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','pending')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, channel_type)
);
```

**channel_config schemas by type:**

Telegram:
```json
{ "chat_id": "123456789", "username": "@username" }
```

Slack:
```json
{ "webhook_url": "https://hooks.slack.com/..." }
```

Email:
```json
{ "email": "user@example.com", "frequency": "immediate" }
```

---

### 1.9 watchlist_entries
User's commodity watchlist.

```sql
CREATE TABLE public.watchlist_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  alert_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);
```

---

### 1.10 saved_signals
User's bookmarked/saved signals.

```sql
CREATE TABLE public.saved_signals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  signal_id  UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, signal_id)
);
```

---

### 1.11 backtest_cache
Cached backtest computation results (24hr TTL).

```sql
CREATE TABLE public.backtest_cache (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key    TEXT NOT NULL UNIQUE,
  results      JSONB NOT NULL,
  total_events INTEGER NOT NULL DEFAULT 0,
  accuracy_pct FLOAT,
  avg_move_pct FLOAT,
  is_demo      BOOLEAN NOT NULL DEFAULT true,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_backtest_cache_key     ON backtest_cache(cache_key);
CREATE INDEX idx_backtest_cache_expires ON backtest_cache(expires_at);
```

**cache_key generation:**
```typescript
import { createHash } from 'crypto'
const key = createHash('md5')
  .update(JSON.stringify({ eventType, region, commodity, horizon, dateFrom, dateTo }))
  .digest('hex')
```

---

### 1.12 api_keys
API keys for Pro/API tier users.

```sql
CREATE TABLE public.api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  call_count   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
```

**Key format:** `bb_live_[64 hex chars]`
**key_prefix:** first 12 chars: `bb_live_abcd` (shown in UI for identification)
**key_hash:** SHA-256 of full raw key (never store plaintext after creation)

---

### 1.13 webhook_endpoints
User-configured HTTP webhook destinations.

```sql
CREATE TABLE public.webhook_endpoints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  name            TEXT,
  filters         JSONB NOT NULL DEFAULT '{}',
  secret          TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_success_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**filters schema:**
```json
{
  "min_severity": 8,
  "regions": ["middle-east"],
  "commodities": ["USOIL", "UKOIL"]
}
```

---

### 1.14 webhook_deliveries
Log of every webhook delivery attempt.

```sql
CREATE TABLE public.webhook_deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id  UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  signal_id    UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  payload      JSONB NOT NULL,
  status_code  INTEGER,
  response_body TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, created_at DESC);
```

---

### 1.15 subscriptions
Stripe subscription tracking.

```sql
CREATE TABLE public.subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id    TEXT UNIQUE,
  stripe_price_id           TEXT,
  plan_tier                 TEXT CHECK (plan_tier IN ('free','analyst','pro','api')),
  status                    TEXT CHECK (status IN ('active','canceled','past_due','trialing')),
  current_period_end        TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);
```

---

### 1.16 sanctions_entities
OFAC, EU, UN sanctions list cross-reference.

```sql
CREATE TABLE public.sanctions_entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  aliases     TEXT[] DEFAULT '{}',
  list        TEXT NOT NULL CHECK (list IN ('OFAC','EU','UN')),
  entity_type TEXT,
  date_added  DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sanctions_name ON sanctions_entities USING GIN(
  to_tsvector('english', name || ' ' || array_to_string(aliases, ' '))
);
```

**Updated by:** sanctions-syncer worker, daily 04:00 UTC
**Source:** OFAC SDN XML (treasury.gov), EU Consolidated List, UN Consolidated List

---

### 1.17 economic_events (FUTURE — needs build)
Scheduled macro economic events (economic calendar).

```sql
CREATE TABLE public.economic_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name      TEXT NOT NULL,
  country         TEXT NOT NULL,
  currency        TEXT,
  impact_level    TEXT NOT NULL CHECK (impact_level IN ('high','medium','low')),
  event_date      TIMESTAMPTZ NOT NULL,
  forecast        TEXT,
  previous        TEXT,
  actual          TEXT,
  unit            TEXT,
  source          TEXT DEFAULT 'tradingeconomics',
  signal_generated BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_economic_events_date   ON economic_events(event_date DESC);
CREATE INDEX idx_economic_events_impact ON economic_events(impact_level, event_date);
```

---

## 2. RLS POLICIES

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- user_preferences
CREATE POLICY "Users can view own preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own preferences" ON user_preferences FOR ALL USING (auth.uid() = user_id);

-- alert_rules
CREATE POLICY "Users can manage own alert rules" ON alert_rules FOR ALL USING (auth.uid() = user_id);

-- alerts_sent
CREATE POLICY "Users can view own alerts sent" ON alerts_sent FOR SELECT USING (auth.uid() = user_id);

-- watchlist_entries
CREATE POLICY "Users can manage own watchlist" ON watchlist_entries FOR ALL USING (auth.uid() = user_id);

-- saved_signals
CREATE POLICY "Users can manage own saved signals" ON saved_signals FOR ALL USING (auth.uid() = user_id);

-- api_keys
CREATE POLICY "Users can manage own API keys" ON api_keys FOR ALL USING (auth.uid() = user_id);

-- signals (READ ONLY for all authenticated users)
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read signals" ON signals FOR SELECT TO authenticated USING (true);

-- commodity_prices (READ ONLY for all authenticated users)
ALTER TABLE commodity_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read prices" ON commodity_prices FOR SELECT TO authenticated USING (true);

-- economic_events (READ ONLY for all authenticated users)
ALTER TABLE economic_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read events" ON economic_events FOR SELECT TO authenticated USING (true);
```

**Service role bypass:** Backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses all RLS. Workers can INSERT/UPDATE any table.

---

## 3. RELATIONSHIPS DIAGRAM (TEXT)

```
auth.users (Supabase managed)
    │
    └── profiles (1:1)
            │
            ├── user_preferences (1:1)
            ├── user_channels (1:many)
            ├── alert_rules (1:many)
            │       └── alerts_sent (1:many) → signals
            ├── watchlist_entries (1:many)
            ├── saved_signals (1:many) → signals
            ├── api_keys (1:many)
            ├── webhook_endpoints (1:many)
            │       └── webhook_deliveries → signals
            └── subscriptions (1:1)

raw_events (independent)
    └── signals (many:many via raw_event_ids[])
            ├── commodity_prices (referenced by price_at_signal JSONB)
            └── sanctions_entities (referenced by sanctions_matches JSONB)

economic_events (independent, generates signals)
```

---

## 4. MIGRATION FILES ORDER

```
supabase/migrations/
├── 000_init_schema.sql          # All core tables
├── 001_rls_policies.sql         # All RLS policies
├── 002_sanctions.sql            # sanctions_entities table
├── 003_user_channels.sql        # user_channels table
├── 004_subscriptions.sql        # subscriptions table
├── 005_backtest_cache.sql       # backtest_cache table
├── 006_api_keys.sql             # api_keys, webhook tables
├── 007_new_user_trigger.sql     # handle_new_user() trigger
├── 008_price_at_signal.sql      # price_at_signal column on signals
└── 009_economic_calendar.sql    # economic_events table (future)
```

**Run order matters.** Run sequentially. Each depends on previous.
