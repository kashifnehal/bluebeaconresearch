import assert from "node:assert/strict";
import {
  hintSeenKey,
  hintsForPathname,
  RECORD_BUTTON_TOOLTIP,
} from "./feature-hints";

assert.equal(hintSeenKey("watchlist_chips"), "bbr_hint_seen_watchlist_chips");
assert.equal(hintSeenKey("dashboard_filters"), "bbr_hint_seen_dashboard_filters");
assert.equal(hintSeenKey("event_record"), "bbr_hint_seen_event_record");

assert.deepEqual(
  hintsForPathname("/watchlist").map((h) => h.id),
  ["watchlist_chips"],
);
assert.deepEqual(
  hintsForPathname("/dashboard").map((h) => h.id),
  ["dashboard_filters"],
);
assert.deepEqual(
  hintsForPathname("/events/abc-123").map((h) => h.id),
  ["event_record"],
);
assert.deepEqual(hintsForPathname("/backtesting").map((h) => h.id), []);
assert.deepEqual(hintsForPathname("/watchlist/USOIL").map((h) => h.id), []);

assert.match(RECORD_BUTTON_TOOLTIP, /local storage/i);
assert.doesNotMatch(RECORD_BUTTON_TOOLTIP, /backtest/i);

console.log("feature-hints.test.ts ok");
