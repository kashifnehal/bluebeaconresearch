# 09_BACKLOG.md — Product Backlog & Engineering Roadmap

This document outlines prioritized tasks, technical debt resolution, feature enhancements, and future milestones for Blue Beacon Research.

---

## 1. Critical Priority (P0 — Blockers for v1.0 Launch)

- [ ] **Stripe Self-Serve Billing**: Implement Stripe Webhook handler (`POST /api/billing/webhook`) to handle subscription upgrades/cancellations and update Supabase `profiles.plan_tier`.
- [ ] **Production Environment Variable Audit**: Ensure production deployment scripts validate all required keys via `apps/backend/src/env.ts`.
- [ ] **Worker Memory Leak Monitoring**: Add process health metrics to BullMQ workers (`workers.ts`) to monitor long-running memory usage.

---

## 2. High Priority (P1 — Core Experience & Reliability)

- [ ] **Sub-100ms WebSocket Signal Feed**: Replace REST polling on `/dashboard` with persistent Supabase Realtime / WebSocket stream.
- [ ] **Map Layer Toggles (MapLibre)**: Add maritime shipping straits (Hormuz, Bab-el-Mandeb, Malacca, Suez) overlay and crude oil pipeline maps to `/map` using MapLibre-compatible vector/raster layers.
- [ ] **Multi-Model AI Cross-Verification**: Implement parallel classification using OpenAI o3-mini alongside Claude 3.5 Sonnet to verify high-severity signals ($\ge 9$).

---

## 3. Medium Priority (P2 — Institutional Features)

- [ ] **PDF/CSV Backtest Report Exporter**: Generate downloadable PDF executive backtest summaries with equity curves and drawdowns.
- [ ] **Audio Alert Trigger**: Add web browser audio alert chime when breaking severity 9+ signals arrive.
- [ ] **SAML / SSO Enterprise Authentication**: Integrate SAML 2.0 / Okta for enterprise tier users.

---

## 4. Low Priority & Technical Debt (P3)

- [ ] **Upgrade Tailwind CSS Config**: Streamline legacy custom color variables in `apps/web/tailwind.config.ts`.
- [ ] **Unit & Integration Test Suite**: Expand Vitest / Jest coverage across Fastify routes and BullMQ worker queue handlers.
- [ ] **OpenAPI Spec Auto-Generation**: Auto-publish Swagger UI documentation to public developer developer portal (`/docs`).
