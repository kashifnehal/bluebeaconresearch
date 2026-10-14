/**
 * Read-only probe for the two GDELT candidate queries and, with --gnews, the two
 * GNews queries. No database, no model call, no insert. Writes JSON under
 * apps/backend/.tmp and never prints the GNews token. 2026-10-14.
 */
import axios from "axios";
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isRelevantEvent } from "../lib/relevance-filter.js";
import { matchShadowGroups } from "../lib/shadow-terms.js";
import {
  gdeltDocRequestUrl,
  matchesT2Pair,
  T2_GDELT_QUERY_CANDIDATES,
  T2_GNEWS_QUERIES,
} from "../lib/t2-terms.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const backendRoot = resolve(here, "../..");

config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(repoRoot, ".env.local"), override: true });

const wantGnews = process.argv.includes("--gnews");
const TITLE_LIMIT = 25;

type Pair = { asset: string; commodity: string; event: string };

type ScoredArticle = {
  title: string;
  url: string;
  domain: string;
  current: boolean;
  pair: Pair | null;
  shadowGroups: string[];
  label: "C" | "P" | "-";
};

type VariantResult = {
  variant: string;
  query: string;
  httpStatus: number;
  count: number;
  passCurrent: number;
  pairOnly: number;
  neither: number;
  error: string;
  articles: ScoredArticle[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function redact(text: string, token: string): string {
  const withoutToken = token ? text.split(token).join("[redacted]") : text;
  return withoutToken.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]");
}

function bodyNote(data: unknown, token: string): string {
  let note = "no article list";
  if (typeof data === "string") note = data.replace(/\s+/g, " ").slice(0, 160);
  else if (data && typeof data === "object") {
    const record = data as { message?: unknown; error?: unknown };
    const msg = record.message ?? record.error;
    if (typeof msg === "string" && msg.trim()) note = msg.replace(/\s+/g, " ").slice(0, 160);
  }
  return redact(note, token);
}

function publisherDomain(url: string, domain?: string, sourceName?: string): string {
  if (domain && domain.trim()) return domain.trim();
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* fall through */
    }
  }
  return sourceName?.trim() || "unknown";
}

function scoreArticle(title: string, summary: string, url: string, domain: string): ScoredArticle {
  const text = `${title} ${summary}`.trim();
  const previous = process.env.T2_PAIR_RULE;
  delete process.env.T2_PAIR_RULE;
  let current = false;
  try {
    current = isRelevantEvent(title, summary, "world");
  } finally {
    if (previous === undefined) delete process.env.T2_PAIR_RULE;
    else process.env.T2_PAIR_RULE = previous;
  }
  const pair = matchesT2Pair(text);
  const shadowGroups = matchShadowGroups(text);
  const label: ScoredArticle["label"] = current ? "C" : pair ? "P" : "-";
  return { title, url, domain, current, pair, shadowGroups, label };
}

function summarize(variant: string, query: string, httpStatus: number, error: string, raw: ScoredArticle[]): VariantResult {
  const passCurrent = raw.filter((a) => a.current).length;
  const pairOnly = raw.filter((a) => !a.current && a.pair).length;
  const neither = raw.filter((a) => !a.current && !a.pair).length;
  return {
    variant,
    query,
    httpStatus,
    count: raw.length,
    passCurrent,
    pairOnly,
    neither,
    error,
    articles: raw,
  };
}

function printVariant(result: VariantResult): void {
  const err = result.error ? ` error=${result.error}` : "";
  console.log(
    `${result.variant}  HTTP ${result.httpStatus}  count=${result.count}  current=${result.passCurrent}  pairOnly=${result.pairOnly}  neither=${result.neither}${err}`,
  );
  const shown = result.articles.slice(0, TITLE_LIMIT);
  for (const article of shown) {
    const title = article.title.replace(/\s+/g, " ");
    console.log(`${article.label} ${title} — ${article.domain}`);
  }
  if (result.articles.length > TITLE_LIMIT) {
    console.log(`(showing ${TITLE_LIMIT} of ${result.articles.length})`);
  }
}

async function fetchGdelt(query: string): Promise<{ status: number; articles: ScoredArticle[]; error: string }> {
  try {
    const res = await axios.get(gdeltDocRequestUrl(query), {
      timeout: 40_000,
      validateStatus: () => true,
    });
    const list = Array.isArray(res.data?.articles) ? res.data.articles : null;
    const error = res.status >= 400 || !list ? bodyNote(res.data, "") : "";
    const articles: ScoredArticle[] = (list ?? []).map((article: { title?: string; url?: string; domain?: string }) => {
      const title = String(article?.title ?? "").trim();
      const url = String(article?.url ?? "");
      return scoreArticle(title, "", url, publisherDomain(url, article?.domain));
    });
    return { status: res.status, articles, error };
  } catch (err: any) {
    return { status: err?.response?.status ?? 0, articles: [], error: String(err?.message ?? err).slice(0, 160) };
  }
}

async function fetchGnews(
  query: string,
  token: string,
): Promise<{ status: number; articles: ScoredArticle[]; error: string }> {
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&sortby=publishedAt&token=${encodeURIComponent(token)}`;
  try {
    const res = await axios.get(url, { timeout: 20_000, validateStatus: () => true });
    const list = Array.isArray(res.data?.articles) ? res.data.articles : null;
    const error = res.status >= 400 || !list ? bodyNote(res.data, token) : "";
    const articles: ScoredArticle[] = (list ?? []).map(
      (article: { title?: string; description?: string; url?: string; source?: { name?: string; url?: string } }) => {
        const title = String(article?.title ?? "").trim();
        const summary = String(article?.description ?? "");
        const articleUrl = String(article?.url ?? "");
        return scoreArticle(title, summary, articleUrl, publisherDomain(articleUrl, undefined, article?.source?.name));
      },
    );
    return { status: res.status, articles, error };
  } catch (err: any) {
    const message = redact(String(err?.message ?? err), token).slice(0, 160);
    return { status: err?.response?.status ?? 0, articles: [], error: message };
  }
}

const variants: VariantResult[] = [];

const gdeltV1 = await fetchGdelt(T2_GDELT_QUERY_CANDIDATES[0]);
variants.push(summarize("gdelt-v1", T2_GDELT_QUERY_CANDIDATES[0], gdeltV1.status, gdeltV1.error, gdeltV1.articles));

await sleep(6_000);

const gdeltV2 = await fetchGdelt(T2_GDELT_QUERY_CANDIDATES[1]);
variants.push(summarize("gdelt-v2", T2_GDELT_QUERY_CANDIDATES[1], gdeltV2.status, gdeltV2.error, gdeltV2.articles));

const v1Works = gdeltV1.status >= 200 && gdeltV1.status < 300 && gdeltV1.articles.length > 0 && !gdeltV1.error;
const v2Works = gdeltV2.status >= 200 && gdeltV2.status < 300 && gdeltV2.articles.length > 0 && !gdeltV2.error;
const chosenIndex: 0 | 1 = !v1Works && v2Works ? 1 : 0;
const chosenReason = chosenIndex === 1
  ? "V1 returned an error or zero articles while V2 returned articles"
  : "V1 stays selected";

const gnewsToken = process.env.GNEWS_API_KEY ?? "";
let gnewsNote = "not requested";
if (wantGnews && !gnewsToken) {
  gnewsNote = "skipped: GNEWS_API_KEY missing";
  console.log("gnews  skipped  GNEWS_API_KEY missing");
} else if (wantGnews) {
  gnewsNote = "2 requests";
  for (let i = 0; i < T2_GNEWS_QUERIES.length; i++) {
    if (i > 0) await sleep(1_100);
    const fetched = await fetchGnews(T2_GNEWS_QUERIES[i]!, gnewsToken);
    variants.push(summarize(`gnews-${i + 1}`, T2_GNEWS_QUERIES[i]!, fetched.status, fetched.error, fetched.articles));
  }
}

for (const variant of variants) printVariant(variant);
console.log(`GDELT chosen index=${chosenIndex} (${chosenReason})`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(backendRoot, ".tmp");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `t2-probe-${stamp}.json`);
const payload = {
  ranAt: new Date().toISOString(),
  gnews: gnewsNote,
  gdeltChosenIndex: chosenIndex,
  gdeltChosenReason: chosenReason,
  variants: variants.map((variant) => ({
    ...variant,
    query: variant.query,
  })),
};
const serialized = redact(JSON.stringify(payload, null, 2), gnewsToken);
writeFileSync(outPath, serialized);
console.log(`wrote ${outPath}`);
