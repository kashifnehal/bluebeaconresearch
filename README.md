# GeoSignal Pro — Tactical Intelligence Terminal

GeoSignal Pro is a high-fidelity geopolitical intelligence terminal that transforms global conflict data into actionable market signals.

## 🚀 Project Overview

This monorepo (Turborepo) contains the full stack for the GeoSignal platform:
- **`apps/web`**: Next.js terminal frontend (Tailwind v4, Shadcn, Framer Motion).
- **`apps/api`**: Background ingestion workers (GNews, ACLED, GDELT) and AI enrichment services (Claude 3.5).
- **`packages/shared`**: Shared TypeScript types and business logic.

## 🛠 Getting Started

### 1. Prerequisites
- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0
- **Supabase**: Account and active project.

### 2. Environment Setup
Every package requires specific environment variables. We provide templates in `.env.example`.

```sh
# Root Setup
cp .env.example .env

# App Setup
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

> [!IMPORTANT]
> **Security Protocol**: Never commit `.env` files to Git. We have sanitized the `.env.example` templates, but you must populate the local `.env` with your own rotated keys.

### 3. Installation & Development
```sh
pnpm install
pnpm dev
```

## 📂 Documentation

Detailed technical guides and project walkthroughs are available in the artifacts directory:
- **[Walkthrough](./docs/terminal-export/walkthrough.md)**: Visual guide to all tactical modules.
- **[API & Data Flow Audit](./docs/terminal-export/api_flow_audit.md)**: Deep-dive into the ingestion and AI enrichment pipeline.
- **[Production Readiness Guide](./docs/terminal-export/production_readiness_guide.md)**: Critical security and deployment protocols.

## ✅ Production Checklist
- [x] Sanitized environment templates.
- [x] Implemented rate-limiting via Upstash.
- [x] Configured Sentry error tracking.
- [x] Verified 1:1 visual parity with Stitch design system.

---
*GS-ALPHA MAIN CONTROL: v1.0.0*
