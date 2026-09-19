export const HINT_SEEN_PREFIX = "bbr_hint_seen_";

export type FeatureHintId =
  | "watchlist_chips"
  | "dashboard_filters"
  | "event_record";

export type FeatureHintDef = {
  id: FeatureHintId;
  selector: string;
  title: string;
  description: string;
};

/** Persistent hover copy for RECORD — not a first-time hint. Matches handleRecord(). */
export const RECORD_BUTTON_TOOLTIP =
  "Saves this signal to Recorded Signals in this browser's local storage; the app has no list view for those bookmarks yet.";

export const FEATURE_HINTS: FeatureHintDef[] = [
  {
    id: "watchlist_chips",
    selector: '[data-hint="watchlist_chips"]',
    title: "Add markets from here",
    description:
      "Tap a category chip to add or remove that market, or pick a specific asset from ADD COMMODITY. Your list is saved to your account.",
  },
  {
    id: "dashboard_filters",
    selector: '[data-hint="dashboard_filters"]',
    title: "Filter the feed",
    description:
      "Narrow the Intelligence Feed by commodity, region, minimum severity, and time window. The list updates as soon as you change a dropdown.",
  },
  {
    id: "event_record",
    selector: '[data-hint="event_record"]',
    title: "Bookmark this signal",
    description:
      "RECORD stores this event in this browser as Recorded Signals (local storage only). There is no Recorded Signals page yet.",
  },
];

export function hintSeenKey(id: FeatureHintId | string): string {
  return `${HINT_SEEN_PREFIX}${id}`;
}

export function isHintSeen(id: FeatureHintId | string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(hintSeenKey(id)) === "1";
  } catch {
    return true;
  }
}

export function markHintSeen(id: FeatureHintId | string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(hintSeenKey(id), "1");
  } catch {
    // Quota / private mode — hint may reappear this session only.
  }
}

export function hintsForPathname(pathname: string): FeatureHintDef[] {
  if (pathname === "/watchlist") {
    return FEATURE_HINTS.filter((h) => h.id === "watchlist_chips");
  }
  if (pathname === "/dashboard") {
    return FEATURE_HINTS.filter((h) => h.id === "dashboard_filters");
  }
  if (pathname.startsWith("/events/")) {
    return FEATURE_HINTS.filter((h) => h.id === "event_record");
  }
  return [];
}
