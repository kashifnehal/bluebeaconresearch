/**
 * Replays the materiality gate against raw_events rows it already judged,
 * using today's prompt construction and the real similar-signal hint — to
 * measure (1) how many past rejects would now pass, (2) reject answer length
 * in output tokens, (3) real cost per call, and (4) with --count-prefix, the
 * token count of the prompt's fixed (non-article) part for future caching work.
 *
 * Does NOT call ClaudeService.classifyEvent() directly: that function records
 * usage into the live "ingestion" Anthropic budget bucket and is itself gated
 * by that bucket's current state, either of which would corrupt this replay.
 * Instead the prompt construction in classifyEvent() (system text, watchlist
 * block, materiality-gate instruction, JSON schema, article fields) is
 * reproduced below from a read of apps/backend/src/services/claude.service.ts
 * — keep the two in sync by hand if that prompt changes.
 *
 * Never writes to signals, raw_events, or any other production table — reads
 * only. No Anthropic usage from this script is recorded against any budget
 * bucket.
 *
 * Usage (from apps/backend):
 *   pnpm replay:gate                  # live replay, real Claude calls
 *   pnpm replay:gate --limit 50       # cap row count (default 150)
 *   pnpm replay:gate --dry            # preview 3 rows + prompt, no Anthropic calls
 *   pnpm replay:gate --count-prefix   # token-count the fixed prompt overhead, exit
 */
import { writeFileSync } from "node:fs";
import { Anthropic } from "@anthropic-ai/sdk";
import { COMMODITY_REGISTRY } from "../lib/commodity-registry.js";
import { getEnv } from "../env.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { estimateCostUsd } from "../lib/anthropic-budget.js";
import {
  getActiveWatchlist,
  formatWatchlistPromptBlock,
} from "../lib/media-impact-watchlist.js";

// Derived from the registry instead of hand-listed — keeps this hand-reproduced
// prompt (see file header) in sync with classifyEvent()'s asset list without a
// manual edit here on every new commodity.
const COMMODITY_ASSET_PROMPT_OPTIONS = COMMODITY_REGISTRY.map((c) => `"${c.symbol}"`).join("|");

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

// Must match HAIKU_MODEL in claude.service.ts.
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HARD_STOP_USD = 1.5;
const RANGE_START = "2026-10-05T00:00:00.000Z";
const RANGE_END = "2026-10-07T00:00:00.000Z"; // covers both 2026-10-05 and 2026-10-06 UTC
const OUTPUT_PATH = new URL("../../replay-gate-output.json", import.meta.url).pathname;

// Exact copy of MATERIALITY_GATE_INSTRUCTION from claude.service.ts (not
// exported there — classifyEvent() is intentionally not called from this
// script, see header comment, so the string is reproduced rather than
// imported).
const MATERIALITY_GATE_INSTRUCTION =
  `Ask yourself: taking this story's own reported claims at face value — you are not being asked to judge whether they are true or will come to pass, only to assess what they would mean for a market if they hold — is there a substantial likelihood that a commodity trader, an import/export business, or a fund analyst would consider this important enough to change a decision they're about to make? This is BBR's own materiality principle, inspired by (not literally applying) the reasonable-investor standard used in US securities law for 50 years. Answer "pass" only if: (a) the story contains genuinely new information (a fact, a claim, a statement, a data release) rather than only reminding the reader of a previously-known, already-public schedule or date with nothing new added, AND (b) it clears ONE of: a real, stated market mechanism exists (marketMechanism is non-null and directly supported by the story), OR the story names an entity on BBR's watchlist below, OR it is a genuine armed-conflict/security event with plausible commodity relevance even without a fully worked-out mechanism yet. Do NOT weigh this decision by how likely you think the underlying event is to actually happen or turn out to be true — BBR is not in the business of predicting outcomes, only of assessing the market impact of what has actually been reported, and getting that assessment out fast, before the market has fully reacted. A story reporting a new, sourced, but unconfirmed claim (e.g. "sources say...") should pass exactly the same way a confirmed official statement would, if it clears (a) and (b) above — mark its sourcing strength separately in sourceConfirmation, don't use it to gate the story out. When sourceConfirmation is "reported" or "speculative," note in materialityReasoning that unconfirmed claims of this kind have historically produced smaller, shorter-lived market reactions than a confirmed release of the same category (per BBR's own research base) — this informs how the story's expected magnitude should be read, it does not reduce the likelihood of it passing this gate. General finance/earnings/corporate news with no commodity, currency, or watchlist-entity connection should NOT pass, regardless of how large the company or number involved is. When you reject a story, say specifically why in materialityReasoning — which criterion it failed — not just "not important."`;

type RawEventRow = {
  id: string;
  title: string | null;
  summary: string | null;
  country: string | null;
  event_type: string | null;
  event_date: string | null;
  created_at: string;
  raw_data: Record<string, unknown> | null;
  materiality_checked_at: string | null;
};

type OutputRow = {
  id: string;
  title: string | null;
  feed: string;
  oldReason: string | null;
  oldReasonMentionsHint: boolean;
  newVerdict: "pass" | "reject" | "error";
  newReason: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const countPrefix = args.includes("--count-prefix");
  const idx = args.findIndex((a) => a === "--limit" || a.startsWith("--limit="));
  let limit = 150;
  if (idx !== -1) {
    const raw = args[idx].includes("=") ? args[idx].split("=")[1] : args[idx + 1];
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) limit = n;
  }
  return { dryRun, countPrefix, limit };
}

async function fetchCandidateRows(
  supabase: SupabaseAdmin,
): Promise<RawEventRow[]> {
  const pageSize = 1000;
  const rows: RawEventRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("raw_events")
      .select(
        "id, title, summary, country, event_type, event_date, created_at, raw_data, materiality_checked_at",
      )
      .not("materiality_checked_at", "is", null)
      .gte("created_at", RANGE_START)
      .lt("created_at", RANGE_END)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`raw_events select failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as RawEventRow[]));
    if (data.length < pageSize) break;
  }
  return rows;
}

/**
 * Mirrors reconciliation.ts's raw_event_ids overlap check, batched (its
 * BATCH_LIMIT=200) — a single `.overlaps()` call with all ~1000 candidate
 * ids in this date range overflows the request URL (confirmed: one-shot
 * call 400s).
 */
async function filterUncoveredBySignal(
  supabase: SupabaseAdmin,
  rows: RawEventRow[],
): Promise<RawEventRow[]> {
  if (rows.length === 0) return rows;
  const BATCH_SIZE = 200;
  const covered = new Set<string>();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batchIds = rows.slice(i, i + BATCH_SIZE).map((r) => r.id);
    const { data, error } = await supabase
      .from("signals")
      .select("raw_event_ids")
      .overlaps("raw_event_ids", batchIds);
    if (error) throw new Error(`signals overlap check failed: ${error.message}`);
    for (const s of (data ?? []) as { raw_event_ids: string[] | null }[]) {
      for (const id of s.raw_event_ids ?? []) covered.add(id);
    }
  }
  return rows.filter((r) => !covered.has(r.id));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Same query as lib/novelty-hint.ts's hasSimilarRecentSignal(), but anchored
 * to the row's own created_at ("asOf") instead of the live wall clock — per
 * the task spec, a historical replay must not count signals that didn't
 * exist yet at the time this row was originally classified.
 */
async function hasSimilarRecentSignalAsOf(
  supabase: SupabaseAdmin,
  params: { country: string | null; eventType: string | null; asOf: string },
): Promise<boolean> {
  const { country, eventType, asOf } = params;
  if (!country && !eventType) return false;
  const cutoff = new Date(new Date(asOf).getTime() - 48 * 3_600_000).toISOString();
  let query = supabase
    .from("signals")
    .select("id", { count: "exact", head: true })
    .gte("created_at", cutoff)
    .lt("created_at", asOf);
  if (country) query = query.eq("country", country);
  if (eventType) query = query.eq("event_type", eventType);
  const { count, error } = await query;
  if (error) {
    console.warn("[replay-gate] hasSimilarRecentSignalAsOf query failed:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

type OldRejection = { title: string; reasoning: string };

function parseRejectionDetail(detail: string): OldRejection | null {
  const m = /^title="([\s\S]*)" source=\S+ method=\S+ reasoning="([\s\S]*)"$/.exec(detail);
  if (!m) return null;
  return { title: m[1], reasoning: m[2] };
}

async function fetchOldRejections(supabase: SupabaseAdmin): Promise<OldRejection[]> {
  // Buffered window: a row's rejection could have been logged by a collector
  // run shortly before/after its own created_at, not necessarily inside the
  // exact 2026-10-05..06 window.
  const bufferedStart = new Date(new Date(RANGE_START).getTime() - 24 * 3_600_000).toISOString();
  const bufferedEnd = new Date(new Date(RANGE_END).getTime() + 24 * 3_600_000).toISOString();
  const out: OldRejection[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("service_health_events")
      .select("detail")
      .eq("service", "materiality_gate")
      .eq("status", "rejected")
      .gte("created_at", bufferedStart)
      .lt("created_at", bufferedEnd)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`service_health_events select failed: ${error.message}`);
    if (!data?.length) break;
    for (const row of data as { detail: string | null }[]) {
      const parsed = parseRejectionDetail(String(row.detail ?? ""));
      if (parsed) out.push(parsed);
    }
    if (data.length < pageSize) break;
  }
  return out;
}

function findOldReason(title: string | null, oldRejections: OldRejection[]): string | null {
  if (!title) return null;
  const truncated = title.slice(0, 200);
  return oldRejections.find((r) => r.title === truncated)?.reasoning ?? null;
}

function mentionsHint(reason: string | null): boolean {
  if (!reason) return false;
  return /48[\s-]?hour|similar story/i.test(reason);
}

/** Reproduces classifyEvent()'s system/user prompt construction exactly. */
function buildPrompt(params: {
  title: string;
  country: string;
  eventType: string;
  eventDate: string;
  similarStoryLast48h: boolean;
  watchlistBlock: string;
}): { system: string; user: string } {
  const { title, country, eventType, eventDate, similarStoryLast48h, watchlistBlock } = params;
  const system =
    "You are a senior geopolitical risk analyst for Blue Beacon Research (BBR), a geopolitical " +
    "intelligence platform for commodity traders, import/export businesses, and fund analysts. " +
    "Classify this news event for financial market impact, and apply BBR's materiality gate " +
    "(instructions below) to decide whether it should become a market signal at all.";
  const user =
    `Event: ${title}\n` +
    `Country: ${country}\n` +
    `Type: ${eventType}\n` +
    `Date: ${eventDate}\n` +
    `A similar-looking story (same country/event-type combination) was already logged in the ` +
    `last 48 hours: ${similarStoryLast48h ? "yes" : "no"} (a coarse hint, not a verdict — weigh it, ` +
    `don't rely on it alone for novelty).\n\n` +
    `BBR's watchlist of individuals/institutions with a real, sourced history of moving markets ` +
    `through their own statements (relevant to materialityPass criterion (b) and to sourceConfirmation):\n` +
    `${watchlistBlock}\n\n` +
    `MATERIALITY GATE: ${MATERIALITY_GATE_INSTRUCTION}\n\n` +
    `Return ONLY valid JSON (no markdown):\n` +
    `{\n` +
    `  "severity": integer between 1 and 10,\n` +
    `  "confidence": a float between 0.0 and 1.0 representing certainty,\n` +
    `  "commodityImpacts": [{ "asset": one of exactly ${COMMODITY_ASSET_PROMPT_OPTIONS} (ticker symbols only, omit any commodity/asset that doesn't map to one of these), "direction": "up"|"down"|"volatile"|"neutral", "confidence": number }],\n` +
    `  "currencyPairImpacts": [{ "asset": one of exactly "EURUSD"|"GBPUSD"|"USDJPY"|"USDCHF"|"USDRUB"|"USDCNY"|"USDINR" (currency-pair symbols only, omit any pair that doesn't map to one of these), "direction": "up"|"down"|"volatile"|"neutral", "confidence": number }],\n` +
    `  "isBreaking": boolean,\n` +
    `  "title": a short English title (max ~80 chars) in plain language a commodity trader would read naturally — active voice, no unexplained jargon, no stiff or overly literal translated phrasing. If the source article is in English, lightly tighten its own title rather than rewriting it; if the source is in another language, write a natural English title conveying the same news, not a word-for-word translation.,\n` +
    `  "summary": string (max 120 chars),\n` +
    `  "region": string,\n` +
    `  "country": the specific country where this event physically happened, based on reading the article — a real country name (e.g. "Iran", "Ukraine"), never a region bucket or the name of the outlet/publication reporting it. Return null if the article's own text genuinely doesn't make the location clear.,\n` +
    `  "relevance": a float 0.0-1.0 — how central is the named commodity/currency/entity/geography to what actually happened in this story (not just mentioned in passing)? A story about "World Trade Center" mentioning "trade" in the name only should score near 0; a story where a named commodity is the actual subject of the event should score high.,\n` +
    `  "novelty": a float 0.0-1.0 — does this story contain information a market participant would not already know? Score LOW (near 0) for a story that only reminds the reader of an already-public, previously-known schedule, date, or routine recurring event, with no new claim, statement, or data attached (e.g. "the Fed meets next Wednesday," "USDA releases its report on the 12th," with nothing else reported). Score HIGH for a story that reports a new fact, statement, data point, or claim — including an unconfirmed or rumored one — that a reader could not already have known. Do not score this based on whether the underlying event has already happened or is confirmed — an unconfirmed but newly-reported claim about a future event scores HIGH on novelty; a reminder about a known future event scores LOW, regardless of how big that event will be.,\n` +
    `  "eventCategory": one of exactly "armed_conflict_security"|"supply_disruption_logistics"|"sanctions_trade_policy"|"production_output_decision"|"central_bank_monetary_policy"|"scheduled_economic_data"|"official_statement_commentary"|"elections_political_transition"|"other_market_relevant",\n` +
    `  "marketMechanism": a short string (max ~140 chars) explaining, in plain language, how this event could plausibly reach a commodity, currency, or broad market — or null if no real mechanism exists. Do not invent a mechanism that isn't actually supported by the story's own content.,\n` +
    `  "isPreview": boolean — true ONLY if this story exclusively reminds the reader of a previously-known, already-scheduled event or date, with no new claim, statement, or data attached (a pure "week ahead" or "don't forget, X happens on date Y" story). False for any story that reports a new fact, statement, or claim — even an unconfirmed one — about an event that hasn't happened yet. A scheduled event's actual release/decision is always false. Most stories about a not-yet-happened event will be false here; true is reserved for the narrow, information-free reminder case.,\n` +
    `  "sourceConfirmation": one of exactly "official"|"reported"|"speculative". "official" — a named official, institution, or government body making a direct, on-the-record statement, or an actual official release/decision. "reported" — a sourced claim attributed to named or unnamed sources ("sources say," "people familiar with the matter," a named outlet's own original reporting of a claim). "speculative" — commentary, analysis, or opinion guessing about a possible future event with no sourced claim behind it. Base this only on what the article itself states about its own sourcing — do not use this field to judge whether the claim is true, only what kind of claim it is.,\n` +
    `  "materialityPass": boolean — the outcome of the MATERIALITY GATE instruction above,\n` +
    `  "materialityReasoning": a short string (max ~200 chars) explaining the decision in plain language — which specific criterion passed or failed, not just "not important",\n` +
    `  "mediaImpactEntity": the matched entity_name string from BBR's watchlist above if this story's statement or commentary is attributable to one of those entities, or null if not applicable. Return the exact entity_name from the list (never an alias, never a name that is not on the list). This field describes a sourced historical reaction pattern; it is not a forecast and not a trading recommendation.,\n` +
    `  "invalidationCondition": a single plain-language sentence naming the SPECIFIC fact this story reports that, if it turned out to be false, unconfirmed, or different, would undercut this event's market-impact assessment — grounded in a concrete claim the article itself makes (e.g. "if the reported drone strike on the refinery is not independently confirmed by a second source" or "if the ministry's denial of the ceasefire breach is verified"). Not a generic disclaimer ("if new information emerges") and not a probability or confidence score — name the actual fact at stake. Null only if the story makes no falsifiable factual claim to hang this on.\n` +
    `}`;
  return { system, user };
}

async function classifyRow(
  client: Anthropic,
  prompt: { system: string; user: string },
): Promise<{
  materialityPass: boolean;
  materialityReasoning: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const msg = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 900,
    temperature: 0.2,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });
  const text = msg.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  const raw = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
  const parsed = JSON.parse(raw) as {
    materialityPass?: unknown;
    materialityReasoning?: unknown;
  };
  const materialityPass = parsed.materialityPass === true;
  const materialityReasoning =
    typeof parsed.materialityReasoning === "string" && parsed.materialityReasoning.trim()
      ? parsed.materialityReasoning.trim().slice(0, 500)
      : materialityPass
        ? "claude: passed materiality gate (no reasoning text returned)"
        : "claude: failed materiality gate (no reasoning text returned)";
  return {
    materialityPass,
    materialityReasoning,
    inputTokens: msg.usage?.input_tokens ?? 0,
    outputTokens: msg.usage?.output_tokens ?? 0,
  };
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  const { dryRun, countPrefix, limit } = parseArgs();
  const env = getEnv();
  const supabase = getSupabaseAdmin();

  if (countPrefix) {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for --count-prefix");
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const watchlistBlock = formatWatchlistPromptBlock(await getActiveWatchlist());
    const prompt = buildPrompt({
      title: "",
      country: "",
      eventType: "",
      eventDate: "",
      similarStoryLast48h: false,
      watchlistBlock,
    });
    const counted = await client.messages.countTokens({
      model: HAIKU_MODEL,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    console.log(`[replay-gate] --count-prefix model=${HAIKU_MODEL} fixed_prompt_tokens=${counted.input_tokens}`);
    console.log(
      "[replay-gate] billing: per Anthropic's Token Counting docs (\"Pricing and rate limits\"), " +
        "\"Token counting is free to use\" — this count_tokens call is not billed; it has its own " +
        "RPM limit, separate from message-creation limits.",
    );
    return;
  }

  const candidates = await fetchCandidateRows(supabase);
  const uncovered = await filterUncoveredBySignal(supabase, candidates);
  const selected = shuffle(uncovered).slice(0, limit);

  console.log(
    `[replay-gate] candidates=${candidates.length} uncovered=${uncovered.length} selected=${selected.length} limit=${limit}`,
  );

  if (dryRun) {
    const watchlistBlock = formatWatchlistPromptBlock(await getActiveWatchlist());
    for (const row of selected.slice(0, 3)) {
      const similarStoryLast48h = await hasSimilarRecentSignalAsOf(supabase, {
        country: row.country,
        eventType: row.event_type,
        asOf: row.created_at,
      });
      const prompt = buildPrompt({
        title: row.title ?? "New geopolitical event",
        country: String(row.country ?? ""),
        eventType: String(row.event_type ?? ""),
        eventDate: String(row.event_date ?? ""),
        similarStoryLast48h,
        watchlistBlock,
      });
      console.log("----");
      console.log(`id=${row.id} title=${row.title}`);
      console.log("SYSTEM:\n" + prompt.system);
      console.log("USER:\n" + prompt.user);
    }
    return;
  }

  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for a live replay run");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const watchlistBlock = formatWatchlistPromptBlock(await getActiveWatchlist());
  const oldRejections = await fetchOldRejections(supabase);

  const results: OutputRow[] = [];
  let runningCost = 0;
  let stoppedEarly = false;

  for (const row of selected) {
    if (runningCost >= HARD_STOP_USD) {
      stoppedEarly = true;
      console.log(`[replay-gate] hard stop: running cost $${runningCost.toFixed(4)} >= $${HARD_STOP_USD}`);
      break;
    }

    const feed = String((row.raw_data as { source?: string } | null)?.source ?? "unknown");
    const oldReason = findOldReason(row.title, oldRejections);
    const oldReasonMentionsHint = mentionsHint(oldReason);

    try {
      const similarStoryLast48h = await hasSimilarRecentSignalAsOf(supabase, {
        country: row.country,
        eventType: row.event_type,
        asOf: row.created_at,
      });
      const prompt = buildPrompt({
        title: row.title ?? "New geopolitical event",
        country: String(row.country ?? ""),
        eventType: String(row.event_type ?? ""),
        eventDate: String(row.event_date ?? ""),
        similarStoryLast48h,
        watchlistBlock,
      });
      const { materialityPass, materialityReasoning, inputTokens, outputTokens } =
        await classifyRow(client, prompt);
      const costUsd = estimateCostUsd(HAIKU_MODEL, inputTokens, outputTokens);
      runningCost += costUsd;

      const result: OutputRow = {
        id: row.id,
        title: row.title,
        feed,
        oldReason,
        oldReasonMentionsHint,
        newVerdict: materialityPass ? "pass" : "reject",
        newReason: materialityReasoning,
        inputTokens,
        outputTokens,
        costUsd,
      };
      results.push(result);
      console.log(
        `[replay-gate] id=${row.id} feed=${feed} old_reject=${oldReason ? "yes" : "no"} ` +
          `new=${result.newVerdict} in=${inputTokens} out=${outputTokens} cost=$${costUsd.toFixed(6)} running=$${runningCost.toFixed(4)}`,
      );
    } catch (err) {
      console.error(`[replay-gate] ERROR id=${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        id: row.id,
        title: row.title,
        feed,
        oldReason,
        oldReasonMentionsHint,
        newVerdict: "error",
        newReason: err instanceof Error ? err.message : String(err),
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      });
    }
  }

  const flips = results.filter((r) => r.newVerdict === "pass");
  const stillReject = results.filter((r) => r.newVerdict === "reject");
  const errors = results.filter((r) => r.newVerdict === "error");
  const rejectOutputTokens = stillReject.map((r) => r.outputTokens);
  const flipsByFeed: Record<string, number> = {};
  for (const r of flips) flipsByFeed[r.feed] = (flipsByFeed[r.feed] ?? 0) + 1;

  const summary = {
    rows: results.length,
    flipsToPass: flips.length,
    stillReject: stillReject.length,
    errors: errors.length,
    meanOutputTokensForRejects: mean(rejectOutputTokens),
    medianOutputTokensForRejects: median(rejectOutputTokens),
    meanCostPerCallUsd: mean(results.map((r) => r.costUsd)),
    totalCostUsd: results.reduce((a, r) => a + r.costUsd, 0),
    flipsByFeed,
    stoppedEarlyOnCostCap: stoppedEarly,
  };

  console.log("[replay-gate] SUMMARY", JSON.stringify(summary, null, 2));
  writeFileSync(OUTPUT_PATH, JSON.stringify({ rows: results, summary }, null, 2));
  console.log(`[replay-gate] wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("[replay-gate] fatal:", err);
  process.exit(1);
});
