# Blue Beacon Research — Post-Prompt-02 CTO Execution Prompts

Last reviewed: 2026-08-14

## Scope

**PROMPT 02 is complete.** These are the remaining prompts only: **PROMPT 03 → PROMPT 10**.

This plan was revalidated against the current `docs/brain` files and the current repository implementation.

### Important decisions carried forward

- The map must use the **existing MapLibre GL JS + OpenStreetMap implementation** from Prompt 02.
- **Do not add Mapbox, MapTiler, Google Maps, paid map providers, map tokens, or payment/card requirements.**
- ACLED is **not a dependency for Prompt 02 or these post-02 UI tasks**. ACLED production activation is a separate operational task and must not block the product work below.
- Customer-facing product positioning is **research/analyst intelligence**, not an "AI news" product. Do not add customer-facing language that markets Blue Beacon as an AI-news service.
- Do not replace working ingestion architecture, APIs, database schema, or 15-minute cadence unless a prompt explicitly requires it.
- Do not invent/mock market impacts, prices, sources, coordinates, or intelligence.

---

# Execution Order

| Order | Prompt | Priority | Dependency | Execute when |
|---|---|---|---|---|
| 1 | **PROMPT 03 — MULTI-CHANNEL ALERT ROUTER** | P0 | Existing signals + alert rules | **Now** |
| 2 | **PROMPT 04 — EVENT DEEP-DIVE PAGE** | P0 | Prompt 02 + existing `/api/events/:id` | **Now** |
| 3 | **PROMPT 05 — DATA RETENTION & IMPORTANT EVENT VISIBILITY** | P0 | Existing `signals` + ingestion pipeline | **Now** |
| 4 | **PROMPT 06 — AUTHENTICATION & SESSION** | P0 | Supabase Auth already present | **Now** |
| 5 | **PROMPT 07 — DASHBOARD & WATCHLIST** | P1 | 04 + 05 + 06 | After 04–06 |
| 6 | **PROMPT 08 — GLOBAL INTELLIGENCE MAP** | P1 | Prompt 02 + 05 | After 05; enhancement only |
| 7 | **PROMPT 09 — PRICE-AT-SIGNAL** | P1 | Existing price sync + event detail | After 04 + current prices |
| 8 | **PROMPT 10 — MOBILE + NOTIFICATION SYSTEM** | P1 | 03 + 06 + 07 | Last |

**ACLED Production Activation is separate and unnumbered.** It can happen whenever credentials are available; none of Prompts 03–10 should stop because ACLED credentials are missing unless the existing code specifically requires ACLED for a tested path.

---

# PROMPT 03 — MULTI-CHANNEL ALERT ROUTER

## Dependency

**Prompt 02 complete. No ACLED dependency.** Existing signal ingestion and alert-rule tables/routes must remain the source of truth.

## Paste this into Antigravity/Cursor

```text
CTO TASK — PROMPT 03: MULTI-CHANNEL ALERT ROUTER

Repository: Blue Beacon Research monorepo.

Prompt 02 is already complete. Do NOT redo the map or change the ingestion architecture.

Before editing anything, inspect the existing implementation and use these known areas as the starting point:
- apps/backend/src/routes/alerts.ts
- apps/backend/src/routes/telegram.ts
- apps/backend/src/routes/webhooks.ts
- apps/backend/src/routes/users.ts
- apps/backend/src/routes/signals.ts
- apps/backend/src/workers/ or the actual worker/dispatcher files currently present
- Supabase alert_rules / user channel tables and migrations
- apps/web/(dashboard)/alerts and existing alert UI components

OBJECTIVE
Make the existing alert system actually dispatch newly-created qualifying signals through the channels already supported by the repository, without changing signal ingestion or creating duplicate alert engines.

REQUIREMENTS
1. Trace the current path:
   signal created -> alert rule matching -> dispatch -> channel provider -> delivery result.
2. Use the existing alert_rules data model. Do not create a second rule system.
3. Support the currently implemented channels only. Telegram, Slack/webhook and generic HTTP webhook paths may be wired if already present in code.
4. Do NOT implement WhatsApp provider integration in this task unless a provider and credentials already exist in the repository. Preserve a clean channel extension point for future WhatsApp support.
5. Telegram must use the existing TELEGRAM_BOT_TOKEN integration. Do not hard-code credentials.
6. Alerts must be triggered for newly-created qualifying signals, not by replaying the entire historical database every cron run.
7. Prevent duplicate dispatches for the same signal/rule/channel. Use an existing delivery/log table if present; otherwise add the smallest justified idempotency mechanism.
8. Respect rule filters: minimum severity, commodity, region and enabled channels.
9. Never invent an asset impact just to satisfy an alert rule.
10. Failed channel delivery must be logged and retried safely where the existing queue architecture supports it. Do not block signal creation because Telegram/Slack/etc. is down.
11. Keep the existing 15-minute ingestion cadence unchanged.
12. Keep the existing plan/auth guards. Do not bypass RLS or expose secrets to the browser.

CUSTOMER POSITIONING
Customer-facing copy must describe this as verified intelligence/research alerts, not "AI news" or "AI-generated news".

UI
- Existing /alerts controls must create/edit/delete real alert rules.
- Show enabled/disabled state and configured channels accurately.
- Provide a test-send action only where an existing provider route supports it.
- Show useful delivery/error status; do not show fake "sent" states.

TESTS
- Rule match / non-match tests.
- Duplicate prevention test.
- Telegram success/failure test with mocked provider response.
- Webhook success/failure test.
- Verify a signal can still be inserted when a notification provider fails.

RESTRICTIONS
- Do not change ingestion sources.
- Do not change the 15-minute cron.
- Do not add ACLED.
- Do not add Mapbox/MapTiler/Google Maps.
- Do not introduce a new queue system.
- Do not rewrite unrelated UI.

At the end report:
1. files changed,
2. API/routes changed,
3. database changes,
4. notification channels actually working,
5. tests run and results,
6. any missing credentials/config required for production.
```

---

# PROMPT 04 — EVENT DEEP-DIVE PAGE

## Dependency

**Prompt 02 complete.** No ACLED dependency.

The repository currently has `apps/backend/src/routes/events.ts`, and it reads the `signals` table by ID. The product route is `/events/[id]`. Do not create a duplicate event data model unless code inspection proves it is necessary.

## Paste this into Antigravity/Cursor

```text
CTO TASK — PROMPT 04: EVENT DEEP-DIVE PAGE

Fix the existing Blue Beacon event detail page at:
apps/web/app/(dashboard)/events/[id]

Backend starting point:
apps/backend/src/routes/events.ts

The current page renders incomplete/non-functional content. Some buttons/tabs are visibly inactive. Fix the page as a real research-intelligence detail view.

FIRST: inspect the actual repository implementation and current API registration. Do not trust stale documentation if the code differs.

DATA SOURCE
Use the existing event/signal record. The current backend events route reads from `signals` by ID and returns the record. Reuse it.
Do not create mock event data.
Do not create a second event table.

PAGE MUST SHOW
1. Event title.
2. Severity and confidence.
3. Published/source timestamp.
4. Ingestion timestamp where useful, clearly labelled separately from publication time.
5. Country/region/location.
6. Event type/category when available.
7. Concise factual event summary.
8. Research/analyst assessment — explain what the event means and why it matters.
9. Market impact assessment only when supported by stored `commodity_impacts` / evidence.
10. Affected asset(s), direction and confidence only when actual data exists.
11. Original source references/URLs with working external links.
12. Map/location panel when valid coordinates exist.
13. Historical/context information only when real stored data exists.
14. Share/record actions only if they actually work.
15. Alert action must use the existing alert-rule API; do not create a fake action.

IMPORTANT CUSTOMER POSITIONING
Do not present the page as an "AI-generated news" page.
Replace customer-facing labels such as "AI Intelligence Briefing" with language such as "Research Assessment", "Analyst Assessment" or equivalent factual wording.
Do not expose raw model prompts, hidden chain-of-thought, internal system prompts, or vendor-specific AI implementation details.

CHARTS
Only add charts that answer a user question and can be populated from real data.
Preferred useful chart if data exists:
- asset price around the event timestamp,
- severity/impact timeline,
- historical related-event count.
Do NOT create a decorative chart with fabricated values.
If the required historical price/event data does not exist, leave the chart out and report the missing data dependency.

INTERACTION
Every visible action must work:
- source links open the real source,
- map opens/zooms correctly,
- alert action creates/configures a real rule,
- share uses a real URL/share mechanism,
- record/save uses the existing persistence mechanism or is removed until implemented.
Remove disabled/fake buttons rather than leaving dead controls.

ERROR STATES
Implement proper loading, 404, API failure and missing-coordinate/missing-source states.
Do not show a blank page when one optional data field is missing.

SECURITY
Keep authenticated access consistent with the existing Supabase/Fastify auth architecture.
Do not expose service-role credentials to the browser.

RESTRICTIONS
- Do not redesign unrelated pages.
- Do not change ingestion cadence.
- Do not add ACLED.
- Do not add Mapbox/MapTiler/Google Maps.
- Do not invent market impacts, sources, prices or analysis.
- Do not expose internal AI prompts/reasoning.

TEST
Verify navigation from Dashboard, Alerts and Map to `/events/[id]` works.
Verify real source links, real API data and every remaining button.

At the end report files changed, API calls used, components removed/added, and any data fields currently unavailable.
```

---

# PROMPT 05 — DATA RETENTION & IMPORTANT EVENT VISIBILITY

## Dependency

**Existing ingestion pipeline + signals table. No ACLED dependency.**

Current repository status already preserves active ongoing events older than 24h while the default feed uses a 24h freshness window. Do not destroy this behavior.

## Paste this into Antigravity/Cursor

```text
CTO TASK — PROMPT 05: DATA RETENTION & IMPORTANT EVENT VISIBILITY

Problem:
Blue Beacon cannot simply display only today's newest articles. Important geopolitical events can remain relevant for days/weeks, while low-value articles should not dominate the feed.

Known current behavior:
- raw_events are ingested on startup and every 15 minutes.
- signals use event_date as publication time.
- /api/signals supports latest, 24h, 7d and active windows.
- default latest behavior includes fresh 24h signals plus active ongoing events.

FIRST inspect:
- apps/backend/src/routes/signals.ts
- actual collectors/workers
- signals/raw_events schema and migrations
- apps/web dashboard/feed components

OBJECTIVE
Make retention and visibility explicit without changing the ingestion cadence.

REQUIREMENTS
1. Keep raw_events as historical ingestion records. Do not delete them simply because they are older.
2. Keep signals available for historical research/backtesting according to the existing database model.
3. Separate "fresh" from "still important".
4. Default dashboard feed should prioritize:
   a. breaking/new high-severity signals,
   b. active ongoing events,
   c. recent relevant signals,
   while preventing old low-severity items from dominating.
5. Do not silently discard important older events.
6. Preserve/extend the existing `latest`, `24h`, `7d`, `active` API semantics instead of inventing conflicting filters.
7. If an event is active, it must remain discoverable even after 24h.
8. If the database has no reliable active/updated field for a use case, do not invent an arbitrary rule. Identify the smallest schema change required.
9. UI timestamps must distinguish:
   - published time (`event_date`),
   - ingestion time (`created_at`) when useful.
10. Add clear UI filtering such as Fresh / Active / Recent / Historical only if it fits the existing design.
11. Preserve important-event visibility for alerts and watchlists.
12. Do not create fake recency by rewriting event_date.

PERFORMANCE
Use indexed database queries. Avoid downloading hundreds/thousands of records to the browser and sorting them there.

RESTRICTIONS
- Do not change collectors or their 15-minute schedule.
- Do not change source APIs.
- Do not add ACLED.
- Do not add Mapbox/MapTiler/Google Maps.
- Do not delete historical data as a shortcut.
- Do not fabricate an "active" status.

TEST CASES
- New severity 9 signal appears immediately.
- Old severity 9 ongoing event remains visible.
- Old severity 3 closed event does not dominate the default feed.
- 24h/7d/active filters return correct records.
- Event detail remains accessible for older records.

At the end report the exact query/order logic and any migration/index added.
```

---

# PROMPT 06 — AUTHENTICATION & SESSION

## Dependency

**Independent. Can be executed now.**

This addresses the observed issue: a signed-in user still sees a Sign In button or is redirected to the sign-in page.

## Paste this into Antigravity/Cursor

```text
CTO TASK — PROMPT 06: AUTHENTICATION & SESSION

Fix authentication/session consistency across the Blue Beacon web app.

Known architecture:
- Next.js 16 App Router.
- Supabase Auth.
- @supabase/ssr.
- middleware/session protection.
- Protected dashboard route group: apps/web/app/(dashboard)

FIRST inspect the actual implementation:
- apps/web/middleware.ts
- apps/web/app/(dashboard)/layout.tsx
- apps/web/app/(auth)/*
- Supabase browser/server client helpers
- auth callbacks/routes
- top navigation/header components
- logout implementation

BUGS TO FIX
1. Authenticated users must not see a Sign In button when a valid session exists.
2. Authenticated users must not be redirected to `/login` from protected pages because the browser/client session is stale while the server session is valid.
3. After login, redirect reliably to the intended protected page/dashboard.
4. After logout, protected pages must no longer be accessible.
5. Refreshing the browser must preserve the session correctly.
6. Avoid duplicated/conflicting auth state between server and client.
7. Handle expired sessions cleanly.

IMPLEMENTATION RULES
- Use the existing Supabase SSR architecture; do not replace it with another auth provider.
- Do not expose service-role credentials to the client.
- Do not weaken middleware protection just to hide the login button.
- Header UI must derive authenticated state from the same authoritative session mechanism.
- Avoid redirect loops between middleware and client effects.
- Preserve onboarding behavior for new users where currently implemented.

TEST MATRIX
- Logged out -> /dashboard => login.
- Login -> dashboard.
- Refresh dashboard while logged in => remains dashboard.
- Navigate dashboard -> map/events/alerts/watchlist => remains authenticated.
- Logout -> login and protected routes blocked.
- Expired/invalid session -> clean login flow.
- Direct navigation to /events/[id] while logged in works.

RESTRICTIONS
- No redesign.
- No change to Supabase provider.
- No database rewrite.
- No unrelated feature changes.

At the end report the exact auth/session files changed and the root cause of the bug.
```

---

# PROMPT 07 — DASHBOARD & WATCHLIST

## Dependency

**Requires Prompts 04, 05 and 06.**

## Paste this into Antigravity/Cursor

```text
CTO TASK — PROMPT 07: DASHBOARD & WATCHLIST

Refine the existing Dashboard and Watchlist around the actual Blue Beacon user workflow:
"What happened? Does it matter? What could it affect? Should I be notified?"

FIRST inspect the current pages/components and API usage rather than rebuilding them.

Relevant existing APIs:
- GET /api/signals
- GET /api/prices
- GET /api/signals?commodity={symbol}
- event detail route /events/[id]
- existing alert APIs

DASHBOARD
1. Keep the existing terminal visual language.
2. Make the most important signal visually dominant, but do not let one old high-severity event permanently occupy the hero slot.
3. Use Prompt 05 freshness/active logic.
4. Every signal card must navigate to the real event detail page.
5. Show severity, confidence, publication age and affected asset only when real data exists.
6. Avoid excessive "AI" branding; customer-facing copy should emphasize research/assessment.
7. Keep the ingestion status banner factual. It must not imply fresh data if the latest successful source run is old.
8. Preserve loading/error/empty states.

WATCHLIST
1. Keep user-selected assets.
2. Price data must come from the existing price API/cache.
3. Correlated signals must come from the existing signals API.
4. Clicking an asset should expose relevant recent + active events.
5. Do not show a fabricated price or percentage when the price API has no value.
6. Do not make a prediction claim unless supported by an actual stored/research output.

MOBILE RESPONSIVENESS
Improve responsive behavior for the existing pages without building the full mobile app yet.

RESTRICTIONS
- Do not replace the existing data architecture.
- Do not add new external market-data providers.
- Do not add Mapbox/MapTiler/Google Maps.
- Do not add ACLED.
- Do not create mock data.
- Do not redesign the whole application.

TEST
Verify all dashboard/watchlist cards, filters and event links work with real data and with empty/error API responses.
```

---

# PROMPT 08 — GLOBAL INTELLIGENCE MAP

## Dependency

**Requires Prompt 02 and preferably Prompt 05.**

### Important clarification

This is **NOT a second map rebuild**. Prompt 02 already migrated the map to **MapLibre + OpenStreetMap** and the current `apps/web/app/(dashboard)/map/page.tsx` already contains GeoJSON, clustering and heatmap logic. Prompt 08 is the **intelligence-layer enhancement** only.

## Paste this into Antigravity/Cursor

```text
CTO TASK — PROMPT 08: GLOBAL INTELLIGENCE MAP

DO NOT rebuild the map from scratch.
Prompt 02 is complete and the current map implementation is already MapLibre GL JS + OpenStreetMap.

Known files:
- apps/web/app/(dashboard)/map/page.tsx
- apps/web/lib/map-config.ts
- apps/web hooks/components used by the map

Current implementation already includes:
- OpenStreetMap raster basemap
- MapLibre GL JS
- real signal coordinates
- GeoJSON conversion
- clustering
- heatmap
- severity/filter state

OBJECTIVE
Turn the existing map into an intelligence interface rather than a decorative map.

REQUIREMENTS
1. Keep MapLibre + OpenStreetMap exactly as the base.
2. Keep real `/api/signals` data as the source of event markers.
3. Map events by severity and event category using real properties.
4. Clicking a cluster must zoom into the underlying events.
5. Clicking an event must show a useful preview and a working link to `/events/[id]`.
6. Selecting an event in the right-side feed must focus the map on that event.
7. Selecting a map event must identify it in the feed where practical.
8. Preserve filters for severity, region/category and time window.
9. Clearly distinguish event density from individual events.
10. Add advanced overlays only when actual data exists in the repository.

POSSIBLE FUTURE/AVAILABLE OVERLAYS
- strategic maritime straits,
- pipelines,
- ports/refineries,
- supply-chain nodes.

But do NOT draw invented intelligence layers. If the repository has no authoritative dataset for an overlay, create the UI extension point and report the missing data source rather than hard-coding fictional coordinates.

MAP UX
The map should answer:
- Where is activity concentrated?
- Which events are severe?
- What is happening in a selected region?
- Which event affects my monitored asset?
- Can I open the underlying research quickly?

PERFORMANCE
- Avoid one DOM marker per event at global scale.
- Prefer GeoJSON source/layers/clusters already used by the current implementation.
- Update the existing source rather than recreating the map on every render.
- Keep the map usable on laptop and mobile widths.

RESTRICTIONS
- NO Mapbox.
- NO MapTiler.
- NO Google Maps.
- NO paid map token.
- NO ACLED dependency.
- NO fake layers/data.
- NO replacement of Prompt 02 architecture.

At the end report which intelligence layers use real data and which remain intentionally unavailable.
```

---

# PROMPT 09 — PRICE-AT-SIGNAL

## Dependency

**Requires Prompt 04 and the existing price sync/data model.**

## Paste this into Antigravity/Cursor

```text
CTO TASK — PROMPT 09: PRICE-AT-SIGNAL

Add factual market context to an event without turning Blue Beacon into a trading-signal/advice product.

FIRST inspect:
- apps/backend/src/routes/prices.ts
- current commodity price sync worker
- commodity_prices schema/migrations
- event detail page
- existing commodity_impacts structure

OBJECTIVE
For an event that has a supported affected asset, show what the asset price was around the event publication time and how it moved afterward, using stored real price data.

REQUIREMENTS
1. Use the existing price data source/table. Do not add another market-data provider unless the repository proves the current provider cannot support the required historical data.
2. Use event_date as the event timestamp.
3. Clearly label price timing: before event, event-time/nearest available, after event.
4. If historical data is unavailable, do not fabricate a chart or percentage. Show a clear "historical price data unavailable" state.
5. Separate observed price movement from research interpretation.
6. Do not display language implying guaranteed returns, trading advice or prediction certainty.
7. Keep asset symbols restricted to the repository's approved product list.
8. Use the actual stored commodity impact relation when available; do not infer an impact solely because an asset is in the watchlist.

UI
A compact event-price chart is preferred only when enough real historical points exist.
Include:
- event marker,
- asset symbol/name,
- price before/near/after,
- observed percentage change where calculable,
- data timestamp/source where available.

RESTRICTIONS
- No fake historical prices.
- No new prediction model.
- No financial-advice language.
- No unrelated chart redesign.

TEST
Use an event with real price history and one without history. Both states must be correct.
```

---

# PROMPT 10 — MOBILE + NOTIFICATION SYSTEM

## Dependency

**Last. Requires Prompt 03 + 06 + 07.**

WhatsApp and Telegram are part of the longer notification strategy. Telegram can be implemented through the existing integration. WhatsApp must not be implemented by guessing a provider/API or by storing credentials in code.

## Paste this into Antigravity/Cursor

```text
CTO TASK — PROMPT 10: MOBILE + NOTIFICATION SYSTEM

Goal:
Make Blue Beacon easy to consume on a phone and make high-value intelligence arrive at the right time without creating notification spam.

FIRST inspect the existing mobile workspace and notification/alert architecture.
Known repository structure includes an Expo/React Native mobile app. Reuse the existing shared types/API patterns.

USER EXPERIENCE
The product should encourage a simple habit:
1. receive a meaningful high-value alert,
2. open Blue Beacon,
3. understand the event in seconds,
4. inspect the research assessment/market impact,
5. optionally follow the event/asset.

Do not copy social media addiction mechanics blindly. Optimize for high signal-to-noise and user trust.

MOBILE MVP
1. Mobile authentication must use the same Supabase account/session model.
2. Mobile feed consumes the existing signals API.
3. Prioritize breaking/high-severity and active events using Prompt 05 logic.
4. Every notification must deep-link to the relevant event.
5. Event detail must be readable on a small screen.
6. Watchlist/asset filtering should be available.
7. Avoid loading the entire desktop terminal onto a phone; create a focused mobile information hierarchy.

NOTIFICATION RULES
1. Use the existing alert_rules as the source of user preferences.
2. Do not notify for every ingested article.
3. Notify only when a rule matches a meaningful newly-created signal.
4. Respect duplicate suppression.
5. Respect user channel preferences and quiet/disabled states if already supported.
6. Do not claim an alert is real-time if ingestion/provider latency prevents that.

CHANNELS
- Telegram: use existing Telegram integration and TELEGRAM_BOT_TOKEN.
- Push: integrate with the existing Expo/mobile architecture if the repository already supports it.
- WhatsApp: prepare an extensible channel interface only unless an approved provider and credentials already exist. Do not guess an API/provider.
- Slack/webhooks: preserve existing backend support.

COPY / TRUST
Notifications should communicate:
- what happened,
- severity/importance,
- affected region/asset if supported,
- a short factual research takeaway,
- open-event action.

Avoid "AI says...", "AI predicts..." and similar positioning.

RESTRICTIONS
- Do not rewrite the backend notification architecture if Prompt 03 already provides the dispatcher.
- Do not create a second notification engine.
- Do not add a random WhatsApp SDK.
- Do not add paid services without explicit approval.
- Do not generate fake push notifications.
- Do not change the 15-minute ingestion schedule in this prompt.

TEST
- Login on mobile.
- Receive a qualifying Telegram/push notification.
- Tap notification -> correct `/events/[id]` deep link.
- Verify duplicate suppression.
- Verify non-qualifying signals do not notify.
- Verify notification failure does not break signal ingestion.

At the end report mobile routes/components changed, notification providers actually connected, credentials still required, and test results.
```

---

# Separate Operational Task — ACLED Production Activation

**This is NOT PROMPT 04 and is NOT a numbered replacement for any of Prompts 03–10.**

Current repository status says the ACLED collector is blocked only because production credentials are missing (`ACLED_EMAIL` + `ACLED_PASSWORD`). Do not make ACLED a prerequisite for unrelated product/UI work.

When credentials are available:

1. Add the credentials only to the Railway workers environment.
2. Do not put ACLED credentials in the Next.js/Vercel client environment.
3. Inspect the existing `acled-collector.ts` before changing it.
4. Run it against the existing normalized event/signal pipeline.
5. Verify deduplication and coordinate normalization.
6. Verify ACLED failures do not stop RSS/GNews/GDELT ingestion.
7. Update `docs/brain/08_CURRENT_STATUS.md` only after production verification.

Do not add ACLED to Prompt 02's map architecture merely to make the map look populated. The map consumes the normalized Blue Beacon signal data.

---

# CTO Stop Rules — Apply to Every Prompt

Before making changes, the coding agent must inspect the current code and current `docs/brain` state.

**Do not:**
- invent APIs,
- invent database fields without checking migrations/schema,
- create mock intelligence data,
- add duplicate data pipelines,
- add duplicate notification engines,
- change ingestion cadence,
- expose secrets in frontend code,
- add Mapbox/MapTiler/Google Maps,
- make ACLED a blocker for unrelated work,
- rewrite unrelated pages,
- replace working architecture without evidence.

**After every prompt:**
1. Run the relevant tests/typecheck/lint.
2. Verify the actual API responses used by the UI.
3. Verify loading/error/empty states.
4. Report exact files changed.
5. Report any missing external credential/data dependency.
6. Do not claim a feature is production-ready if a required external service is still unconfigured.
