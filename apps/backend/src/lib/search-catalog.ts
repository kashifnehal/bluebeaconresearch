/**
 * Search-assist RAG catalog. Only already-written BBR copy — page names,
 * URLs, and on-page / tour / hint sentences. Do not invent marketing blurbs.
 *
 * FAQ: #155's minimal FAQ does not exist in this repo yet (no FAQ route,
 * component, or copy). Keep SEARCH_FAQ_ENTRIES empty until that ships, then
 * append those strings here rather than fabricating Q&A.
 */

export type SearchSourceKind = "page" | "faq";

export type SearchCatalogEntry = {
  contentKey: string;
  title: string;
  url: string;
  content: string;
  sourceKind: SearchSourceKind;
};

/** Empty until #155. Typed so a later FAQ file can concat without a schema change. */
export const SEARCH_FAQ_ENTRIES: SearchCatalogEntry[] = [];

export const SEARCH_PAGE_ENTRIES: SearchCatalogEntry[] = [
  {
    contentKey: "page:/dashboard",
    title: "Intelligence Feed",
    url: "/dashboard",
    content: [
      "Intelligence Feed.",
      "Real-time global signal monitoring.",
      "This is your live signal feed. New geopolitical and macro events that could affect markets you care about show up here as they're confirmed.",
      "Narrow the Intelligence Feed by commodity, region, minimum severity, and time window. The list updates as soon as you change a dropdown.",
      "Need a faster look without leaving the feed? This preview opens a slide-over with severity, confidence, commodity impacts, and a short excerpt of the analyst briefing.",
    ].join(" "),
    sourceKind: "page",
  },
  {
    contentKey: "page:/map",
    title: "Map",
    url: "/map",
    content: [
      "Map. Global Map. Global tension map.",
      "You can also see global risk concentration on the Map.",
      "Global Tension Index.",
    ].join(" "),
    sourceKind: "page",
  },
  {
    contentKey: "page:/watchlist",
    title: "Watchlist",
    url: "/watchlist",
    content: [
      "Watchlist. Commodity Watchlist. Asset Monitoring.",
      "On Watchlist, click into any commodity to see its price charted against the events that moved it.",
      "Tap a category chip to add or remove that market, or pick a specific asset from ADD COMMODITY. Your list is saved to your account.",
    ].join(" "),
    sourceKind: "page",
  },
  {
    contentKey: "page:/alerts",
    title: "Alerts",
    url: "/alerts",
    content: [
      "Alerts. Alert Rules & Signals.",
      "What you asked to be told about — your rules, and the signals that actually matched them.",
      "Turn any signal type into a standing rule — get notified automatically next time something like this happens, without checking back manually.",
    ].join(" "),
    sourceKind: "page",
  },
  {
    contentKey: "page:/backtesting",
    title: "Backtesting Lab",
    url: "/backtesting",
    content: [
      "Backtesting Lab. Scenario Research. Backtesting.",
      "Analyze historical market volatility markers and validate predictive models against real-world geopolitical events.",
      "You can also test how past events like this one moved markets in Backtesting.",
    ].join(" "),
    sourceKind: "page",
  },
  {
    contentKey: "page:/settings",
    title: "Settings",
    url: "/settings",
    content: [
      "Settings. System Configuration & User Preferences.",
      "ACCOUNT. NOTIFICATIONS. APPEARANCE. SECURITY. DATA.",
    ].join(" "),
    sourceKind: "page",
  },
  {
    contentKey: "page:/calendar",
    title: "Economic Calendar",
    url: "/calendar",
    content: [
      "Economic Calendar. Calendar.",
      "Fed, ECB, BOJ, and major US data releases — the scheduled events that move the instruments Blue Beacon tracks.",
    ].join(" "),
    sourceKind: "page",
  },
];

export function getSearchCatalog(): SearchCatalogEntry[] {
  return [...SEARCH_PAGE_ENTRIES, ...SEARCH_FAQ_ENTRIES];
}

export function catalogContentHash(entries = getSearchCatalog()): string {
  const payload = entries
    .map((e) => `${e.contentKey}\n${e.title}\n${e.url}\n${e.content}\n${e.sourceKind}`)
    .join("\n---\n");
  return payload;
}
