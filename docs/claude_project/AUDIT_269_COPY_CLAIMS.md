# Audit #269 — Copy Claims Review (apps/web)

**Scope:** every user-facing string in `apps/web/app` and `apps/web/components`, grepped case-insensitively for: bloomberg, terminal, institutional, "same quality", grade, real-time/realtime, instant, sub-second, seconds, accurate/accuracy, proven, guarantee, verified, confirmed, validated, best, first, leading, proprietary, exclusive, 24/7. ("AI-powered" is allowed and not flagged.)

**Method:** `rg` across `apps/web/app` and `apps/web/components` for the term list, with CSS-utility false positives (`leading-relaxed`, `leading-[1.05]`, `first-child`, `first:border-t-0`, etc.) and non-user-facing code comments/variable names filtered out by hand. Each surviving hit was checked against the actual backing code/data (classification pipeline, live DB queries, enforced limits) to judge provability. Zero hits for: bloomberg, "same quality", sub-second, proprietary, exclusive, 24/7, best.

**Note on `apps/web/app/page.tsx` and `apps/web/app/how-it-works/**`:** per task instructions these are marked "being edited by another session" below and are listed for completeness only — no action recommended here.

## Hits in files marked "being edited by another session"

| file:line | exact text | claim | proof | action |
|---|---|---|---|---|
| `app/page.tsx:12,16` | "Source-first geopolitical research, structured as market signals..." | methodology descriptor ("first" = sourced-before-written), not a market-position claim | n/a | being edited by another session |
| `app/page.tsx:113,300,366` | "Accuracy" nav links | navigation label only | n/a | being edited by another session |
| `app/page.tsx:198-199` | "Critical Alert" / "Active Signal" badge gated on `severity >= 8` | — | provable (`latestSignal.severity >= 8`, live data) | being edited by another session |
| `app/page.tsx:295` | "Directional outcomes are scored from real price data after a 48-hour checkpoint, with methodology and sample size on a public page." | accuracy methodology claim | provable — matches `accuracy.routes.ts` (48h checkpoint, `signal_outcomes` table) | being edited by another session |
| `app/how-it-works/page.tsx:112,117,208` | "proof", "guarantees", "Accuracy" link | self-disclosure / disclaimer language | n/a | being edited by another session |

## Hits requiring action (remove / soften)

| file:line | exact text | what it claims | provable from code/data? | recommended action |
|---|---|---|---|---|
| `components/AccessLimitedModal.tsx:37` | "Only the first 1000 users are being onboarded in this phase." | A hard, specific numeric cap (1000 users) on the access-gated phase | **No.** The modal's visibility is gated by the static `isProjectReady` flag in `app/layout.tsx:52`, not by any count of users, waitlist rows, or onboarded accounts. Grepped the whole repo for a "1000" user-cap check (`waitlist_count`, admin metrics, auth triggers) — nothing enforces this number anywhere. It is pure copy with no backing logic. | **remove or soften** — either drop the specific "1000" (e.g. "Access is limited while we onboard users in phases") or wire it to the real `waitlist_count` admin metric already computed in `admin_usage_metrics()` / shown on `/admin/metrics`. Do not keep an unprovable hard number. |
| `components/AccessLimitedModal.tsx:38` | "We are expanding our research capacity to maintain signal quality and accuracy." | Implies a deliberate quality/accuracy-driven throttling rationale | No metric backs "signal quality" as a reason for the access gate; this is unverifiable narrative framing. | **soften** to something that doesn't assert a causal quality rationale that can't be shown (e.g. a plain capacity/onboarding-pace statement), or **remove** the "quality and accuracy" justification clause specifically. |
| `components/HelpModal.tsx:76` | "Confidence: Percentage certainty evaluated by our classification pipeline based on **multi-source verification and cross-referencing**." | Claims the confidence score comes from checking a story against multiple sources | **No.** `apps/backend/src/services/claude.service.ts` computes `confidence` as a single float (0.0–1.0) returned by one Claude classification call over one article (see the JSON schema the prompt requests, line ~439: `"confidence": a float... representing certainty`). `signal-merge.ts` just carries that value through. Grepped the backend for "cross-referenc\|multi-source\|corroborat" — zero matches anywhere in the classification/merge code. There is no step that checks a story against other sources before assigning confidence. | **remove or soften** — drop "multi-source verification and cross-referencing" and describe confidence as what it actually is (a single-article classifier certainty score), or implement real cross-referencing before claiming it. |

## Hits reviewed and judged provable / not a real claim (keep)

| file:line | exact text | claim | proof | action |
|---|---|---|---|---|
| `app/accuracy/page.tsx:12,14,163,172` | "Signal Accuracy", "Historical accuracy of BBR's signals, computed automatically from real price data." | Describes the accuracy page's own methodology | Provable — the page genuinely reads only `GET /v1/accuracy`, which is computed from `signal_outcomes` rows written by `outcome-tracker.ts` (confirmed in `accuracy.routes.ts`), not a hand-typed number. | keep |
| `app/status/page.tsx:7` | meta description: "Real-time infrastructure operational status for Blue Beacon Research." | Claims the status page is live/real-time | Provable — `export const dynamic = "force-dynamic"` (no caching/prerendering) and `lib/status-checks.ts` runs live Supabase/Redis checks on every request (freshness checks against `signals.created_at`, `user_channels`, etc., each request). | keep |
| `components/HelpModal.tsx:114` | "A live count of active signals currently rated severity 8 or higher — not a synthesized index." | Claims the map's high-severity counter is a real live count, not a derived/fake index | Provable — `app/(dashboard)/map/page.tsx:900`: `const highSeverityCount = liveSignals.filter((s) => s.severity >= 8).length;`, computed client-side from the actually-fetched live signal set. | keep |
| `app/terms/page.tsx:33-34` | "Blue Beacon Research makes no guarantees about the accuracy or timeliness of data." | Disclaimer, not an affirmative claim | Self-disclaiming language; nothing to prove. | keep |
| `app/(dashboard)/alerts/page.tsx:422,770` | "Set Up Your First Rule", "...Connect them in Settings first." | Literal UI instruction copy ("first" = sequence/order), not a market-position claim | n/a | keep |
| `app/(dashboard)/calendar/page.tsx:236,241` | countdown timer rendering `{seconds}s` | Functional live countdown to a scheduled event, not a speed/performance claim | It's a `Date.now()`-driven countdown rerendered each tick — does what it says. | keep |
| `components/DiscordConnect.tsx:132` | "Paste a valid Discord webhook URL first" | Literal form-validation instruction | n/a | keep |
| `app/api/events/stream/route.ts:12` | "Realtime signal stream has been retired; polling is now the sole update path." | Explicitly **disclaims** real-time, returned as a 410 body to stale clients | Self-disclosing and accurate per the file's own retirement comment (2026-09-03). | keep |

## "Terminal" branding — flagged, not independently actionable

The product's dashboard is branded "Terminal" / "OPEN FULL TERMINAL" across multiple files:

- `components/layout/PublicHeader.tsx:25` — nav CTA to `/dashboard` reads "Terminal"
- `components/HelpModal.tsx:42,94` — "Terminal Knowledge Base & Guidance", "in this terminal"
- `components/map/MobileTensionSheet.tsx:184-185` and `app/(dashboard)/map/page.tsx:1260-1261` — "OPEN FULL TERMINAL" button
- `components/layout/TopBar.tsx:45,278` and `app/(dashboard)/settings/page.tsx:86` — "Terminal User" fallback display name

This directly evokes the "Bloomberg Terminal" association named in this audit's own search terms, and sits next to `CLAUDE.md`'s own external pitch language ("Bloomberg-grade geopolitical intelligence at 1/40th the price"). It is not a factual claim that can be proven or disproven from code/data the way "real-time" or "verified" can — it's a branding/positioning choice. **Not marked remove/soften** since there's nothing to fact-check; flagging it here because it's the single most load-bearing instance of exactly the association this audit was asked to hunt for, and it's a founder/positioning call, not a code fix.

## Summary

- Hits requiring **remove or soften**: **3** (`AccessLimitedModal.tsx` ×2, `HelpModal.tsx` ×1)
- Hits reviewed and kept (provable or not an actual claim): 11
- Hits in files owned by another session (`page.tsx`, `how-it-works/`): 5, not actioned
- Flagged for founder judgment (not a provable/disprovable claim): "Terminal" branding, 6 occurrences across 5 files
