/**
 * #155 — canonical Help/FAQ copy. Answers describe current product behavior
 * (classifier, materiality gate, accuracy gates, LIVE labels). Keep
 * SEARCH_FAQ_ENTRIES in apps/backend/src/lib/search-catalog.ts in sync.
 */

export type HelpFaqItem = {
  id: string;
  question: string;
  answer: string;
  /** Set when the answer is accurate but a live ops detail was not re-checked this ship. */
  certaintyNote?: string;
};

export const HELP_FAQ_ITEMS: HelpFaqItem[] = [
  {
    id: "confidence",
    question: "What does the confidence score mean?",
    answer:
      "The number on a signal (shown as a percent on the Intelligence Feed featured card, stream rows, and some previews) is the classifier's self-reported certainty that it classified the event correctly. It is not a calibrated probability that a named market will move in the stated direction, and it is not a price forecast. Per-asset chips on cards and in the Market Impact Assessment box do not print that percent; they show ticker and direction only. When the research classifier is unavailable, a keyword fallback is used instead of a full read of the article, and that path produces a small set of formula values rather than a judged confidence.",
  },
  {
    id: "accuracy-history",
    question: "Why do some assets show “not enough history yet” on the Accuracy page?",
    answer:
      "The public Accuracy page only publishes a hit rate when an asset has at least 20 scored 48-hour outcomes. Below that, it shows “Not enough history yet (min 20)” instead of a percentage, so a handful of calls cannot look like a track record. Only up/down predictions are scored. Calls labeled volatile or neutral are counted in a separate box and never enter the headline rate.",
  },
  {
    id: "live",
    question: "What does “LIVE” mean?",
    answer:
      "The Intelligence Feed list header shows “UPDATES ROUGHLY EVERY 30 MIN” — that's the collector cadence, not a live push feed. The real health line is the status banner: “Live ingestion” means the last collector run was within about 20 minutes and the pipeline health feed is available. If that health feed is missing it says “Ingestion status unavailable”; if the last fetch is older than 20 minutes it says “Ingestion delayed.”",
  },
  {
    id: "materiality",
    question: "Why didn’t a news story become a signal?",
    answer:
      "Not every ingested article becomes a signal. After classification, a market-materiality/relevance gate must pass: the story has to contain genuinely new information (not just a reminder of an already-public date) and at least one of (a) a stated market mechanism actually supported by the story, (b) a named entity on BBR’s sourced media-impact watchlist, or (c) a genuine armed-conflict/security event with plausible commodity relevance. Stories that fail stay in the raw-event log and are not inserted as signals. This is BBR’s own product gate, not the legal TSC/Basic securities-law test, and it does not try to predict whether an unconfirmed claim will turn out true. The keyword fallback only passes if it already found a validated commodity or FX impact, or a watchlist hit.",
  },
  {
    id: "not-advice",
    question: "Does Blue Beacon tell me to buy or sell?",
    answer:
      "No. Signals, briefs, alerts, and the per-signal research chat are informational only — not financial advice and not a recommendation to buy, sell, or size a position. The research chat is written to refuse personalized position questions.",
  },
  {
    id: "accuracy-method",
    question: "How is the Accuracy page calculated?",
    answer:
      "A daily worker records, for each signal and named asset, the closest market price at the event and at later checkpoints (1 hour, 4 hours, 24 hours, and 48 hours). The public Accuracy page uses only the 48-hour checkpoint. An up/down call is scored correct if that 48-hour direction matches; moves under 0.5% are treated as flat. Those outcome rows are stored permanently because live price history is only kept for about 90 days. Past performance is not a promise of future results — the Accuracy page’s own disclaimer says so.",
  },
  {
    id: "research-chat",
    question: "What is the research chat on an event page?",
    answer:
      "It answers questions about that signal’s stored briefing, sources, and impacts. It is not a support desk and not live chat. Access is currently limited to an invite list; there is a 30-message/day cap and a daily model-budget cap. Replies cite only the source URLs already attached to that signal.",
    certaintyNote:
      "The invite-list and daily-budget values are from the shipped chat gates. This FAQ does not re-check who is currently on the allowlist or today’s remaining budget.",
  },
  {
    id: "calendar",
    question: "Is the Economic Calendar live market data?",
    answer:
      "No. The Calendar is a manually curated static list of scheduled releases (Fed, ECB, BOJ, and major US prints), not a live paid calendar API. Times in the file are UTC; the local-time toggle is display-only.",
  },
  {
    id: "severity",
    question: "What does severity 1–10 mean?",
    answer:
      "Severity is the classifier’s 1–10 rating of how systemically important the event looks for the markets BBR covers. Higher numbers are reserved for large-scale disruption. When the keyword fallback is used, severity is hard-capped at 6 so a stray keyword cannot mint a 9 on an unrelated story. A “CREATE SEVERE ALERT” shortcut on an event only appears at severity 7 or above.",
  },
  {
    id: "human-review",
    question: "Does a research team review every signal before it appears?",
    answer:
      "No. Classification is automated — a research-model path when that service is available, otherwise a conservative keyword fallback. There is no logged human-review workflow on signals today, so the product does not claim that items are human-verified.",
  },
];
