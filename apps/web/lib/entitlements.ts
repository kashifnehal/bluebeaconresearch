import type { PlanTier } from "@blue-beacon-research/shared";

/**
 * Personalization entitlement keys (PERS tracker, doc 298 §3). Mirrors
 * apps/backend/src/lib/entitlements.ts key-for-key — keep the two in sync by
 * hand; nothing calls can()/limitFor() yet (see entitlements.test.ts for the
 * only current usage). This is scaffolding for a later, separate task.
 */
export type FeatureKey =
  | "alerts.why_matched"
  | "alerts.quiet_hours_tz"
  | "alerts.feedback_buttons"
  | "alerts.budget_control"
  | "alerts.rules_max"
  | "watchlist.max_symbols"
  | "alerts.channels"
  | "digest.cadence"
  | "signal.reaction_history"
  | "signal.price_confirm"
  | "views.saved_multi"
  | "report.weekly_personal"
  | "feed.interest_rerank"
  | "api.webhook";

/**
 * GATES_ENABLED = false: no route or UI calls can()/limitFor() yet, and both
 * functions below ignore the table and always report "allowed" while this is
 * false. Flip this only once a real caller is wired up and ready to enforce
 * the table — see item 4 of the task that added this file (do not call can()
 * from anywhere else until then).
 */
export const GATES_ENABLED = false;

/**
 * Every free/paid value below (booleans AND numeric limits) is a placeholder
 * DESIGN CHOICE made in this session, not sourced from doc 298 §3 itself
 * (that doc's actual free/paid split was not available to read from this
 * repo — only the key names were). Treat every row as provisional until
 * someone reconciles it against doc 298. Must match the backend table.
 */
export const ENTITLEMENTS: Record<FeatureKey, { free: boolean | number; paid: boolean | number }> = {
  "alerts.why_matched": { free: false, paid: true },
  "alerts.quiet_hours_tz": { free: false, paid: true },
  "alerts.feedback_buttons": { free: false, paid: true },
  "alerts.budget_control": { free: false, paid: true },
  // DESIGN CHOICE, no source: max number of alert rules a user may define.
  "alerts.rules_max": { free: 3, paid: 25 },
  // DESIGN CHOICE, no source: max symbols a user may add to their watchlist.
  "watchlist.max_symbols": { free: 5, paid: 50 },
  // DESIGN CHOICE, no source: max distinct notification channels (email, etc).
  "alerts.channels": { free: 1, paid: 4 },
  // DESIGN CHOICE, no source: digest sends allowed per week (1 = weekly only).
  "digest.cadence": { free: 1, paid: 7 },
  "signal.reaction_history": { free: false, paid: true },
  "signal.price_confirm": { free: false, paid: true },
  "views.saved_multi": { free: false, paid: true },
  "report.weekly_personal": { free: false, paid: true },
  "feed.interest_rerank": { free: false, paid: true },
  "api.webhook": { free: false, paid: true },
};

/** "free" plan maps to the free column; analyst/pro/api all map to paid. */
function bucketFor(planTier: PlanTier): "free" | "paid" {
  return planTier === "free" ? "free" : "paid";
}

/**
 * `gatesEnabled` defaults to the module-level GATES_ENABLED constant, so any
 * real caller always gets today's "everything allowed" behavior. The
 * parameter exists so tests can exercise the table-driven logic as it will
 * behave once gating is turned on, without flipping the module constant.
 */
export function can(planTier: PlanTier, key: FeatureKey, gatesEnabled: boolean = GATES_ENABLED): boolean {
  if (!gatesEnabled) return true;
  const value = ENTITLEMENTS[key][bucketFor(planTier)];
  return typeof value === "number" ? value > 0 : value;
}

export function limitFor(planTier: PlanTier, key: FeatureKey, gatesEnabled: boolean = GATES_ENABLED): number {
  const value = ENTITLEMENTS[key][bucketFor(planTier)];
  if (typeof value !== "number") {
    throw new Error(`"${key}" is not a numeric limit entitlement`);
  }
  if (!gatesEnabled) return Number.POSITIVE_INFINITY;
  return value;
}
