import { NextResponse } from "next/server";

// Standard error shape for apps/web/app/api/* routes. Before this, at least four
// different shapes coexisted across routes (bare string `error`, `error.message`
// mixed into the data key, sentence-case human messages, and some routes returning
// 200 with an empty-looking payload on failure with no error field at all). Applied
// here to the routes touched/understood this pass (2026-08-18) — not a full sweep of
// every route in the app, which was explicitly out of scope for this task.
//
// NOTE: this does not apply to apps/web/app/api/signals/route.ts's degraded-mode
// fallback responses (`fallback`/`fallbackReason`/`fallbackLastUpdated`, still 200) —
// that is a deliberate, different, already-working contract that useSignalFeed.ts
// depends on by field name; collapsing it into this shape would be a breaking change
// for no benefit, not a cleanup.
// SECOND DOCUMENTED EXCEPTION (2026-08-27): /api/prices and /api/prices/history
// return a *hybrid* shape on 429 — the normal data key (`prices: []` / `points: []`)
// AND this `error` object side by side — instead of the bare shape below. Reason: both
// routes previously returned an empty data array with no error field at all, so a
// rate-limited response was indistinguishable from "there is genuinely no data",
// which is the same class of bug the reliability pass fixed elsewhere. Switching them
// to the bare apiError() shape would have dropped the data key and crashed
// watchlist/[symbol]/page.tsx, which reads `pricesData?.prices.find(...)` with a
// non-optional `.prices`. Keeping both keys fixes the ambiguity without a breaking
// change. Prefer plain apiError() for new routes; this hybrid exists only where an
// established consumer contract already depends on the data key being present.
export function apiError(status: number, code: string, message?: string) {
  return NextResponse.json({ error: { code, message: message ?? code } }, { status });
}
