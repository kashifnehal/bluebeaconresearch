# 02_BUSINESS.md — Business Model, Pricing & Monetization Strategy

This document outlines the commercial framework, user target personas, pricing tiers, feature gating limits, and monetization strategy for Blue Beacon Research.

---

## 1. Target User Personas

| Persona | Core Need | Primary Platform Workflows | Willingness to Pay |
| :--- | :--- | :--- | :--- |
| **Commodities Energy Trader** | Sub-second notifications on Middle East / Red Sea pipeline threats impacting Crude Oil (`USOIL`) and Natural Gas (`NG`). | Telegram instant alerts, live ticker monitoring, quick market impact reading. | Very High ($500–$2,000/mo) |
| **Global Macro Hedge Fund Analyst** | Quantitative geopolitical event data for strategy backtesting and portfolio risk positioning. | Backtesting Engine, historical signal exports, API integration, Mapbox GIS. | Extremely High ($1,000–$5,000/mo) |
| **Corporate Supply Chain Officer** | Tracking maritime chokepoint blockades, sanctions updates, and shipping disruption risks. | GIS Map monitoring, email summaries, custom alert rules. | Medium-High ($250–$1,000/mo) |
| **Geopolitical & Military Analyst** | Automated ingestion of GDELT/ACLED event streams with structured LLM military synthesis. | Event Deep-Dive (`/events/[id]`), structured JSON feeds, raw source auditing. | Medium ($100–$300/mo) |

---

## 2. Subscription Tiers & Plan Structure

The application enforces tier gating via the `plan_tier` column in the `profiles` table in Supabase PostgreSQL:

```
                  ┌──────────────────────────────────────────────┐
                  │                 Free Tier                    │
                  │  - Delayed signals (15-min delay)            │
                  │  - Max 3 active alert rules                  │
                  │  - Web Terminal access only                  │
                  └──────────────────────┬───────────────────────┘
                                         │ Upgrade
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │                Analyst Tier                  │
                  │  - Real-time zero-delay signal stream        │
                  │  - Unlimited Web/Mobile access               │
                  │  - Telegram & Slack push notifications       │
                  │  - Max 25 active alert rules                 │
                  └──────────────────────┬───────────────────────┘
                                         │ Upgrade
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │                 Pro & API                    │
                  │  - Sub-second Custom Webhooks                │
                  │  - Dedicated Fastify REST API Keys           │
                  │  - Backtesting Suite execution               │
                  │  - High rate-limits (1,000 req/min)          │
                  └──────────────────────────────────────────────┘
```

### Plan Gating Specification Matrix

| Feature | Free Tier | Analyst Tier ($199/mo) | Pro Tier ($499/mo) | Institutional API ($1,499/mo) |
| :--- | :--- | :--- | :--- | :--- |
| **Signal Latency** | 15-min delay | Real-time (0 delay) | Real-time (0 delay) | Sub-second streaming |
| **Active Alert Rules** | 3 max | 25 max | Unlimited | Unlimited |
| **Dispatch Channels** | Email only | Telegram, Slack, Push | Telegram, Slack, Push, Webhooks | REST API, Custom Webhooks |
| **Backtesting Engine** | Disabled | 5 runs/month | Unlimited runs | Unlimited + Raw Data Export |
| **REST API Access** | No | No | Yes (10k req/mo) | Yes (100k req/mo) |
| **Mapbox Layers** | Basic GIS | Full GIS Heatmap | Full GIS Heatmap | Custom GIS GeoJSON Export |

---

## 3. Current vs. Future Monetization

### Current Monetization Mechanism
- **Manual Enterprise Billing & Waitlist Gating**: Platform access is controlled via `isProjectReady` feature flag (`process.env.PROJECT_READY`). Unauthenticated or ungated users submit early access requests via the waitlist modal (`AccessLimitedModal.tsx`).
- **Plan Enforcement**: Fastify backend middleware (`apps/backend/src/middleware/plan-guard.ts`) checks Supabase JWT profile tiers and enforces rate-limits / rule caps.

### Future Monetization Expansion
1. **Stripe Billing Integration**: Automated recurring SaaS subscriptions via Stripe Webhooks for seamless upgrade from Analyst to Pro.
2. **Pay-Per-Signal API Metering**: Usage-based billing for quantitative funds consuming signals programmatically.
3. **Enterprise SLA Support**: Guaranteed 99.99% uptime with dedicated BullMQ queue isolation for high-frequency trading clients.
