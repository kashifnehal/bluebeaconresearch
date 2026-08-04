# 10_DECISIONS.md — Architectural Decision Records (ADRs) & Trade-offs

This document records the foundational architectural decisions, framework selections, infrastructure trade-offs, underlying assumptions, and system risks for Blue Beacon Research.

---

## 1. ADR 001: Selection of Next.js 16 App Router for Web Terminal

### Context
The platform requires an institutional dark terminal interface with fast initial page load (SEO for landing page) combined with protected real-time dashboard routes.

### Decision
Adopt Next.js 16 (`apps/web`) using the App Router, `@supabase/ssr` middleware, and React 19.

### Rationale
- **SSR & SEO**: Server-side rendering for `/` and public pages guarantees optimal search engine indexing.
- **Middleware Guarding**: `middleware.ts` enables zero-latency route checking for authentication and `isProjectReady` gating before rendering page components.
- **Developer Velocity**: Seamless monorepo integration with shared TypeScript types (`packages/shared`).

---

## 2. ADR 002: Fastify REST Backend vs. Next.js API Routes

### Context
High-frequency ingestion workers, background alert routing, and external developer APIs require high-throughput Node.js execution.

### Decision
Decouple the backend API into a dedicated Fastify REST server (`apps/backend`) running on port 3001 rather than using Next.js route handlers exclusively.

### Rationale
- **Throughput**: Fastify is significantly faster with lower overhead than Next.js serverless functions.
- **Long-Running Process Isolation**: Background workers (`workers.ts`) and cron schedulers require persistent Node.js event loops, which are prohibited in serverless environments like Vercel.
- **Schema Validation**: Built-in Zod schema compilation and Fastify plugin ecosystem.

---

## 3. ADR 003: Upstash Redis & BullMQ for Background Processing

### Context
Ingesting 350+ global news feeds every 15 minutes and dispatching sub-second alerts requires reliable queue management with retry logic.

### Decision
Utilize BullMQ backed by Upstash serverless Redis.

### Rationale
- **Decoupled Heavy Operations**: AI prompts (Anthropic API calls take 1–3s) are isolated from HTTP request/response loops.
- **Concurrency & Backoff**: BullMQ provides automatic exponential backoff, rate-limiting, and dead-letter queues out of the box.
- **Serverless Redis**: Upstash Redis allows seamless scaling without managing self-hosted Redis servers.

---

## 4. ADR 004: Supabase PostgreSQL for Relational Data & RLS Security

### Context
Geopolitical signals, user preferences, alert rules, and API keys require strict tenant isolation and complex relational querying.

### Decision
Adopt Supabase PostgreSQL with native Row Level Security (RLS).

### Rationale
- **Database-Level Isolation**: RLS policies (`auth.uid() = user_id`) enforce security directly inside PostgreSQL, eliminating multi-tenant data leaks regardless of API layer bugs.
- **Full-Text Search**: Built-in GIN index support (`to_tsvector`) for fast text search on signal titles and summaries.
- **Ecosystem Integration**: Unified authentication, database migrations, and real-time subscriptions.

---

## 5. Architectural Assumptions & Future Risks

1. **Third-Party API Availability**: System relies heavily on external uptime of GDELT, ACLED, Anthropic Claude API, and Alpha Vantage.
2. **Anthropic API Token Costs**: High ingestion volumes could increase Claude token consumption costs; mitigation involves caching raw events before calling LLM.
3. **Mapbox Load Gating**: GIS map usage must stay within Mapbox free/pro tier bounds.
