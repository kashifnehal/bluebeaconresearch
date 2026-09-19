/**
 * Search-assist RAG catalog. Only already-written BBR copy — page names,
 * URLs, and on-page / tour / hint sentences. Do not invent marketing blurbs.
 *
 * FAQ: keep in sync with apps/web/lib/help-faq.ts (#155).
 */

export type SearchSourceKind = "page" | "faq";

export type SearchCatalogEntry = {
  contentKey: string;
  title: string;
  url: string;
  content: string;
  sourceKind: SearchSourceKind;
};

/** Mirrors apps/web/lib/help-faq.ts — question + answer, no invented copy. */
export const SEARCH_FAQ_ENTRIES: SearchCatalogEntry[] = [
  {
    contentKey: "faq:confidence",
    title: "What does the confidence score mean?",
    url: "/help#confidence",
    content:
      "The number on a signal (shown as a percent on the Intelligence Feed featured card, stream rows, and some previews) is the classifier's self-reported certainty that it classified the event correctly. It is not a calibrated probability that a named market will move in the stated direction, and it is not a price forecast. Per-asset chips on cards and in the Market Impact Assessment box do not print that percent; they show ticker and direction only. When the research classifier is unavailable, a keyword fallback is used instead of a full read of the article, and that path produces a small set of formula values rather than a judged confidence.",
    sourceKind: "faq",
  },
  {
    contentKey: "faq:accuracy-history",
    title: "Why do some assets show not enough history yet on the Accuracy page?",
    url: "/help#accuracy-history",
    content:
      "The public Accuracy page only publishes a hit rate when an asset has at least 20 scored 48-hour outcomes. Below that, it shows not enough history yet (min 20) instead of a percentage, so a handful of calls cannot look like a track record. Only up/down predictions are scored. Calls labeled volatile or neutral are counted in a separate box and never enter the headline rate.",
    sourceKind: "faq",
  },
  {
    contentKey: "faq:live",
    title: "What does LIVE mean?",
    url: "/help#live",
    content:
      "There are two different labels. LIVE DATA FEED ON on the Intelligence Feed list header is a static label — it does not check whether collectors last succeeded. The real health line is the status banner: Live ingestion means the last collector run was within about 20 minutes and the pipeline health feed is available. If that health feed is missing it says Ingestion status unavailable; if the last fetch is older than 20 minutes it says Ingestion delayed.",
    sourceKind: "faq",
  },
  {
    contentKey: "faq:materiality",
    title: "Why didn't a news story become a signal?",
    url: "/help#materiality",
    content:
      "Not every ingested article becomes a signal. After classification, a market-materiality/relevance gate must pass: the story has to contain genuinely new information (not just a reminder of an already-public date) and at least one of a stated market mechanism actually supported by the story, a named entity on BBR's sourced media-impact watchlist, or a genuine armed-conflict/security event with plausible commodity relevance. Stories that fail stay in the raw-event log and are not inserted as signals. This is BBR's own product gate, not the legal TSC/Basic securities-law test. The keyword fallback only passes if it already found a validated commodity or FX impact, or a watchlist hit.",
    sourceKind: "faq",
  },
  {
    contentKey: "faq:not-advice",
    title: "Does Blue Beacon tell me to buy or sell?",
    url: "/help#not-advice",
    content:
      "No. Signals, briefs, alerts, and the per-signal research chat are informational only — not financial advice and not a recommendation to buy, sell, or size a position. The research chat is written to refuse personalized position questions.",
    sourceKind: "faq",
  },
  {
    contentKey: "faq:accuracy-method",
    title: "How is the Accuracy page calculated?",
    url: "/help#accuracy-method",
    content:
      "A daily worker records, for each signal and named asset, the closest market price at the event and at later checkpoints (1 hour, 4 hours, 24 hours, and 48 hours). The public Accuracy page uses only the 48-hour checkpoint. An up/down call is scored correct if that 48-hour direction matches; moves under 0.5% are treated as flat. Those outcome rows are stored permanently because live price history is only kept for about 90 days.",
    sourceKind: "faq",
  },
  {
    contentKey: "faq:research-chat",
    title: "What is the research chat on an event page?",
    url: "/help#research-chat",
    content:
      "It answers questions about that signal's stored briefing, sources, and impacts. It is not a support desk and not live chat. Access is currently limited to an invite list; there is a 30-message/day cap and a daily model-budget cap. Replies cite only the source URLs already attached to that signal.",
    sourceKind: "faq",
  },
  {
    contentKey: "faq:calendar",
    title: "Is the Economic Calendar live market data?",
    url: "/help#calendar",
    content:
      "No. The Calendar is a manually curated static list of scheduled releases (Fed, ECB, BOJ, and major US prints), not a live paid calendar API. Times in the file are UTC; the local-time toggle is display-only.",
    sourceKind: "faq",
  },
  {
    contentKey: "faq:severity",
    title: "What does severity 1-10 mean?",
    url: "/help#severity",
    content:
      "Severity is the classifier's 1-10 rating of how systemically important the event looks for the markets BBR covers. Higher numbers are reserved for large-scale disruption. When the keyword fallback is used, severity is hard-capped at 6 so a stray keyword cannot mint a 9 on an unrelated story. A CREATE SEVERE ALERT shortcut on an event only appears at severity 7 or above.",
    sourceKind: "faq",
  },
  {
    contentKey: "faq:human-review",
    title: "Does a research team review every signal before it appears?",
    url: "/help#human-review",
    content:
      "No. Classification is automated — a research-model path when that service is available, otherwise a conservative keyword fallback. There is no logged human-review workflow on signals today, so the product does not claim that items are human-verified.",
    sourceKind: "faq",
  },
];

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
      "Questions about what a score or label means? Help & FAQ.",
    ].join(" "),
    sourceKind: "page",
  },
  {
    contentKey: "page:/help",
    title: "Help",
    url: "/help",
    content: [
      "Help. FAQ. Feedback.",
      "Straight answers about what the product does today. This is not a live help desk — use the form at the bottom to send feedback or a bug report.",
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
