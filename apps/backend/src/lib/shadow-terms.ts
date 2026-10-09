/**
 * Shadow term groups — diagnostic-only match groups for [RSS-DROP]/[FIN-SHADOW]
 * logging (claude/w16a). Never used to change a keep/drop decision anywhere.
 *
 * Every group's `source` records exactly what was read to build its `terms`;
 * a candidate group with no real source read is left out (see task report).
 *
 * GPR (geopolitical risk index) search strings — the eight standard GPR
 * categories (war threats, peace threats, military buildups, nuclear threats,
 * terror threats, war acts, terror acts, escalation) — are intentionally NOT
 * used as terms here; the GPR string list itself was unavailable for this task.
 */

export type ShadowTermGroup = {
  id: string;
  label: string;
  source: string;
  terms: string[];
};

export const SHADOW_TERM_GROUPS: ShadowTermGroup[] = [
  {
    id: "chokepoints",
    label: "EIA oil transit chokepoints",
    source:
      "https://www.eia.gov/beta/international/analysis_includes/special_topics/World_Oil_Transit_Chokepoints " +
      "and https://www.eia.gov/todayinenergy/detail.php?id=65504 (read 2026-10-10). The EIA page explicitly " +
      'notes the Cape of Good Hope is "not a chokepoint" — deliberately excluded.',
    terms: [
      "strait of hormuz",
      "hormuz",
      "strait of malacca",
      "malacca",
      "suez canal",
      "suez",
      "sumed",
      "bab el-mandeb",
      "bab al-mandeb",
      "danish straits",
      "bosporus",
      "dardanelles",
      "turkish straits",
      "panama canal",
    ],
  },
  {
    id: "commodity-names",
    label: "Commodity names (NBER 31950, Hudecova & Rajcaniova 2023, Permutable coverage)",
    source:
      "https://www.nber.org/papers/w31950 (Aizenman, Lindahl, Stenvall, Uddin — abstract: wheat, corn, " +
      "European natural gas); Hudecova & Rajcaniova (2023), Agricultural Economics - Czech 69(4):129-139 " +
      "(rapeseed, sugar, sunflower oil, wheat, corn, cotton, rough rice); " +
      "https://permutable.ai/commodities-sentiment/ (read 2026-10-10, confirms crude/natural gas/soybeans).",
    terms: ["wheat", "corn", "natural gas", "crude", "sunflower oil", "rapeseed", "sugar", "soybeans", "cotton", "rice"],
  },
  {
    id: "event-natural-disasters",
    label: "natural disasters",
    source: "https://permutable.ai/energy-and-commodity-traders/ (read 2026-10-10) — names \"natural disasters\" directly.",
    terms: ["earthquake", "flood", "hurricane"],
  },
  {
    id: "event-weather",
    label: "weather disruption",
    source:
      "https://permutable.ai/energy-and-commodity-traders/ (read 2026-10-10) — names \"weather disruption\"/" +
      '"weather shocks" directly.',
    terms: ["storm", "hurricane", "drought", "flood"],
  },
  {
    id: "event-inventory",
    label: "inventory levels",
    source: "https://permutable.ai/energy-and-commodity-traders/ (read 2026-10-10) — names \"inventory levels\" directly.",
    terms: ["inventories"],
  },
  {
    id: "event-trade-restrictions",
    label: "trade restrictions",
    source: "https://permutable.ai/energy-and-commodity-traders/ (read 2026-10-10) — names \"trade restrictions\" directly.",
    terms: ["export ban", "export curbs", "quota", "licence"],
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word or whole-phrase, case-insensitive match. Diagnostic only. */
export function matchShadowGroups(text: string): string[] {
  const lower = text.toLowerCase();
  const ids: string[] = [];
  for (const group of SHADOW_TERM_GROUPS) {
    if (group.terms.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(lower))) {
      ids.push(group.id);
    }
  }
  return ids;
}
