/**
 * Scores the live signal-merge rule and the story-threads rule against a
 * human-labelled CSV produced by sample-event-pairs.ts (after a person has
 * filled in the `label` column). Read-only: reads the labelled CSV and
 * pairs-key.json from disk, prints a report, writes nothing.
 *
 * Usage (from apps/backend):
 *   pnpm score:pairs apps/backend/.tmp/pairs-to-label.csv
 *   pnpm score:pairs <path-to-labelled.csv> <path-to-pairs-key.json>
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type LabelCategory = "positive" | "negative" | "dropped";

/** "same event"/"update" -> positive, "different" -> negative, everything else (including "cannot tell") -> dropped. */
export function categorizeLabel(raw: string): LabelCategory {
  const label = raw.trim().toLowerCase();
  if (label === "same event" || label === "update") return "positive";
  if (label === "different") return "negative";
  return "dropped";
}

/** Minimal RFC4180 parser: quoted fields, "" escapes a literal quote, commas/newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export type LabelledRow = {
  pairId: string;
  aTitle: string;
  bTitle: string;
  rawLabel: string;
  category: LabelCategory;
};

export function loadLabelledRows(csvText: string): LabelledRow[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];
  const header = rows[0]!;
  const idx = (name: string): number => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`labelled CSV is missing a "${name}" column`);
    return i;
  };
  const pairIdx = idx("pair_id");
  const aTitleIdx = idx("A_title");
  const bTitleIdx = idx("B_title");
  const labelIdx = idx("label");
  return rows.slice(1).map((r) => {
    const rawLabel = r[labelIdx] ?? "";
    return {
      pairId: r[pairIdx] ?? "",
      aTitle: r[aTitleIdx] ?? "",
      bTitle: r[bTitleIdx] ?? "",
      rawLabel,
      category: categorizeLabel(rawLabel),
    };
  });
}

export type KeyEntry = {
  stratum: string;
  signalIds: [string, string];
  summaryJaccard: number;
  titleJaccard: number;
  embeddingCosine: number;
  eventCategoryEqual: boolean;
  countryEqual: boolean;
  sharedAsset: boolean;
  liveMergeJoins: boolean;
  storyThreadsJoins: boolean;
};

export type KeyFile = Record<string, KeyEntry>;

export type ScoredPair = LabelledRow & KeyEntry;

export function joinWithKey(rows: LabelledRow[], key: KeyFile): { scored: ScoredPair[]; missingKeys: string[] } {
  const scored: ScoredPair[] = [];
  const missingKeys: string[] = [];
  for (const row of rows) {
    const entry = key[row.pairId];
    if (!entry) {
      missingKeys.push(row.pairId);
      continue;
    }
    scored.push({ ...row, ...entry });
  }
  return { scored, missingKeys };
}

export type WilsonInterval = { estimate: number; low: number; high: number };

/** Wilson 95% score interval (z=1.96) for successes/n. n=0 returns a degenerate 0/0/0 interval. */
export function wilson95(successes: number, n: number): WilsonInterval {
  if (n === 0) return { estimate: 0, low: 0, high: 0 };
  const z = 1.96;
  const z2 = z * z;
  const phat = successes / n;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return { estimate: phat, low: (center - margin) / denom, high: (center + margin) / denom };
}

export type RuleField = "liveMergeJoins" | "storyThreadsJoins";

export type Confusion = { trueMerge: number; falseMerge: number; falseSplit: number; trueKeep: number };

export function confusionForRule(scored: ScoredPair[], ruleField: RuleField): Confusion {
  const c: Confusion = { trueMerge: 0, falseMerge: 0, falseSplit: 0, trueKeep: 0 };
  for (const p of scored) {
    if (p.category === "dropped") continue;
    const predicted = p[ruleField];
    const actual = p.category === "positive";
    if (predicted && actual) c.trueMerge++;
    else if (predicted && !actual) c.falseMerge++;
    else if (!predicted && actual) c.falseSplit++;
    else c.trueKeep++;
  }
  return c;
}

export function ruleDisagreements(scored: ScoredPair[], ruleField: RuleField): ScoredPair[] {
  return scored.filter((p) => {
    if (p.category === "dropped") return false;
    const predicted = p[ruleField];
    const actual = p.category === "positive";
    return predicted !== actual;
  });
}

export type ScoreField = "embeddingCosine" | "summaryJaccard" | "titleJaccard";

export type CutoffRow = { cutoff: number; falseMerge: number; falseSplit: number };

/** For every distinct score value present (either class), the false-merge/false-split counts a ">= cutoff means join" rule would produce. No cutoff is recommended by this function. */
export function cutoffTable(scored: ScoredPair[], field: ScoreField): CutoffRow[] {
  const usable = scored.filter((p) => p.category !== "dropped");
  const cutoffs = [...new Set(usable.map((p) => p[field]))].sort((a, b) => a - b);
  return cutoffs.map((cutoff) => {
    let falseMerge = 0;
    let falseSplit = 0;
    for (const p of usable) {
      const predicted = p[field] >= cutoff;
      const actual = p.category === "positive";
      if (predicted && !actual) falseMerge++;
      if (!predicted && actual) falseSplit++;
    }
    return { cutoff, falseMerge, falseSplit };
  });
}

export function sortedScores(scored: ScoredPair[], field: ScoreField): { positives: number[]; negatives: number[] } {
  const positives = scored.filter((p) => p.category === "positive").map((p) => p[field]).sort((a, b) => a - b);
  const negatives = scored.filter((p) => p.category === "negative").map((p) => p[field]).sort((a, b) => a - b);
  return { positives, negatives };
}

const DESCRIPTIVE_SENTENCE = "Descriptive counts on a small labelled sample; not a validation of any rule.";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function printRuleReport(label: string, scored: ScoredPair[], ruleField: RuleField) {
  const c = confusionForRule(scored, ruleField);
  const negatives = c.falseMerge + c.trueKeep;
  const positives = c.falseSplit + c.trueMerge;
  const falseMergeRate = wilson95(c.falseMerge, negatives);
  const falseSplitRate = wilson95(c.falseSplit, positives);
  console.log(`\n-- ${label} --`);
  console.log(
    `confusion: true_merge=${c.trueMerge} false_merge=${c.falseMerge} false_split=${c.falseSplit} true_keep=${c.trueKeep}`,
  );
  console.log(
    `false-merge rate among negatives: ${pct(falseMergeRate.estimate)} (${c.falseMerge}/${negatives}), ` +
      `95% CI [${pct(falseMergeRate.low)}, ${pct(falseMergeRate.high)}]`,
  );
  console.log(
    `false-split rate among positives: ${pct(falseSplitRate.estimate)} (${c.falseSplit}/${positives}), ` +
      `95% CI [${pct(falseSplitRate.low)}, ${pct(falseSplitRate.high)}]`,
  );
}

function printScoreReport(scored: ScoredPair[], field: ScoreField, label: string) {
  const { positives, negatives } = sortedScores(scored, field);
  console.log(`\n-- ${label} --`);
  console.log(`positives (${positives.length}): ${positives.map((n) => n.toFixed(4)).join(", ") || "(none)"}`);
  console.log(`negatives (${negatives.length}): ${negatives.map((n) => n.toFixed(4)).join(", ") || "(none)"}`);
  const table = cutoffTable(scored, field);
  console.log(`cutoff (>= means "would join")  false_merge  false_split`);
  for (const row of table) {
    console.log(`  ${row.cutoff.toFixed(4)}                      ${row.falseMerge}            ${row.falseSplit}`);
  }
  console.log(DESCRIPTIVE_SENTENCE);
}

export function runScoring(csvText: string, keyJsonText: string) {
  const rows = loadLabelledRows(csvText);
  const key = JSON.parse(keyJsonText) as KeyFile;
  const { scored, missingKeys } = joinWithKey(rows, key);

  const positive = scored.filter((p) => p.category === "positive").length;
  const negative = scored.filter((p) => p.category === "negative").length;
  const dropped = scored.filter((p) => p.category === "dropped").length;

  return { rows, scored, missingKeys, counts: { n: scored.length, positive, negative, dropped } };
}

function main() {
  const [csvPath, keyPathArg] = process.argv.slice(2);
  if (!csvPath) {
    console.error("[score:pairs] usage: pnpm score:pairs <labelled.csv> [pairs-key.json]");
    process.exit(1);
  }
  const keyPath = keyPathArg ?? join(dirname(csvPath), "pairs-key.json");

  const csvText = readFileSync(csvPath, "utf8");
  const keyJsonText = readFileSync(keyPath, "utf8");
  const { scored, missingKeys, counts } = runScoring(csvText, keyJsonText);

  console.log(`[score:pairs] csv=${csvPath} key=${keyPath}`);
  if (missingKeys.length > 0) {
    console.log(`[score:pairs] WARNING: ${missingKeys.length} CSV row(s) had no matching key entry, excluded: ${missingKeys.join(", ")}`);
  }
  console.log(
    `\n1. n_pairs=${counts.n} n_positive=${counts.positive} n_negative=${counts.negative} n_dropped=${counts.dropped} ("cannot tell" or unrecognized label)`,
  );

  console.log(`\n2. Rule confusion vs. labels`);
  printRuleReport("live merge rule (signal-merge.ts)", scored, "liveMergeJoins");
  printRuleReport("story-threads rule (story-threads.ts)", scored, "storyThreadsJoins");

  console.log(`\n3. Score distributions and per-cutoff false-merge/false-split counts`);
  printScoreReport(scored, "embeddingCosine", "embedding cosine");
  printScoreReport(scored, "summaryJaccard", "summary Jaccard (tokenize())");
  printScoreReport(scored, "titleJaccard", "title Jaccard (tokenize())");

  console.log(`\n4. Pairs where the live merge rule disagrees with the label`);
  const disagreements = ruleDisagreements(scored, "liveMergeJoins");
  if (disagreements.length === 0) {
    console.log("  (none)");
  }
  for (const p of disagreements) {
    const kind = p.liveMergeJoins ? "false_merge (rule joins, labelled different)" : "false_split (rule keeps apart, labelled same/update)";
    console.log(`  ${p.pairId} [${kind}] label="${p.rawLabel}"`);
    console.log(`    A: ${p.aTitle}`);
    console.log(`    B: ${p.bTitle}`);
  }
}

function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /[/\\]score-event-pairs\.(ts|js)$/.test(entry);
}

if (isEntrypoint()) {
  main();
}
