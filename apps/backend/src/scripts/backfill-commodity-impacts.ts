/**
 * One-time #53 backfill — fill historical signals.commodity_impacts.
 *
 * Reuses ClaudeService.classifyEvent() (claude-haiku-4-5-20251001), the same
 * function the live rss/gnews/gdelt/acled/reconciliation insert paths call.
 * Writes ONLY commodity_impacts. Does not change the live classification
 * pipeline, and does not rewrite severity/summary/region/currency_pair_impacts.
 *
 * Idempotent: skips rows that already have a non-empty commodity_impacts, and
 * skips IDs recorded in the local checkpoint (including Haiku-classified-as-
 * empty, which would otherwise match the empty SELECT forever).
 *
 * Usage (from apps/backend):
 *   pnpm backfill:commodity-impacts
 *   DRY_RUN=1 pnpm backfill:commodity-impacts
 *   LIMIT=3 pnpm backfill:commodity-impacts
 *   ONLY_IDS=uuid,uuid pnpm backfill:commodity-impacts
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Anthropic } from "@anthropic-ai/sdk";
import { getEnv } from "../env.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { ClaudeService } from "../services/claude.service.js";

const CHECKPOINT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  ".backfill-commodity-impacts-checkpoint.json",
);

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_INPUT_PER_MTOK = 1.0;
const HAIKU_OUTPUT_PER_MTOK = 5.0;
const DEFAULT_CONCURRENCY = 5;
const MIN_SPACING_MS = 200;
const PROGRESS_EVERY = 25;
const FALLBACK_RE = /Using intelligent heuristic fallback classifier/;
const CREDIT_RE = /credit balance is too low/;
const fallbackStore = new AsyncLocalStorage<{ saw: boolean; message: string }>();

type SignalRow = {
  id: string;
  title: string | null;
  summary: string | null;
  country: string | null;
  event_type: string | null;
  event_date: string | null;
  created_at: string;
  commodity_impacts: unknown;
};

type Checkpoint = {
  processedIds: string[];
  filled: number;
  classifiedEmpty: number;
  errors: number;
};

function isEmptyImpacts(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "string" && (value === "[]" || value === "null")) return true;
  return false;
}

function loadCheckpoint(): Checkpoint {
  if (!existsSync(CHECKPOINT_PATH)) {
    return { processedIds: [], filled: 0, classifiedEmpty: 0, errors: 0 };
  }
  const parsed = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf8")) as Checkpoint;
  return {
    processedIds: parsed.processedIds ?? [],
    filled: parsed.filled ?? 0,
    classifiedEmpty: parsed.classifiedEmpty ?? 0,
    errors: parsed.errors ?? 0,
  };
}

function saveCheckpoint(checkpoint: Checkpoint) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchEmptySignals(): Promise<SignalRow[]> {
  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  const rows: SignalRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("signals")
      .select(
        "id,title,summary,country,event_type,event_date,created_at,commodity_impacts",
      )
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`signals select failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as SignalRow[]));
    if (data.length < pageSize) break;
  }
  return rows.filter((row) => isEmptyImpacts(row.commodity_impacts));
}

function classificationPrompt(row: SignalRow) {
  const system =
    "You are a senior geopolitical risk analyst. Classify this news event for financial market impact.";
  const user =
    `Event: ${String(row.title ?? "New geopolitical event")}\n` +
    `Country: ${String(row.country ?? "")}\n` +
    `Type: ${String(row.event_type ?? "")}\n` +
    `Date: ${String(row.event_date ?? "")}\n\n` +
    `Return ONLY valid JSON (no markdown):\n` +
    `{\n` +
    `  "severity": integer between 1 and 10,\n` +
    `  "confidence": a float between 0.0 and 1.0 representing certainty,\n` +
    `  "commodityImpacts": [{ "asset": one of exactly "USOIL"|"UKOIL"|"NGAS"|"XAUUSD"|"WHEAT"|"CORN" (ticker symbols only, omit any commodity/asset that doesn't map to one of these), "direction": "up"|"down"|"volatile"|"neutral", "confidence": number }],\n` +
    `  "currencyPairImpacts": [{ "asset": one of exactly "EURUSD"|"GBPUSD"|"USDJPY"|"USDCHF"|"USDRUB"|"USDCNY" (currency-pair symbols only, omit any pair that doesn't map to one of these), "direction": "up"|"down"|"volatile"|"neutral", "confidence": number }],\n` +
    `  "isBreaking": boolean,\n` +
    `  "summary": string (max 120 chars),\n` +
    `  "region": string\n` +
    `}`;
  return { system, user };
}

async function quoteCostAndLimits(
  apiKey: string,
  sample: SignalRow,
  remaining: number,
) {
  const client = new Anthropic({ apiKey });
  const { system, user } = classificationPrompt(sample);
  const counted = await client.messages.countTokens({
    model: HAIKU_MODEL,
    system,
    messages: [{ role: "user", content: user }],
  });
  const { data, response } = await client.messages
    .create({
      model: HAIKU_MODEL,
      max_tokens: 20,
      messages: [{ role: "user", content: "Reply with the single word pong." }],
    })
    .withResponse();

  const rpm = Number(response.headers.get("anthropic-ratelimit-requests-limit") ?? "0");
  const itpm = Number(
    response.headers.get("anthropic-ratelimit-input-tokens-limit") ?? "0",
  );
  const otpm = Number(
    response.headers.get("anthropic-ratelimit-output-tokens-limit") ?? "0",
  );

  const inputTok = counted.input_tokens;
  const outputLow = 80;
  const outputHigh = 200;
  const perRowLow =
    (inputTok / 1_000_000) * HAIKU_INPUT_PER_MTOK +
    (outputLow / 1_000_000) * HAIKU_OUTPUT_PER_MTOK;
  const perRowHigh =
    (inputTok / 1_000_000) * HAIKU_INPUT_PER_MTOK +
    (outputHigh / 1_000_000) * HAIKU_OUTPUT_PER_MTOK;

  console.log("[backfill] COST QUOTE (before any commodity_impacts writes)");
  console.log(`  model: ${HAIKU_MODEL} (${data.model})`);
  console.log(
    `  pricing: $${HAIKU_INPUT_PER_MTOK}/MTok in, $${HAIKU_OUTPUT_PER_MTOK}/MTok out (standard Messages API; Batch 50% off not used because this reuses classifyEvent())`,
  );
  console.log(
    `  measured input tokens (count_tokens on a real empty row): ${inputTok}`,
  );
  console.log(
    `  output assumption: ${outputLow} tok (empty JSON) – ${outputHigh} tok (prior 2026-09-09 measurement)`,
  );
  console.log(
    `  remaining rows: ${remaining} → $${(perRowLow * remaining).toFixed(2)} – $${(perRowHigh * remaining).toFixed(2)}`,
  );
  console.log(
    `  account Haiku limits (live response headers): ${rpm} RPM, ${itpm} ITPM, ${otpm} OTPM`,
  );
  console.log(
    `  script pace: ${DEFAULT_CONCURRENCY} in-flight classifyEvent() calls, ${MIN_SPACING_MS}ms launch stagger (~${Math.round((1000 / MIN_SPACING_MS) * DEFAULT_CONCURRENCY)} RPM ceiling) — well under the measured ${rpm} RPM (Scale-tier Haiku)`,
  );

  return { rpm, itpm, otpm };
}

function installFallbackProbe() {
  const origWarn = console.warn.bind(console);
  console.warn = ((...args: Parameters<typeof console.warn>) => {
    const text = String(args[0] ?? "");
    if (FALLBACK_RE.test(text)) {
      const slot = fallbackStore.getStore();
      if (slot) {
        slot.saw = true;
        slot.message = text;
      }
    }
    origWarn(...args);
  }) as typeof console.warn;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
) {
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await fn(items[index]);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
}

async function main() {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required; refusing to run heuristic-only backfill");
  }

  const dryRun = process.env.DRY_RUN === "1";
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  const onlyIds = process.env.ONLY_IDS
    ? new Set(process.env.ONLY_IDS.split(",").map((id) => id.trim()).filter(Boolean))
    : null;
  const concurrency = process.env.CONCURRENCY
    ? Number(process.env.CONCURRENCY)
    : DEFAULT_CONCURRENCY;
  const supabase = getSupabaseAdmin();
  const claude = new ClaudeService();
  const checkpoint = loadCheckpoint();
  const processed = new Set(checkpoint.processedIds);

  const empty = await fetchEmptySignals();
  let queued = empty.filter((row) => !processed.has(row.id));
  if (onlyIds) queued = queued.filter((row) => onlyIds.has(row.id));
  if (limit && Number.isFinite(limit)) queued = queued.slice(0, limit);

  console.log(
    `[backfill] empty=${empty.length} already_checkpointed=${processed.size} queued=${queued.length} dryRun=${dryRun} concurrency=${concurrency}`,
  );

  if (queued.length === 0) {
    console.log("[backfill] nothing to do");
    return;
  }

  await quoteCostAndLimits(env.ANTHROPIC_API_KEY, queued[0], queued.length);

  if (process.env.QUOTE_ONLY === "1") {
    console.log("[backfill] QUOTE_ONLY=1 — exiting before any classifyEvent/write");
    return;
  }

  let filled = 0;
  let classifiedEmpty = 0;
  let errors = 0;
  let done = 0;
  let stopReason: string | null = null;
  let checkpointChain = Promise.resolve();
  const persistCheckpoint = () => {
    checkpointChain = checkpointChain.then(() => {
      checkpoint.processedIds = [...processed];
      saveCheckpoint(checkpoint);
    });
    return checkpointChain;
  };

  installFallbackProbe();

  await mapPool(queued, concurrency, async (row) => {
    if (stopReason) return;
    await sleep(MIN_SPACING_MS);
    const slot = { saw: false, message: "" };
    try {
      const classification = await fallbackStore.run(slot, () =>
        claude.classifyEvent({
          id: row.id,
          title: row.title ?? "New geopolitical event",
          summary: row.summary ?? "",
          country: row.country,
          event_type: row.event_type,
          event_date: row.event_date,
        }),
      );

      if (slot.saw) {
        errors += 1;
        checkpoint.errors += 1;
        await persistCheckpoint();
        console.warn(
          `[backfill] SKIP ${row.id} — classifyEvent fell back to heuristic (not written)`,
        );
        if (CREDIT_RE.test(slot.message)) {
          stopReason = "anthropic_credit_exhausted";
          console.error(
            "[backfill] Anthropic credit exhausted — remaining rows left uncheckpointed for a later re-run",
          );
        }
      } else {
        const impacts = classification.commodityImpacts ?? [];
        if (impacts.length === 0) {
          classifiedEmpty += 1;
          if (!dryRun) {
            processed.add(row.id);
            checkpoint.classifiedEmpty += 1;
            await persistCheckpoint();
          }
        } else {
          if (!dryRun) {
            const { error } = await supabase
              .from("signals")
              .update({ commodity_impacts: impacts })
              .eq("id", row.id);
            if (error) throw new Error(error.message);
            processed.add(row.id);
            checkpoint.filled += 1;
            await persistCheckpoint();
          }
          filled += 1;
        }
      }
    } catch (err) {
      errors += 1;
      checkpoint.errors += 1;
      await persistCheckpoint();
      console.error(
        `[backfill] ERROR ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      done += 1;
      if (done % PROGRESS_EVERY === 0 || done === queued.length) {
        console.log(
          `[backfill] progress processed=${done}/${queued.length} filled=${filled} empty=${classifiedEmpty} errors=${errors}`,
        );
      }
    }
  });

  await checkpointChain;

  console.log(
    `[backfill] DONE queued=${queued.length} filled=${filled} classified_empty=${classifiedEmpty} errors=${errors} dryRun=${dryRun}${stopReason ? ` stop=${stopReason}` : ""}`,
  );
  if (stopReason === "anthropic_credit_exhausted") process.exitCode = 2;
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
