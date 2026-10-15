/**
 * Read-only news delay probe.
 *
 * poll (default): one search per fixed query for each vendor whose key is set.
 * New articles are appended to .probe-data/news-delay.jsonl. A vendor stops
 * at 90 requests on a UTC day.
 *
 * report: lag stats from that file, plus a read-only overlap with rss rows.
 *
 * No database writes. No Redis. No model calls. The only database access is
 * the report's select.
 */
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalUrl } from "../lib/external-id.js";

export const PROBE_QUERIES = ["oil OR crude", "Hormuz OR tanker"] as const;
export const DAILY_REQUEST_CAP = 90;
const PAGE_SIZE = 1000;

const probeDir = fileURLToPath(new URL("../../.probe-data/", import.meta.url));
export const PROBE_JSONL_PATH = resolve(probeDir, "news-delay.jsonl");
export const PROBE_COUNTS_PATH = resolve(probeDir, "news-delay-counts.json");

export type ProbeLine = {
  vendor: string;
  query: string;
  key: string;
  domain: string;
  title: string;
  published_at: string;
  first_seen_at: string;
  poll_started_at: string;
};

export type VendorCounts = Record<string, Record<string, number>>;

export type RequestDecision =
  | { ok: true; counts: VendorCounts; used: number }
  | { ok: false; used: number; cap: number; day: string };

export type VendorSummary = {
  vendor: string;
  articlesFirstSeen: number;
  distinctDomains: number;
  medianLagMinutes: number | null;
  p90LagMinutes: number | null;
  olderThan60Minutes: number;
  oldestPublishedUtc: string | null;
  newestPublishedUtc: string | null;
  polls: number;
};

export type OverlapCounts = {
  vendorArticles: number;
  vendorInRss: number;
  rssArticles: number;
  rssInVendor: number;
};

type VendorName = "gnews" | "marketaux";

type RawArticle = { url: string; title: string; publishedAt: string };

export function percentile(values: readonly number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0 || !Number.isFinite(p)) return null;
  if (sorted.length === 1) return sorted[0]!;
  const clamped = Math.min(100, Math.max(0, p));
  const rank = (clamped / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sorted[low]!;
  const highValue = sorted[high]!;
  if (low === high) return lowValue;
  const weight = rank - low;
  return lowValue * (1 - weight) + highValue * weight;
}

export function lagMinutes(publishedAt: string, firstSeenAt: string): number | null {
  const published = Date.parse(publishedAt);
  const seen = Date.parse(firstSeenAt);
  if (!Number.isFinite(published) || !Number.isFinite(seen)) return null;
  return (seen - published) / 60_000;
}

/** Articles whose key is not already recorded, including duplicates inside this batch. */
export function selectNewArticles<T extends { key: string }>(
  existingKeys: ReadonlySet<string>,
  articles: readonly T[],
): T[] {
  const seen = new Set(existingKeys);
  const fresh: T[] = [];
  for (const article of articles) {
    if (!article.key || seen.has(article.key)) continue;
    seen.add(article.key);
    fresh.push(article);
  }
  return fresh;
}

export function usedRequests(counts: VendorCounts, vendor: string, day: string): number {
  return counts[vendor]?.[day] ?? 0;
}

/** Refuse at `cap` (default 90). Otherwise return a new counter with this request added. */
export function decideRequest(
  counts: VendorCounts,
  vendor: string,
  day: string,
  cap = DAILY_REQUEST_CAP,
): RequestDecision {
  const used = usedRequests(counts, vendor, day);
  if (used >= cap) return { ok: false, used, cap, day };
  const days = { ...(counts[vendor] ?? {}), [day]: used + 1 };
  return { ok: true, counts: { ...counts, [vendor]: days }, used: used + 1 };
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function marketauxLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 3;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 3;
  return parsed;
}

/** UTC, three hours before `now`, as YYYY-MM-DDTHH:mm. */
export function marketauxPublishedAfter(now: Date): string {
  const then = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${then.getUTCFullYear()}-${pad(then.getUTCMonth() + 1)}-${pad(then.getUTCDate())}T${pad(then.getUTCHours())}:${pad(then.getUTCMinutes())}`;
}

export function gnewsSearchUrl(query: string, token: string): string {
  return `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&sortby=publishedAt&token=${token}`;
}

export function marketauxSearchUrl(
  query: string,
  token: string,
  limit: number,
  publishedAfter: string,
): string {
  const params = new URLSearchParams();
  params.set("api_token", token);
  params.set("language", "en");
  params.set("search", query);
  params.set("limit", String(limit));
  params.set("published_after", publishedAfter);
  return `https://api.marketaux.com/v1/news/all?${params.toString()}`;
}

export function vendorsFromEnv(env: {
  GNEWS_API_KEY?: string;
  MARKETAUX_API_KEY?: string;
}): VendorName[] {
  const names: VendorName[] = [];
  if (env.GNEWS_API_KEY?.trim()) names.push("gnews");
  if (env.MARKETAUX_API_KEY?.trim()) names.push("marketaux");
  return names;
}

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  const sorted = [...secrets].filter((secret) => secret.length > 0).sort((a, b) => b.length - a.length);
  for (const secret of sorted) out = out.split(secret).join("[redacted]");
  return out.replace(/([?&](?:token|api_token|api_key|apikey)=)[^&\s"']+/gi, "$1[redacted]");
}

export function articleRecord(input: {
  vendor: string;
  query: string;
  url: string;
  title: string;
  publishedAt: string;
  firstSeenAt: string;
  pollStartedAt: string;
}): ProbeLine | null {
  const url = input.url.trim();
  if (!url) return null;
  const publishedMs = Date.parse(input.publishedAt);
  if (!Number.isFinite(publishedMs)) return null;
  const key = canonicalUrl(url);
  let domain = "";
  try {
    domain = new URL(key).hostname.replace(/^www\./i, "");
  } catch {
    domain = "";
  }
  return {
    vendor: input.vendor,
    query: input.query,
    key,
    domain,
    title: input.title,
    published_at: new Date(publishedMs).toISOString(),
    first_seen_at: input.firstSeenAt,
    poll_started_at: input.pollStartedAt,
  };
}

function vendorBodyHasList(vendor: VendorName, body: unknown): boolean {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const list = vendor === "gnews" ? record.articles : record.data;
  return Array.isArray(list);
}

export function articlesFromVendorBody(vendor: VendorName, body: unknown): RawArticle[] {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const list = vendor === "gnews" ? record.articles : record.data;
  if (!Array.isArray(list)) return [];
  const articles: RawArticle[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const published = vendor === "gnews" ? row.publishedAt : row.published_at;
    articles.push({
      url: typeof row.url === "string" ? row.url : "",
      title: typeof row.title === "string" ? row.title : "",
      publishedAt: typeof published === "string" ? published : "",
    });
  }
  return articles;
}

export function parseCounts(text: string): VendorCounts {
  if (text.trim() === "") return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request counter file is not an object.");
  }
  const counts: VendorCounts = {};
  for (const [vendor, days] of Object.entries(parsed as Record<string, unknown>)) {
    if (!days || typeof days !== "object" || Array.isArray(days)) continue;
    const dayCounts: Record<string, number> = {};
    for (const [day, value] of Object.entries(days as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) dayCounts[day] = value;
    }
    counts[vendor] = dayCounts;
  }
  return counts;
}

export function parseProbeLines(text: string): ProbeLine[] {
  const lines: ProbeLine[] = [];
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<ProbeLine>;
      if (!parsed || typeof parsed.key !== "string" || typeof parsed.vendor !== "string") continue;
      lines.push(parsed as ProbeLine);
    } catch {
      continue;
    }
  }
  return lines;
}

export function summarizeVendor(vendor: string, lines: readonly ProbeLine[]): VendorSummary {
  const lags: number[] = [];
  const published: number[] = [];
  const domains = new Set<string>();
  const polls = new Set<string>();
  for (const line of lines) {
    const lag = lagMinutes(line.published_at, line.first_seen_at);
    if (lag !== null) lags.push(lag);
    const publishedMs = Date.parse(line.published_at);
    if (Number.isFinite(publishedMs)) published.push(publishedMs);
    if (line.domain) domains.add(line.domain);
    if (line.poll_started_at) polls.add(line.poll_started_at);
  }
  published.sort((a, b) => a - b);
  return {
    vendor,
    articlesFirstSeen: lines.length,
    distinctDomains: domains.size,
    medianLagMinutes: percentile(lags, 50),
    p90LagMinutes: percentile(lags, 90),
    olderThan60Minutes: lags.filter((lag) => lag > 60).length,
    oldestPublishedUtc: published.length ? new Date(published[0]!).toISOString() : null,
    newestPublishedUtc: published.length ? new Date(published[published.length - 1]!).toISOString() : null,
    polls: polls.size,
  };
}

export function publishedDateWindow(
  lines: readonly ProbeLine[],
): { start: string; endExclusive: string } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const line of lines) {
    const publishedMs = Date.parse(line.published_at);
    if (!Number.isFinite(publishedMs)) continue;
    if (publishedMs < min) min = publishedMs;
    if (publishedMs > max) max = publishedMs;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const start = `${new Date(min).toISOString().slice(0, 10)}T00:00:00.000Z`;
  const end = new Date(max);
  const endExclusive = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1)).toISOString();
  return { start, endExclusive };
}

export function overlapCounts(vendorKeys: readonly string[], rssUrls: readonly string[]): OverlapCounts {
  const vendor = new Set<string>();
  for (const key of vendorKeys) {
    if (key) vendor.add(canonicalUrl(key));
  }
  const rss = new Set<string>();
  for (const url of rssUrls) {
    if (url) rss.add(canonicalUrl(url));
  }
  let vendorInRss = 0;
  for (const key of vendor) if (rss.has(key)) vendorInRss += 1;
  let rssInVendor = 0;
  for (const url of rss) if (vendor.has(url)) rssInVendor += 1;
  return {
    vendorArticles: vendor.size,
    vendorInRss,
    rssArticles: rss.size,
    rssInVendor,
  };
}

export function formatCountShare(hit: number, total: number): string {
  if (total === 0) return "0/0";
  return `${hit}/${total} (${((100 * hit) / total).toFixed(1)}%)`;
}

export function formatMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function formatVendorSummary(summary: VendorSummary): string {
  return [
    summary.vendor,
    `  articles first seen: ${summary.articlesFirstSeen}`,
    `  distinct domains: ${summary.distinctDomains}`,
    `  median lag (minutes): ${formatMinutes(summary.medianLagMinutes)}`,
    `  90th percentile lag (minutes): ${formatMinutes(summary.p90LagMinutes)}`,
    `  older than 60 minutes at first sight: ${summary.olderThan60Minutes}`,
    `  oldest published (UTC): ${summary.oldestPublishedUtc ?? "n/a"}`,
    `  newest published (UTC): ${summary.newestPublishedUtc ?? "n/a"}`,
    `  polls: ${summary.polls}`,
  ].join("\n");
}

export function formatOverlap(counts: OverlapCounts): string {
  return `vendor articles also in rss ${formatCountShare(counts.vendorInRss, counts.vendorArticles)}; rss urls also in this vendor ${formatCountShare(counts.rssInVendor, counts.rssArticles)}`;
}

function probeMode(argv: readonly string[]): "poll" | "report" {
  const arg = argv[2];
  if (arg === undefined || arg === "poll") return "poll";
  if (arg === "report") return "report";
  throw new Error(`Unknown mode "${arg}". Use poll or report.`);
}

function loadEnvFiles(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "../../../..");
  config({ path: resolve(repoRoot, ".env") });
  config({ path: resolve(repoRoot, ".env.local"), override: true });
}

function readCounts(): VendorCounts {
  if (!existsSync(PROBE_COUNTS_PATH)) return {};
  return parseCounts(readFileSync(PROBE_COUNTS_PATH, "utf8"));
}

function writeCounts(counts: VendorCounts): void {
  mkdirSync(probeDir, { recursive: true });
  writeFileSync(PROBE_COUNTS_PATH, `${JSON.stringify(counts, null, 2)}\n`);
}

function existingKeys(): Set<string> {
  if (!existsSync(PROBE_JSONL_PATH)) return new Set();
  return new Set(parseProbeLines(readFileSync(PROBE_JSONL_PATH, "utf8")).map((line) => line.key));
}

function appendLines(lines: readonly ProbeLine[]): void {
  if (lines.length === 0) return;
  mkdirSync(probeDir, { recursive: true });
  const text = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
  appendFileSync(PROBE_JSONL_PATH, text);
}

async function fetchVendorBody(url: string, token: string): Promise<unknown> {
  try {
    const res = await axios.get(url, { timeout: 20_000, validateStatus: () => true });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.data;
  } catch (err: unknown) {
    if (err instanceof Error && /^HTTP \d+$/.test(err.message)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(redactSecrets(message, [token]).slice(0, 180));
  }
}

async function poll(): Promise<void> {
  const gnewsToken = process.env.GNEWS_API_KEY?.trim() ?? "";
  const marketauxToken = process.env.MARKETAUX_API_KEY?.trim() ?? "";
  const vendors = vendorsFromEnv({ GNEWS_API_KEY: gnewsToken, MARKETAUX_API_KEY: marketauxToken });
  if (vendors.length === 0) {
    throw new Error("No news API key is set. Set GNEWS_API_KEY or MARKETAUX_API_KEY.");
  }

  const now = new Date();
  const day = utcDay(now);
  const pollStartedAt = now.toISOString();
  const limit = marketauxLimit(process.env.MARKETAUX_LIMIT);
  const publishedAfter = marketauxPublishedAfter(now);
  let counts = readCounts();
  const seen = existingKeys();
  console.log(`poll started ${pollStartedAt}`);

  for (const vendor of vendors) {
    const token = vendor === "gnews" ? gnewsToken : marketauxToken;
    for (const query of PROBE_QUERIES) {
      const decision = decideRequest(counts, vendor, day);
      if (!decision.ok) {
        console.log(
          `${vendor}: not sending "${query}" — ${decision.used} requests already used on ${decision.day} UTC (cap ${decision.cap})`,
        );
        continue;
      }
      counts = decision.counts;
      writeCounts(counts);

      const url = vendor === "gnews"
        ? gnewsSearchUrl(query, token)
        : marketauxSearchUrl(query, token, limit, publishedAfter);
      let body: unknown;
      try {
        body = await fetchVendorBody(url, token);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${vendor}: request failed (${redactSecrets(message, [token])})`);
        continue;
      }

      if (!vendorBodyHasList(vendor, body)) {
        console.error(`${vendor}: response had no article list`);
      }
      const firstSeenAt = new Date().toISOString();
      const records: ProbeLine[] = [];
      for (const article of articlesFromVendorBody(vendor, body)) {
        const record = articleRecord({
          vendor,
          query,
          url: article.url,
          title: article.title,
          publishedAt: article.publishedAt,
          firstSeenAt,
          pollStartedAt,
        });
        if (record) records.push(record);
      }
      const fresh = selectNewArticles(seen, records);
      for (const record of fresh) seen.add(record.key);
      appendLines(fresh);
      console.log(`${vendor}: "${query}" returned ${records.length}, appended ${fresh.length}`);
    }
  }
}

type RssRow = { source?: unknown; url?: unknown };

async function loadRssUrls(start: string, endExclusive: string, secrets: string[]): Promise<string[]> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to read raw_events.");
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const urls: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("raw_events")
      .select("source,url:raw_data->>url")
      .eq("source", "rss")
      .gte("event_date", start)
      .lt("event_date", endExclusive)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(redactSecrets(`raw_events read failed: ${error.message}`, [...secrets, serviceKey]));
    const rows = (data ?? []) as RssRow[];
    for (const row of rows) {
      if (row.source === "rss" && typeof row.url === "string" && row.url.trim()) urls.push(row.url);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return urls;
}

async function report(): Promise<void> {
  if (!existsSync(PROBE_JSONL_PATH)) {
    throw new Error(`Probe file not found: ${PROBE_JSONL_PATH}`);
  }
  const lines = parseProbeLines(readFileSync(PROBE_JSONL_PATH, "utf8"));
  const byVendor = new Map<string, ProbeLine[]>();
  for (const line of lines) {
    const group = byVendor.get(line.vendor) ?? [];
    group.push(line);
    byVendor.set(line.vendor, group);
  }
  if (byVendor.size === 0) {
    console.log("No articles in the probe file.");
    return;
  }

  const summaries = [...byVendor.entries()].map(([vendor, group]) => summarizeVendor(vendor, group));
  for (const summary of summaries) console.log(formatVendorSummary(summary));

  const window = publishedDateWindow(lines);
  if (!window) {
    console.log("rss overlap: not queried (no published times)");
    return;
  }

  const secrets = [process.env.GNEWS_API_KEY ?? "", process.env.MARKETAUX_API_KEY ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""];
  const rssUrls = await loadRssUrls(window.start, window.endExclusive, secrets);
  for (const [vendor, group] of byVendor) {
    const counts = overlapCounts(group.map((line) => line.key), rssUrls);
    console.log(`${vendor} rss overlap: ${formatOverlap(counts)}`);
  }
}

function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /[/\\]probe-news-delay\.(ts|js)$/.test(entry);
}

async function main(): Promise<void> {
  loadEnvFiles();
  const mode = probeMode(process.argv);
  if (mode === "report") await report();
  else await poll();
}

if (isEntrypoint()) {
  const secrets = () => [process.env.GNEWS_API_KEY ?? "", process.env.MARKETAUX_API_KEY ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""];
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(redactSecrets(message, secrets()));
    process.exit(1);
  });
}
