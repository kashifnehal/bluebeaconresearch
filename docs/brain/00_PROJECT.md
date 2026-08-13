# 00_PROJECT.md — Blue Beacon Research Overview & Core Vision

> **System Identity**: Blue Beacon Research is an enterprise-grade, sub-second geopolitical risk intelligence and signal processing platform designed for commodity traders, macroeconomic hedge funds, institutional risk managers, and defense/geopolitical analysts.

---

## 1. What is this Project?

Blue Beacon Research is an automated, real-time geopolitical intelligence monorepo application. It ingests global conflict events from multi-source live feeds (GDELT Project, ACLED, GNews API), processes raw news and military event text using LLM synthesis (Anthropic Claude 3.5 Sonnet / Claude 3.5 Haiku), assesses geopolitical conflict severity (1–10 scale) and confidence (0–100%), determines quantitative asset market impact across physical commodities (WTI/Brent Crude Oil, Gold, Natural Gas, Copper, Wheat, FX), and dispatches instant alerts across Telegram, Slack, Webhooks, and Mobile Push notifications.

---

## 2. Why It Exists & Vision

### Problem Solved

1. **News Latency & Signal Noise**: Geopolitical crises (e.g., Strait of Hormuz blockades, Red Sea missile attacks, pipeline sabotage) move financial markets in seconds. Human analyst teams take 30–60 minutes to vet, write, and publish intel reports.
2. **Unstructured Data Volume**: Over 350+ conflict news items are published every 15 minutes globally. Manual monitoring leads to analytical overload, missing black-swan events, or acting on unverified rumours.
3. **Lack of Quantitative Asset Coupling**: Traditional news platforms (Bloomberg, Reuters) report events without structured market mapping (e.g., specifying whether an event is bullish for `USOIL` with explicit severity and geographic coordinates).

### Project Vision

To become the definitive sub-second tactical intelligence terminal that bridges real-time military & geopolitical intelligence with algorithmic risk management and quantitative backtesting.

---

## 3. Current Scope vs. Future Scope

### Current Scope

- **Ingestion Workers**: Cron-based background workers collecting data from GDELT, ACLED, and GNews every 15 minutes.
- **AI Synthesis Pipeline**: Anthropic Claude 3.5 Sonnet/Haiku structured prompt generation producing JSON-formatted signals (severity, confidence, target commodities, rationale).
- **Fastify Backend API**: High-performance REST server with Swagger/OpenAPI documentation, JWT authentication, and plan-based access controls (`free`, `analyst`, `pro`, `api`).
- **Next.js 16 Web Terminal**: Dark-mode terminal UI featuring live breaking news tickers, interactive Mapbox conflict maps, custom alert rule management, backtesting suite, asset watchlists, and institutional settings.
- **Multi-Channel Alert Dispatcher**: Sub-second alert router via BullMQ & Upstash Redis delivering payloads to Telegram Bots, Slack Webhooks, custom HTTP Webhook endpoints, and Expo Push Notifications.
- **Gating & Feature Controls**: Integrated project readiness flag (`isProjectReady`) controlling waitlist access and landing page gating.

### Future Scope

- **Live Order Execution**: Integration with broker APIs (Interactive Brokers, MetaTrader 5) to auto-hedge commodity portfolios based on signal severity thresholds.
- **Satellite Imagery Integration**: Computer vision analysis of synthetic aperture radar (SAR) satellite imagery over key maritime chokepoints and oil refineries.
- **Multi-LLM Ensemble Voting**: Cross-verifying signals using DeepSeek-R1, OpenAI o3-mini, and Claude 3.5 Sonnet to minimize AI hallucinations.
- **Sub-100ms WebSockets**: Upgrading REST polling to persistent WebSocket streams for ultra-low latency signal streaming to institutional terminals.

---

## 4. Major Modules Overview

```
blueBeaconResearch/
├── apps/
│   ├── web/           # Next.js 16 App Router Terminal (Vercel)
│   ├── backend/       # Fastify REST Server + BullMQ Background Workers
│   └── mobile/        # Expo / React Native iOS & Android Client
├── packages/
│   └── shared/        # Shared TypeScript models, enums & commodity constants
└── supabase/
    ├── production_schema.sql  # Core Database schema & RLS policies
    └── migrations/            # Versioned SQL migrations (000–007)
```

---

## 5. Technology Stack Matrix

| Layer                  | Technology                                        | Version                           | Purpose                                                                                     |
| :--------------------- | :------------------------------------------------ | :-------------------------------- | :------------------------------------------------------------------------------------------ |
| **Monorepo Engine**    | Turborepo + pnpm                                  | `turbo@2.8.18` / `pnpm@10.32.1`   | Build pipeline orchestration & workspace linking                                            |
| **Frontend Framework** | Next.js (App Router)                              | `16.2.0` (React `19.2.4`)         | Institutional dark terminal UI, SSR, middleware                                             |
| **Styling & Icons**    | Tailwind CSS v4 + Lucide                          | `tailwindcss@4` / `lucide-react`  | Custom dark glassmorphic design system                                                      |
| **Interactive Maps**   | MapLibre GL (`maplibre-gl`) + OpenStreetMap tiles | `maplibre-gl@6.x`                 | GIS conflict heatmap, clustering, and tactical event pin markers (no Mapbox token required) |
| **Backend REST API**   | Fastify                                           | `5.8.2`                           | High-throughput Node.js backend with ESM support                                            |
| **Database & Auth**    | Supabase (PostgreSQL)                             | `supabase-js@2.99.2`              | Row Level Security (RLS), Postgres DB, JWT Auth                                             |
| **Caching & Queues**   | Upstash Redis + BullMQ                            | `bullmq@5.71.0` / `ioredis@5.9.3` | Asynchronous background workers & rate-limiting                                             |
| **AI Intelligence**    | Anthropic Claude SDK                              | `@anthropic-ai/sdk@0.79.0`        | Claude 3.5 Sonnet / Haiku signal classification                                             |
| **Mobile App**         | Expo / React Native                               | Expo `55.0.7` / RN `0.83.2`       | Mobile terminal dashboard & native push alerts                                              |
| **Scheduler**          | node-cron                                         | `4.2.1`                           | Automated 15-min news ingestion triggers                                                    |
