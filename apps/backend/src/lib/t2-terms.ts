// Candidate terms taken from public pages named in each source field, read 2026-10-11; page text not re-verified; not a validated list; no term may be added without a source string.

export type T2TermGroup = {
  id: string;
  terms: string[];
  source: string;
};

export type T2AssetTerms = {
  id: string;
  aliases: string[];
  events: string[];
  source: string;
};

export const T2_COMMON_POLICY: T2TermGroup = {
  id: "COMMON_POLICY",
  terms: [
    "export ban",
    "export curbs",
    "export curb",
    "export levy",
    "export duty",
    "export tax",
    "export quota",
    "export cap",
    "export permit",
    "export permits",
    "import duty",
    "import ban",
    "customs duty",
    "anti-dumping",
    "tariff",
    "tariffs",
    "sanctions",
    "embargo",
  ],
  source:
    "USDA GAIN reports (Indonesia ID2022-0004, India IN2024-0020, Argentina 2015), Jakarta Post, Business Standard, Reuters via Al Jazeera 12 Aug 2025, Farm Progress/Bloomberg 27 Jan 2026.",
};

export const T2_COMMON_SUPPLY: T2TermGroup = {
  id: "COMMON_SUPPLY",
  terms: ["drought", "frost", "flood", "floods", "el nino", "la nina", "heatwave", "harvest"],
  source: "FAO and ICCO/ICO market notes, Barchart.",
};

export const T2_ASSET_TERMS: T2AssetTerms[] = [
  {
    id: "VEG_OILS",
    aliases: [
      "palm oil",
      "sunflower oil",
      "rapeseed oil",
      "canola oil",
      "canola",
      "rapeseed",
      "vegetable oil",
      "vegetable oils",
      "edible oil",
      "edible oils",
    ],
    events: ["levy", "b40", "b50", "biodiesel", "domestic market obligation", "reference price", "black sea", "grain corridor"],
    source: "Jakarta Post, USDA GAIN ID2022-0004, Fastmarkets, Al Jazeera/Reuters 12 Aug 2025.",
  },
  {
    id: "SOYBEANS",
    aliases: ["soybean", "soybeans", "soy oil", "soybean oil", "soybean meal", "soymeal"],
    events: ["crush", "purchase commitment", "purchase commitments", "trade truce", "biofuel", "planting"],
    source: "USDA GAIN Argentina 2015, World Grain 2016, Farm Progress/Bloomberg 27 Jan 2026.",
  },
  {
    id: "SUGAR",
    aliases: ["sugar", "raw sugar", "white sugar", "sugarcane", "sugar cane"],
    events: ["ethanol", "red rot", "cane crushing", "conab", "monsoon"],
    source: "USDA GAIN IN2024-0020, Barchart 2022.",
  },
  {
    id: "COFFEE",
    aliases: ["coffee", "arabica", "robusta"],
    events: ["section 301", "inventories", "certified stocks", "red sea"],
    source: "Barchart, Reuters via The Star 10 Jul 2026.",
  },
  {
    id: "COCOA",
    aliases: ["cocoa"],
    events: ["swollen shoot", "black pod", "forward sales", "farmgate", "grindings", "deficit"],
    source: "ICCO market report June 2024, Barchart Dec 2023.",
  },
  {
    id: "ALUMINIUM",
    aliases: ["aluminium", "aluminum"],
    events: [
      "smelter",
      "smelters",
      "curtailment",
      "force majeure",
      "warranting",
      "cbam",
      "section 232",
      "lme",
      "output cut",
      "output cuts",
    ],
    source: "Aluminium Today 2023, Fastmarkets 2022, Argus 2018, AL Circle 2018.",
  },
  {
    id: "NICKEL",
    aliases: ["nickel", "nornickel"],
    events: ["rkab", "ore quota", "mining quota", "suspended mining", "smelter", "indonesia", "lme", "class 1"],
    source: "Benchmark Minerals, Project Blue 2026.",
  },
];

/** Same source string on both shadow groups that are built from these lists. */
export const T2_SHADOW_SOURCE =
  "Candidate terms taken from public pages named in each source field, read 2026-10-11; page text not re-verified; not a validated list; no term may be added without a source string. " +
  "USDA GAIN reports (Indonesia ID2022-0004, India IN2024-0020, Argentina 2015), Jakarta Post, Business Standard, Reuters via Al Jazeera 12 Aug 2025, Farm Progress/Bloomberg 27 Jan 2026. " +
  "FAO and ICCO/ICO market notes, Barchart. Jakarta Post, USDA GAIN ID2022-0004, Fastmarkets, Al Jazeera/Reuters 12 Aug 2025. " +
  "USDA GAIN Argentina 2015, World Grain 2016, Farm Progress/Bloomberg 27 Jan 2026. USDA GAIN IN2024-0020, Barchart 2022. " +
  "Barchart, Reuters via The Star 10 Jul 2026. ICCO market report June 2024, Barchart Dec 2023. " +
  "Aluminium Today 2023, Fastmarkets 2022, Argus 2018, AL Circle 2018. Benchmark Minerals, Project Blue 2026.";

export const T2_GNEWS_QUERIES = [
  '(soybeans OR "palm oil" OR "sunflower oil" OR canola OR sugar OR coffee OR cocoa) AND (export OR tariff OR ban OR quota OR levy OR drought OR frost OR harvest)',
  "(aluminium OR aluminum OR nickel) AND (smelter OR sanctions OR tariff OR quota OR ban OR output OR strike OR LME)",
] as const;

export const T2_GDELT_QUERY_CANDIDATES = [
  '(soybeans OR "palm oil" OR "sunflower oil" OR canola OR sugar OR coffee OR cocoa OR aluminium OR aluminum OR nickel) (export OR tariff OR ban OR quota OR levy OR drought OR frost OR smelter OR sanctions) sourcelang:eng',
  '(soybeans OR "palm oil" OR "sunflower oil" OR canola OR sugar OR coffee OR cocoa OR aluminium OR aluminum OR nickel) sourcelang:eng',
] as const;

/**
 * Which T2_GDELT_QUERY_CANDIDATES entry the collector sends when GDELT_T2_QUERY is on.
 * 0 is V1. Probe 2026-10-14: V1 and V2 both returned HTTP 429 with no articles, so V2 did not replace V1.
 */
export const T2_GDELT_QUERY_INDEX: 0 | 1 = 0;

/** DOC artlist URL. Same mode, maxrecords, format, and sort as the standing GDELT request. */
export function gdeltDocRequestUrl(query: string): string {
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=250&format=json&sort=DateDesc`;
}

type CompiledTerm = { term: string; re: RegExp };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileTerms(terms: readonly string[]): CompiledTerm[] {
  return terms.map((term, index) => ({ term, index }))
    .sort((a, b) => b.term.length - a.term.length || a.index - b.index)
    .map(({ term }) => ({ term, re: new RegExp(`\\b${escapeRegExp(term)}\\b`, "i") }));
}

const compiledAssets = T2_ASSET_TERMS.map((asset) => ({
  id: asset.id,
  aliases: compileTerms(asset.aliases),
  events: compileTerms(asset.events),
}));

const compiledPolicy = compileTerms(T2_COMMON_POLICY.terms);
const compiledSupply = compileTerms(T2_COMMON_SUPPLY.terms);

function firstHit(text: string, compiled: CompiledTerm[]): string | null {
  for (const { term, re } of compiled) {
    if (re.test(text)) return term;
  }
  return null;
}

function longestHit(candidates: (string | null)[]): string | null {
  let best: string | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!best || candidate.length > best.length) best = candidate;
  }
  return best;
}

/**
 * True when one alias of an asset appears with one event of that same asset,
 * or with one common-policy or common-supply term. Whole words and phrases only.
 */
export function matchesT2Pair(text: string): { asset: string; commodity: string; event: string } | null {
  const lower = text.toLowerCase();
  for (const asset of compiledAssets) {
    const commodity = firstHit(lower, asset.aliases);
    if (!commodity) continue;
    const event = longestHit([
      firstHit(lower, asset.events),
      firstHit(lower, compiledPolicy),
      firstHit(lower, compiledSupply),
    ]);
    if (event) return { asset: asset.id, commodity, event };
  }
  return null;
}

/** Read at call time so a test can toggle the flag without reloading the module. */
export function isT2PairRuleEnabled(): boolean {
  return process.env.T2_PAIR_RULE === "true";
}
