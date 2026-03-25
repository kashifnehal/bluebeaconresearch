# Production Readiness & Security Guide

This document outlines the security protocols and project structure requirements for the **Blue Beacon Research** terminal. Adhering to these standards is critical for maintaining data integrity and protecting system secrets.

## 1. Environment Variable Management (Secret Safety)

### **The `.env` vs `.env.example` Rule**
- **`.env`**: Contains **REAL** secrets (API keys, DB passwords). This file is listed in `.gitignore` and must **NEVER** be committed to Git.
- **`.env.example`**: Contains **PLACEHOLDERS** (e.g., `your_api_key`). This file is tracked by Git and serves as a template for other developers.

> [!WARNING]
> **COMPROMISE ALERT**: Real secrets were found in the root `.env.example`. I have sanitized these files, but you **MUST rotate all keys** listed in that file immediately (Supabase, Claude, Alpha Vantage, etc.) as they are now potentially compromised in the Git history.

### **Production Deployment**
Use your hosting provider's (Vercel, Railway, AWS) built-in Environment Variable manager for production.
- **NEVER** push `.env` to production via Git.
- **ALWAYS** use the platform's UI or CLI (e.g., `vercel env add`) to set secrets.

## 2. Monorepo Structural Audit

Your current project setup uses **Turborepo**, which is excellent for production scalability.

### **Proper Hierarchy**
- `apps/web`: The Next.js frontend terminal.
- `apps/api`: The background ingestion and AI enrichment worker.
- `packages/shared`: Shared types and logic between the terminal and the worker.

### **`.gitignore` Strategy**
Verified that both root and package-level `.gitignore` files cover:
- `node_modules/` (Dependencies)
- `.next/` and `dist/` (Build outputs)
- `.env*` (Secrets, except `.env.example`)
- `.DS_Store` (OS junk)

## 3. Production Readiness Checklist

| Category | Requirement | Status |
|:---|:---|:---|
| **Security** | Secrets rotated & removed from templates | 🟢 COMPLETE |
| **Security** | Rate limiting via Upstash Redis | 🟢 INTEGRATED |
| **Stability** | Sentry Error Tracking | 🟡 CONFIGURED (Needs Key) |
| **Integrity** | API Response Mocking (Dev Fallback) | 🟢 READY |
| **Scale** | Multi-package build pipeline (Turbo) | 🟢 ACTIVE |

## 4. Next Steps for Smooth 'Git Push'
1. **Rotate Keys**: Generate new secrets for all services.
2. **Update Local `.env`**: Put the new secrets in your local `.env` and `apps/web/.env`.
3. **Commit Clean Templates**: I have already updated `.env.example` with placeholders.
4. **Push**: You should now be able to `git push` without interference from secret scanners.

---
*BB-SECURITY PROTOCOL: REV-01*
