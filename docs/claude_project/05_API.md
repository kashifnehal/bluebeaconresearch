# 05_API.md — Complete API Reference

> **📍 Doc status — reviewed 2026-08-19.** Not rewritten — see inline ⚠️ UPDATED notes below for anything that's changed since this was last accurate. This file remains the durable planning/architecture record; for day-to-day current state cross-reference the BBR Claude project's `claude/23_TODO.md` and `22_SESSION_HANDOFF.md`.

**Base URL (production):** https://api.bluebeaconresearch.com
**Base URL (development):** http://localhost:3001
**API Version:** v1 (all routes prefixed /v1/)
**Framework:** Fastify 4, Node.js 20
**Classification: Internal — CTO Level**

---

## 1. AUTHENTICATION

All protected endpoints require one of:

**Option A — JWT Bearer Token (web users)**
```
Authorization: Bearer <supabase_access_token>
```
The access token is the Supabase JWT issued at login. Expires every 3600 seconds. Frontend handles refresh automatically via @supabase/ssr.

**Option B — API Key (programmatic access)**
```
x-api-key: bb_live_<64 hex chars>
```
Requires Pro or API plan tier. Keys managed in /settings.

**Auth middleware logic (auth.middleware.ts):**
1. Check Authorization: Bearer header → verify against Supabase JWT secret → extract user_id
2. Else check x-api-key header → SHA-256 hash → lookup api_keys table → extract user_id, increment call_count
3. If neither → return 401 `{ error: "Unauthorized" }`
4. Attach to request: `request.user = { id, plan_tier, email }`

---

## 2. RATE LIMITING

**Global:** 100 requests/minute per IP (via @fastify/rate-limit + Upstash Redis)
**Auth endpoints:** 20 requests/minute per IP
**Telegram webhook:** 30 requests/minute per IP
**Health check:** Excluded from rate limiting
**On 429:** `{ "error": "Rate limit exceeded", "retryAfterSeconds": 60 }`

---

## 3. STANDARD RESPONSE FORMATS

**Success:**
```json
{ "data": { ... }, "meta": { ... } }
```

**Error:**
```json
{ "error": "Human readable message", "code": "MACHINE_CODE", "details": { ... } }
```

**Paginated:**
```json
{
  "data": [...],
  "meta": {
    "total": 1247,
    "page": 1,
    "limit": 20,
    "nextCursor": "2026-08-01T12:00:00Z"
  }
}
```

---

## 4. ENDPOINTS — COMPLETE REFERENCE

### 4.1 Health

#### GET /health
No auth required. Not rate limited. Used by Railway health checks.

**Response 200:**
```json
{
  "status": "ok",
  "uptime": 3847.2,
  "timestamp": "2026-08-11T08:00:00Z",
  "version": "2.4.0"
}
```

#### GET /v1/health/pipeline
No auth required. Returns status of all background workers.

**Response 200:**
```json
{
  "gdeltLastRun": "2026-08-11T07:45:00Z",
  "gdeltEventsLastHour": 42,
  "signalsLast1h": 8,
  "pricesAgeMinutes": 12,
  "alertsLast24h": 156,
  "status": "healthy"
}
```
Status values: `"healthy"` | `"degraded"` | `"offline"`
- healthy: all counts > 0 and prices < 20 min old
- degraded: some counts zero or prices 20–60 min old
- offline: prices > 60 min or no signals in 2+ hours

---

### 4.2 Signals

#### GET /v1/signals
Returns paginated signal feed. Auth required.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| severity | integer | — | Min severity (1–10) |
| region | string | — | Filter by region slug |
| commodity | string | — | Filter by asset symbol (USOIL etc) |
| category | string | — | Filter by event_category |
| search | string | — | Full-text search on title+summary |
| sort | string | severity | "severity" or "newest" |
| limit | integer | 20 | Max 100 for API tier, 20 otherwise |
| cursor | string | — | ISO timestamp for cursor pagination |
| is_breaking | boolean | — | Filter breaking signals only |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Iranian naval exercises near Strait of Hormuz",
      "summary": "IRGC naval vessels conducting exercises...",
      "ai_analysis": "Full Claude briefing text...",
      "severity": 9,
      "confidence": 0.87,
      "event_type": "naval_exercise",
      "event_category": "conflict",
      "country": "Iran",
      "region": "middle-east",
      "lat": 26.5667,
      "lng": 56.25,
      "sources_count": 4,
      "commodity_impacts": [
        { "asset": "USOIL", "direction": "up", "confidence": 0.84 },
        { "asset": "UKOIL", "direction": "up", "confidence": 0.81 }
      ],
      "price_at_signal": { "USOIL": 84.20, "capturedAt": "2026-02-28T03:42:00Z" },
      "sanctions_matches": [],
      "shipping_proximity": {
        "chokepoint": "Strait of Hormuz",
        "distanceKm": 22,
        "oilPct": 19
      },
      "consumer_impact": "Likely to increase petrol and cooking gas prices within 2–4 weeks.",
      "is_breaking": true,
      "is_active": true,
      "created_at": "2026-02-28T03:42:00Z"
    }
  ],
  "meta": {
    "total": 847,
    "limit": 20,
    "nextCursor": "2026-02-28T02:30:00Z"
  }
}
```

**Plan restrictions:**
- Free tier: signals older than 4 hours only (WHERE created_at < NOW() - INTERVAL '4 hours')
- Analyst+: real-time
- Limit: API tier can request up to 100, all others max 20

**Caching:** Results not cached server-side (always fresh). TanStack Query on frontend caches 30 seconds.

---

#### GET /v1/signals/latest
Returns 5 most recent signals. Used by landing page live preview and dashboard right sidebar. No plan restriction.

**Response 200:**
```json
{ "data": [ /* 5 signal objects, brief format */ ] }
```
Cached in Redis key `signal:latest` TTL 60 seconds.

---

#### GET /v1/signals/:id
Returns single signal with full detail. Auth required.

**Response 200:** Full signal object as above.
**Response 404:** `{ "error": "Signal not found" }`

---

#### GET /v1/signals/stream (SSE)
Server-Sent Events stream of new signals. Auth required. Analyst+ plan.

**Headers set:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Event format:**
```
data: {"id":"uuid","title":"...","severity":8,...}\n\n
```

**Heartbeat (every 30s):**
```
: heartbeat\n\n
```

**Connection behavior:**
- Polls Supabase every 60 seconds for signals newer than lastSeenAt
- Max connection duration: 5 minutes (then client reconnects)
- Free tier: 300-second polling interval
- On disconnect: client reconnects with exponential backoff (1s, 2s, 4s, max 30s)

---

### 4.3 Prices

#### GET /v1/prices
Returns all current commodity prices. Auth required.

**Response 200:**
```json
{
  "data": [
    {
      "symbol": "USOIL",
      "price": 84.20,
      "change_24h": 1.30,
      "change_pct_24h": 1.57,
      "high_24h": 85.10,
      "low_24h": 82.90,
      "fetched_at": "2026-08-11T07:45:00Z"
    }
  ]
}
```
Cached in Redis: per symbol, TTL 900s. Fallback to hardcoded FALLBACK_PRICES if Redis miss.

#### GET /v1/prices/:symbol
Single commodity price. Useful for signal card price display.

**Response 200:** Single price object.
**Response 404 → fallback:** Returns last known price from Redis, never returns 404 to prevent broken UI.

---

### 4.4 Alerts

#### GET /v1/alerts/rules
Returns user's alert rules. Auth required.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Middle East Energy Alerts",
      "regions": ["middle-east"],
      "commodities": ["USOIL", "UKOIL"],
      "min_severity": 8,
      "channels": ["telegram", "email"],
      "frequency": "immediate",
      "is_active": true,
      "created_at": "...",
      "last_triggered_at": "..."
    }
  ]
}
```

#### POST /v1/alerts/rules
Create new alert rule. Auth required.

**Request body:**
```json
{
  "name": "Middle East Energy Alerts",
  "regions": ["middle-east"],
  "commodities": ["USOIL"],
  "min_severity": 8,
  "channels": ["telegram"],
  "frequency": "immediate"
}
```
**Response 201:** Created rule object.
**Validation:** name required, min_severity 1–10, channels must be valid values.

#### PUT /v1/alerts/rules/:id
Update existing rule. Auth required. User must own the rule (RLS).

#### DELETE /v1/alerts/rules/:id
Delete rule. Auth required. User must own rule.

#### GET /v1/alerts/recent
Returns last 10 alerts sent to the user (for notification bell panel). Auth required.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "signal_id": "uuid",
      "channel": "telegram",
      "status": "delivered",
      "delivered_at": "...",
      "signal": {
        "title": "...",
        "severity": 9
      },
      "created_at": "..."
    }
  ],
  "unread_count": 3
}
```

#### GET /v1/alerts/accuracy
Returns 30-day signal accuracy stats. Auth required.

**Response 200:**
```json
{
  "total_alerts": 52,
  "correct_count": 38,
  "accuracy_pct": 73.1,
  "avg_move_pct": 3.8,
  "period": "30d"
}
```

---

### 4.5 Watchlist

#### GET /v1/watchlist
Returns user's watchlist entries with current prices. Auth required.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "symbol": "USOIL",
      "alert_enabled": false,
      "price": {
        "symbol": "USOIL",
        "price": 84.20,
        "change_24h": 1.30,
        "change_pct_24h": 1.57
      },
      "active_signals": 2,
      "risk_level": "medium"
    }
  ]
}
```

#### POST /v1/watchlist
Add commodity to watchlist.
**Body:** `{ "symbol": "USOIL" }`
**Response 201:** Created entry with price data.

#### DELETE /v1/watchlist/:symbol
Remove from watchlist. Auth required.

---

### 4.6 Backtesting

#### POST /v1/backtesting
Run or retrieve backtest. Auth required.

**Request body:**
```json
{
  "eventType": "naval_blockade",
  "region": "middle-east",
  "commodity": "USOIL",
  "horizon": "24hr",
  "dateFrom": "2015-01-01",
  "dateTo": "2026-01-01"
}
```

**Response 200 (cache hit — instant):**
```json
{
  "cacheHit": true,
  "is_demo": false,
  "total_events": 14,
  "accuracy_pct": 71.4,
  "avg_move_pct": 4.1,
  "max_move_pct": 12.3,
  "min_move_pct": -1.2,
  "note": null,
  "events": [
    {
      "date": "2023-12-18",
      "country": "Yemen",
      "title": "Houthi missile strike on tanker in Red Sea",
      "price_at_signal": 74.20,
      "price_at_horizon": 78.40,
      "pct_change": 5.66,
      "direction": "up",
      "correct": true
    }
  ]
}
```

**Response 200 (current — mock data):**
Same schema but `is_demo: true` and `note: "Sample data — real backtesting coming in Beta"`

**Cache key:** MD5 hash of all params. Cached 24 hours in backtest_cache table.

---

### 4.7 API Keys

#### GET /v1/api-keys
Returns user's API keys (masked). Requires Pro/API plan.

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "prod-trading-server",
      "key_prefix": "bb_live_abcd",
      "last_used_at": "...",
      "call_count": 4821,
      "is_active": true,
      "created_at": "..."
    }
  ]
}
```

#### POST /v1/api-keys
Create new API key. Returns raw key ONCE. Requires Pro/API plan. Max 5 per user.

**Body:** `{ "name": "prod-trading-server" }`

**Response 201:**
```json
{
  "id": "uuid",
  "name": "prod-trading-server",
  "key": "bb_live_a1b2c3d4...64hexchars",
  "key_prefix": "bb_live_a1b2",
  "warning": "Store this key securely. It will not be shown again."
}
```

#### DELETE /v1/api-keys/:id
Deactivate key. Auth required. User must own.

---

### 4.8 Webhooks

#### GET /v1/webhooks
Returns user's webhook endpoints. Auth required.

#### POST /v1/webhooks
Create webhook endpoint.
```json
{
  "url": "https://your-server.com/bbr-webhook",
  "name": "Trading Server",
  "filters": {
    "min_severity": 8,
    "regions": ["middle-east"],
    "commodities": ["USOIL"]
  }
}
```

#### POST /v1/webhooks/test
Test delivery to endpoint.
**Body:** `{ "endpoint_id": "uuid" }` or `{ "url": "...", "filters": {...} }`
**Response:** `{ "status_code": 200, "latency_ms": 234, "success": true }`

#### DELETE /v1/webhooks/:id

**Webhook payload delivered to user's server:**
```json
{
  "event": "signal.fired",
  "signal": { /* full signal object */ },
  "timestamp": "2026-08-11T08:00:00Z",
  "bbr_version": "2.4.0",
  "signature": "sha256=..."
}
```
Signature: HMAC-SHA256 of payload using webhook endpoint.secret.

---

### 4.9 Telegram

#### POST /v1/telegram/webhook
Receives Telegram bot updates. Not auth required (verified via Telegram token). Rate limited 30/min.

**Handles commands:**
- `/start connect_[code]` — links Telegram chat_id to user via code in Redis
- `/start` (no code) — sends welcome message with instructions
- `/connect [code]` — same as /start connect_[code]
- `/status` — returns connection status
- `/stop` — sets user_channels.status = 'inactive'

**On successful connect:**
1. Look up Redis key `telegram:connect:[code]` → get user_id (TTL 10 min)
2. Upsert user_channels: { user_id, channel_type: 'telegram', channel_config: { chat_id }, status: 'active' }
3. Delete Redis key
4. Send confirmation: "✅ Connected! You'll receive geopolitical alerts from Blue Beacon Research."

#### POST /v1/telegram/connect-code
Generates a connect code for the user. Auth required.

**Response 200:**
```json
{ "code": "A1B2C3", "expires_in": 600 }
```
Stores in Redis: `telegram:connect:A1B2C3` → user_id, TTL 600 seconds.

#### GET /v1/telegram/status
Returns Telegram connection status for user. Auth required.
```json
{ "connected": true, "chat_id": "123456789", "username": "@username" }
```

---

### 4.10 Users / Profile

#### PUT /v1/users/profile
Update user profile. Auth required.
**Body:** `{ "full_name": "...", "use_case": "trader" }`

#### PUT /v1/users/preferences
Update user preferences. Auth required.
**Body:** Full user_preferences object.

#### POST /v1/users/push-token
Register Expo push token for mobile notifications. Auth required.
**Body:** `{ "token": "ExponentPushToken[...]" }`
Appends to profiles.push_tokens array.

---

### 4.11 Economic Calendar (FUTURE)

#### GET /v1/calendar
Returns economic events. Auth required.
**Query:** `?period=today|week|month`
**Response:** Array of economic_events ordered by event_date.

---

## 5. WEBHOOK DELIVERY RETRY LOGIC

When delivering to user webhook endpoints:
1. First attempt at signal classification time
2. If status_code != 2xx: retry after 5 min (attempt 2)
3. If still failing: retry after 30 min (attempt 3)
4. If still failing: mark webhook as failed, notify user via email
5. Record all attempts in webhook_deliveries table

---

## 6. NEXT.JS API ROUTES (apps/web)

These are Next.js API routes, not the Fastify backend. They act as a thin proxy/BFF (Backend For Frontend) that adds the user's Supabase JWT and calls the Fastify backend.

```
apps/web/app/api/
├── signals/route.ts          → proxies GET /v1/signals
├── events/stream/route.ts    → SSE handler (polls Supabase directly)
├── prices/route.ts           → proxies GET /v1/prices
├── alerts/route.ts           → proxies /v1/alerts/*
├── watchlist/route.ts        → proxies /v1/watchlist
├── backtesting/route.ts      → proxies POST /v1/backtesting
├── stripe/
│   ├── webhook/route.ts      → Stripe webhook handler (STUBBED)
│   ├── checkout/route.ts     → Creates Stripe checkout session (STUBBED)
│   ├── create-customer/route.ts → Creates Stripe customer (STUBBED)
│   └── portal/route.ts      → Creates Stripe portal session (STUBBED)
└── telegram/
    └── connect-code/route.ts → Proxies POST /v1/telegram/connect-code
```
