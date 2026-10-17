import { CHOKEPOINTS } from "@blue-beacon-research/shared";
import { EVENT_CATEGORY_LABELS } from "./market-impact-assessment";

/**
 * Keyword presets for the dashboard and map filter bars (added 2026-10-17).
 *
 * Every word below comes from something already in the repo: the event-category
 * names (EVENT_CATEGORY_LABELS), the chokepoint names in packages/shared, or the
 * OPEC entry in apps/web/data/economic-calendar.json. `keyword-presets.test.ts`
 * checks the category and chokepoint words against those sources. Words that
 * would be natural here but were NOT found in the repo are listed as GAP
 * comments and are deliberately left out of the lists.
 *
 * Filtering is client side over the rows already loaded: /api/signals `search`
 * takes one phrase (a single ilike on title and summary, 3+ characters), not a
 * list of words, so several words cannot be sent to it as one query.
 */

export type KeywordPresetId = "sanctions" | "weather" | "opec" | "shipping" | "conflict";
export type KeywordMode = "any" | "all";

export type KeywordSelection = { presets: KeywordPresetId[]; mode: KeywordMode };
export const DEFAULT_KEYWORD_SELECTION: KeywordSelection = { presets: [], mode: "any" };

const CHOKEPOINT_STOP_WORDS = new Set(["turkish", "danish"]); // demonyms match unrelated news

/** Distinctive words (4+ letters) from the chokepoint names in packages/shared. */
export function chokepointWords(): string[] {
  const out = new Set<string>();
  for (const c of CHOKEPOINTS) {
    for (const w of c.name.toLowerCase().match(/[a-z-]{4,}/g) ?? []) {
      if (!CHOKEPOINT_STOP_WORDS.has(w)) out.add(w);
    }
  }
  return [...out];
}

export const KEYWORD_PRESETS: { id: KeywordPresetId; label: string; words: string[] }[] = [
  {
    id: "sanctions",
    label: "Sanctions",
    // From the category "Sanctions & Trade Policy".
    // GAP: "tariff", "embargo", "export ban" are not in the repo.
    words: ["sanctions", "trade policy"],
  },
  {
    id: "weather",
    label: "Weather",
    // GAP: no weather term (drought, hurricane, storm, flood, heatwave, frost) exists
    // in the category names or chokepoint names. The list stays empty and the chip
    // is disabled until a sourced word list is added.
    words: [],
  },
  {
    id: "opec",
    label: "OPEC",
    // "opec": economic-calendar.json (OPEC Monthly Oil Market Report).
    // "production", "output": category "Production & Output Decision".
    // GAP: "quota", "output cut", "barrels per day" are not in the repo.
    words: ["opec", "production", "output"],
  },
  {
    id: "shipping",
    label: "Shipping",
    // "logistics": category "Supply Disruption & Logistics". The rest come from
    // the chokepoint names (strait, canal, hormuz, suez, ...).
    // GAP: "shipping", "tanker", "port", "freight", "container" are not in the repo.
    words: ["logistics", ...chokepointWords()],
  },
  {
    id: "conflict",
    label: "Conflict",
    // From the category "Armed Conflict & Security".
    // GAP: "war", "attack", "missile", "strike" are not in the repo.
    words: ["conflict"],
  },
];

export function presetWords(ids: readonly KeywordPresetId[]): string[] {
  const out = new Set<string>();
  for (const p of KEYWORD_PRESETS) {
    if (ids.includes(p.id)) for (const w of p.words) out.add(w);
  }
  return [...out];
}

export function matchesKeywords(text: string, words: readonly string[], mode: KeywordMode): boolean {
  if (words.length === 0) return true;
  const hay = text.toLowerCase();
  return mode === "all" ? words.every((w) => hay.includes(w)) : words.some((w) => hay.includes(w));
}

/**
 * Applies the selected presets to loaded rows (title + summary). With no preset
 * selected, or only presets with no words, every row passes. Several presets
 * combine their words into one list, then Any / All applies to that list.
 */
export function filterByKeywords<T extends { title?: string | null; summary?: string | null }>(
  rows: readonly T[],
  selection: KeywordSelection,
): T[] {
  const words = presetWords(selection.presets);
  if (words.length === 0) return [...rows];
  return rows.filter((r) => matchesKeywords(`${r.title ?? ""} ${r.summary ?? ""}`, words, selection.mode));
}

export function toggleKeywordPreset(selection: KeywordSelection, id: KeywordPresetId): KeywordSelection {
  const presets = selection.presets.includes(id)
    ? selection.presets.filter((p) => p !== id)
    : [...selection.presets, id];
  return { ...selection, presets };
}
