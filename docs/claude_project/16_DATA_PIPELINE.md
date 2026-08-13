# 16_DATA_PIPELINE.md — Complete Data Pipeline Documentation

**Classification: Internal — CTO Level**

---

## 1. PIPELINE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA SOURCES (every 15-30 min)           │
│  GDELT  │  ACLED  │  GNews  │  Guardian  │  RSS Feeds       │
└────────────────────┬────────────────────────────────────────┘
                     │ raw events
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   RELEVANCE PRE-FILTER                      │
│  HIGH_RELEVANCE_KEYWORDS check + EXCLUDE_KEYWORDS check     │
│  ~80% of raw events filtered out (sports, entertainment)    │
└────────────────────┬────────────────────────────────────────┘
                     │ relevant events only
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   raw_events table (Supabase)               │
│  Deduplication: UNIQUE(external_id, source)                 │
└────────────────────┬────────────────────────────────────────┘
                     │ new events queued
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              BullMQ: ai-classification queue                │
│  Priority: based on Goldstein scale (higher = more urgent)  │
│  Concurrency: 5 parallel Claude Haiku calls                 │
└────────────────────┬────────────────────────────────────────┘
                     │ classified: severity, confidence, category
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  SEVERITY GATE (≥ 7 only)                   │
│  Severity 1-6: stored as signal, no full briefing           │
│  Severity 7-10: queued for full Claude Sonnet analysis      │
└────────────────────┬────────────────────────────────────────┘
                     │ high-severity events
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              BullMQ: signal-generation queue                │
│  Concurrency: 2 (Sonnet is expensive)                       │
│  Generates: 5-7 paragraph intelligence briefing             │
│  Enriches: sanctions_matches, shipping_proximity            │
└────────────────────┬────────────────────────────────────────┘
                     │ complete signal
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               signals table (Supabase)                      │
│  Published via SSE to connected dashboard clients           │
│  Queued in: alert-dispatcher                                │
└────────────────────┬────────────────────────────────────────┘
                     │ match alert rules
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              BullMQ: alert-dispatcher queue                 │
│  Concurrency: 10                                            │
│  Channels: Telegram, Email, Slack, Webhook, Push            │
│  Respects: user quiet hours, min severity, plan tier        │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. DATA SOURCES — COMPLETE SPECIFICATIONS

### 2.1 GDELT (Global Database of Events, Language, and Tone)

**URL:** http://data.gdeltproject.org/gdeltv2/lastupdate.txt
**Format:** CSV, pipe-delimited
**Update frequency:** Every 15 minutes
**Cost:** Free, no API key required
**Volume:** 300–500 events per 15-minute file

**Key fields extracted:**
```
GLOBALEVENTID      → external_id
Day                → event_date
Actor1CountryCode  → actor1_country
Actor2CountryCode  → actor2_country
EventCode          → event_type (CAMEO code)
GoldsteinScale     → goldstein_scale (severity proxy: -10 to +10)
NumArticles        → sources_count
AvgTone            → sentiment proxy
ActionGeo_CountryCode → country (2-letter ISO)
ActionGeo_Lat      → lat
ActionGeo_Long     → lng
ActionGeo_FullName → location_name
SourceURL          → source_url (for verification)
```

**GDELT collection logic (gdelt-collector.ts):**
```typescript
// Step 1: Fetch the lastupdate.txt to get the latest CSV URL
const lastUpdateRes = await fetch('http://data.gdeltproject.org/gdeltv2/lastupdate.txt')
const lines = (await lastUpdateRes.text()).trim().split('\n')
const csvUrl = lines[0].split(' ')[2] // e.g. http://data.gdeltproject.org/gdeltv2/20260811080000.export.CSV.zip

// Step 2: Download and unzip the CSV
// Step 3: Parse CSV rows
// Step 4: Apply relevance pre-filter
// Step 5: Map Goldstein scale to severity (0-10):
function goldsteinToSeverity(gs: number): number {
  if (gs <= -7) return 9  // Armed conflict, mass destruction
  if (gs <= -5) return 8  // Military strikes
  if (gs <= -3) return 7  // Significant threats
  if (gs <= -1) return 6  // Minor tensions
  if (gs < 2)  return 5   // Neutral
  return 4                 // Cooperative events (low relevance)
}
// Step 6: Upsert to raw_events with ON CONFLICT DO NOTHING
// Step 7: Queue new events in ai-classification BullMQ queue
```

**Known GDELT issues:**
- Contains non-geopolitical events (sports, entertainment with "conflict" tone)
- Country field often NULL — requires lat/lng reverse geocoding or title NLP to extract
- Same event reported multiple times across the 15-minute window → deduplication critical
- Goldstein scale is not perfectly correlated with market impact — AI re-scoring is necessary

---

### 2.2 ACLED (Armed Conflict Location and Event Data)

**URL:** https://api.acleddata.com/acled/read
**Format:** JSON API
**Update frequency:** Every 30 minutes
**Cost:** Free with registration (acleddata.com → "For Research")
**Registration:** Submit form, approval via email (24–48 hours)
**Required env vars:** ACLED_API_KEY, ACLED_API_EMAIL

**Key fields:**
```
data_id        → external_id
event_date     → event_date
country        → country (full name, more reliable than GDELT)
latitude       → lat
longitude      → lng
event_type     → event_type (Battles, Explosions/Remote violence, etc.)
actor1, actor2 → actors involved
fatalities     → conflict severity indicator
notes          → event description (best quality text in ACLED)
```

**ACLED collection logic (acled-collector.ts):**
```typescript
const params = new URLSearchParams({
  key: ACLED_API_KEY,
  email: ACLED_API_EMAIL,
  limit: '100',
  fields: 'data_id,event_date,country,latitude,longitude,event_type,actor1,actor2,fatalities,notes',
  // Date filter: events since last run
  event_date: new Date(Date.now() - 35 * 60 * 1000).toISOString().split('T')[0],
  event_date_where: 'BETWEEN',
  event_date_to: new Date().toISOString().split('T')[0],
})

const response = await fetch(`https://api.acleddata.com/acled/read?${params}`)
```

**ACLED advantage over GDELT:**
- Better country/location data (structured, not NLP-derived)
- Fatality counts for severity calibration
- Named actors for sanctions cross-referencing
- Higher signal-to-noise ratio (fewer irrelevant events)

**ACLED as enrichment context:**
When classifying GDELT events, ACLED context is fetched for the same country/date:
```typescript
const acledContext = await fetchAcledForCountry(country, eventDate)
// actorContext = { actors: [...], fatalities: N, notes: [...] }
// This is passed to the Claude classification prompt
```

---

### 2.3 GNews API

**URL:** https://gnews.io/api/v4/top-headlines
**Format:** JSON
**Update frequency:** Every 30 minutes
**Cost:** Free with API key (100 requests/day)
**Rate limit:** Very limited on free tier — used sparingly for breaking news supplement
**Required env vars:** GNEWS_API_KEY

**Collection logic:**
```typescript
const categories = ['world', 'business', 'politics']
for (const category of categories) {
  const url = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=en&max=10&apikey=${GNEWS_API_KEY}`
  // Filter articles by title relevance before storing
  // Upsert to raw_events with source='gnews'
}
```

---

### 2.4 Guardian API (Planned — Not Fully Integrated)

**URL:** https://content.guardianapis.com/search
**Format:** JSON
**Update frequency:** Every 30 minutes
**Cost:** Free with API key (5,000 requests/day)
**Registration:** open-platform.theguardian.com/access
**Required env var:** GUARDIAN_API_KEY

**Why Guardian is valuable:**
- Covers policy/economics better than GNews (central bank decisions, tariff announcements, sanctions)
- 5,000 req/day is generous — 48 runs × 20 articles = 960 requests (well within limit)
- Guardian's world/politics/business sections cover exactly the events BBR needs

**Collection query:**
```typescript
const sections = 'world,politics,business,environment'
const url = `https://content.guardianapis.com/search?api-key=${GUARDIAN_API_KEY}&section=${sections}&show-fields=trailText&order-by=newest&page-size=20`
```

---

## 3. AI CLASSIFICATION PIPELINE

### 3.1 ai-classifier.ts (BullMQ consumer)

**Input:** { rawEventId: string, priority: number }
**Process:**
1. Fetch raw_event from Supabase
2. Apply relevance pre-filter (second check — first was in collector)
3. Fetch enrichment context from ACLED (same country, last 7 days)
4. Fetch enrichment context from NewsAPI (related articles by title keywords)
5. Call Claude 3.5 Haiku with classification prompt
6. Parse JSON response → validate schema
7. Map confidence + commodity impacts
8. If severity ≥ 7: queue in signal-generation
9. If severity < 7: insert directly as low-priority signal (no full briefing)

**Error handling:**
- Claude rate limit: exponential backoff (1s, 2s, 4s, max 30s)
- JSON parse failure: retry with temperature=0
- Repeated failure: mark job as failed, log to dead letter queue

### 3.2 signal-generator.ts (BullMQ consumer)

**Input:** { signalId: string }
**Process:**
1. Fetch signal + raw_events from DB
2. Call Claude 3.5 Sonnet with full briefing prompt
3. Run sanctions check: text search `sanctions_entities` table for actor names mentioned
4. Calculate shipping proximity if lat/lng populated:
   ```typescript
   const CHOKEPOINTS = [
     { name: 'Strait of Hormuz', lat: 26.5667, lng: 56.25, oilPct: 19 },
     { name: 'Suez Canal', lat: 30.0444, lng: 32.2496, oilPct: 12 },
     { name: 'Bab-el-Mandeb', lat: 12.5847, lng: 43.3326, oilPct: 8 },
     { name: 'Strait of Malacca', lat: 2.5, lng: 101.5, oilPct: 16 },
     { name: 'Turkish Straits', lat: 41.1, lng: 29.1, oilPct: 3 },
   ]
   
   function haversineKm(lat1, lng1, lat2, lng2): number {
     const R = 6371
     const dLat = (lat2-lat1) * Math.PI/180
     const dLng = (lng2-lng1) * Math.PI/180
     const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
     return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
   }
   
   // Find nearest chokepoint within 400km
   ```
5. Capture price_at_signal: fetch current commodity_prices for primary impacted asset
6. Update signal record with ai_analysis, sanctions_matches, shipping_proximity, price_at_signal
7. Set signal.is_breaking = true if severity ≥ 9 AND event_date within last 2 hours
8. Queue in alert-dispatcher

---

## 4. ALERT DISPATCH PIPELINE

### 4.1 alert-dispatcher.ts (BullMQ consumer)

**Input:** { signalId: string }
**Process:**
1. Fetch signal from DB
2. Fetch all active alert_rules matching this signal (severity, region, commodity filters)
3. For each matching rule → fetch user_channels + user_preferences
4. Check quiet hours: if current UTC time in [quiet_start, quiet_end] AND severity < 10 → skip
5. Check plan tier: free users get delayed alerts (4 hours) — queue with delay
6. Dispatch per channel:

**Telegram dispatch:**
```typescript
const { chat_id } = channel.channel_config
await telegramService.sendMessage(chat_id, formatTelegramAlert(signal))

// Message format:
`🔴 BLUE BEACON RESEARCH — SEVERITY ${signal.severity}
━━━━━━━━━━━━━━━━━━
${signal.title}

📍 ${signal.country} | ${signal.region.toUpperCase()}
📊 ${signal.commodity_impacts.map(i => `${i.asset} ${i.direction === 'up' ? '↑' : i.direction === 'down' ? '↓' : '↕'}`).join(' · ')}
🎯 Confidence: ${Math.round(signal.confidence * 100)}%

${signal.summary}

━━━━━━━━━━━━━━━━━━
🔗 Full briefing: bluebeaconresearch.com/events/${signal.id}`
```

**Slack dispatch:**
```typescript
await fetch(webhookUrl, {
  method: 'POST',
  body: JSON.stringify({
    text: `*${signal.title}*`,
    attachments: [{
      color: severityToHex(signal.severity),
      fields: [
        { title: 'Severity', value: signal.severity, short: true },
        { title: 'Country', value: signal.country, short: true },
        { title: 'Assets', value: signal.commodity_impacts.map(i => i.asset).join(', '), short: false },
      ]
    }]
  })
})
```

**Webhook dispatch:**
```typescript
const payload = {
  event: 'signal.fired',
  signal: fullSignalObject,
  timestamp: new Date().toISOString(),
  bbr_version: '2.4.0',
  signature: hmacSha256(JSON.stringify(payload), endpoint.secret)
}
await fetch(endpoint.url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-BBR-Signature': payload.signature },
  body: JSON.stringify(payload)
})
```

**Expo Push dispatch:**
```typescript
await fetch('https://exp.host/--/api/v2/push/send', {
  method: 'POST',
  body: JSON.stringify({
    to: pushToken,
    title: `BBR Alert — Severity ${signal.severity}`,
    body: signal.title,
    data: { signalId: signal.id }
  })
})
```

---

## 5. PRICE SYNC PIPELINE

**Worker:** price-syncer.ts
**Cron:** Every 15 minutes (`*/15 * * * *`)
**Data source:** Yahoo Finance (yahoo-finance2 npm package — unlimited, free)

**Flow:**
1. For each symbol in COMMODITY_SYMBOLS map:
   - Call yahooFinance.quote(yahooSymbol)
   - Extract: regularMarketPrice, regularMarketChange, regularMarketChangePercent, regularMarketDayHigh, regularMarketDayLow
2. Cache in Redis: `prices:[symbol]` TTL 900s
3. Insert into commodity_prices table
4. On failure: serve stale Redis cache → serve hardcoded FALLBACK_PRICES

**Fallback chain:**
```
Yahoo Finance API → Redis cache (TTL 15min) → Hardcoded fallback prices
```
The frontend NEVER receives null prices — there is always a value to display.

---

## 6. SANCTIONS SYNC PIPELINE

**Worker:** sanctions-syncer.ts
**Cron:** Daily at 04:00 UTC (`0 4 * * *`)
**Sources:**
- OFAC SDN XML: https://sanctionslistservice.ofac.treas.gov/api/publicationdata/OFAC_SDN_XML.zip
- EU Consolidated List: https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1.zip
- UN Consolidated List: https://scsanctions.un.org/resources/xml/en/consolidated.xml

**Flow:**
1. Download and parse each XML source
2. Extract: entity name, aliases, list type, date_added
3. Upsert to sanctions_entities table
4. GIN index on (name + aliases) enables fast full-text search during signal generation

---

## 7. DEDUPLICATION STRATEGY

**Raw events:** `UNIQUE(external_id, source)` — same story from same source = 1 record

**Signals:** Before inserting a new signal, check if a signal already exists with this raw_event_id in raw_event_ids array. If yes → skip (prevents same event generating multiple signals when re-queued).

**Across sources:** If GDELT and GNews both pick up the same real-world event, they will generate two raw_events (different external_ids, different sources). The AI classifier may generate two signals for the same underlying event. This is acceptable — duplicate signals for the same event are filtered at display time by checking for identical titles within 1 hour. Future improvement: semantic similarity check before inserting signal.
