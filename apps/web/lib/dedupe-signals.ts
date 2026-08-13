import type { Signal } from "@blue-beacon-research/shared";

function titleKey(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Collapse duplicate headlines (same story from RSS + GNews + GDELT). Keeps highest severity, preserves API sort order. */
export function dedupeSignalsByTitle(signals: Signal[]): Signal[] {
  const bestByTitle = new Map<string, Signal>();

  for (const signal of signals) {
    const key = titleKey(signal.title);
    const existing = bestByTitle.get(key);
    if (!existing || signal.severity > existing.severity) {
      bestByTitle.set(key, signal);
    }
  }

  const seen = new Set<string>();
  const result: Signal[] = [];

  for (const signal of signals) {
    const key = titleKey(signal.title);
    if (seen.has(key)) continue;
    const winner = bestByTitle.get(key);
    if (winner) {
      result.push(winner);
      seen.add(key);
    }
  }

  return result;
}
