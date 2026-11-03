import { getSupabaseAdmin } from "../clients/supabase.js";
import { EmailService } from "../services/email.service.js";
import { tokenize, jaccardSimilarity } from "./signal-merge.js";
import { weekAheadFor, weeklyRhythmLines, type WeekAheadEvent } from "../lib/week-ahead.js";
import {
  documentWrapper,
  masthead,
  preheader,
  eventExposureEvidence,
  tagList,
  footer,
} from "../lib/email-layout.js";

let supabase = getSupabaseAdmin();
let email = new EmailService();
let weekAhead = weekAheadFor;

/** Test-only. Production call sites keep the module clients. */
export function __setDigestSupabaseForTests(client: unknown): void {
  supabase = client as typeof supabase;
}

/** Test-only. Production call sites keep the Resend client. */
export function __setDigestEmailForTests(next: EmailService): void {
  email = next;
}

/** Test-only. Production call sites keep the real calendar-backed week-ahead lookup. */
export function __setWeekAheadForTests(next: typeof weekAheadFor): void {
  weekAhead = next;
}

// Canonical region id → display label. signals.region is free text ("Middle East",
// "Middle East / Global", "Eastern Europe/Russia"), never the canonical id, so digest
// matching checks both the id and a loose label substring — same approach as the
// personalized-feed filter in apps/web/app/api/signals/route.ts.
const REGION_LABEL: Record<string, string> = {
  "middle-east": "Middle East",
  "eastern-europe": "Eastern Europe",
  africa: "Africa",
  "asia-pacific": "Asia",
  americas: "America",
  global: "Global",
};

const TRUST_LINE = "Informational research, not investment advice. Sources and dates are shown on each item.";

const CALENDAR_URL = "https://www.bluebeaconresearch.com/calendar";

const DIGEST_LIMIT = 5;
// Candidate pool fetched before diversity picking — DESIGN CHOICE, not a tuned
// constant (same spirit as signal-merge.ts's own CANDIDATE_LIMIT).
const CANDIDATE_POOL_LIMIT = 25;
// MMR lambda (Carbonell & Goldstein) — DESIGN CHOICE: weigh relevance (severity)
// over novelty 0.7/0.3, matching signal-merge.ts's own bias toward not over-merging.
const MMR_LAMBDA = 0.7;

type PrefRow = {
  user_id: string;
  commodities: string[] | null;
  regions: string[] | null;
  forex_pairs: string[] | null;
  min_severity: number | null;
};

export type SignalRow = {
  id: string;
  title: string;
  summary: string | null;
  ai_analysis: string | null;
  severity: number;
  region: string | null;
  commodity_impacts: Array<{ asset?: string; direction?: string }> | null;
  currency_pair_impacts: Array<{ asset?: string; direction?: string }> | null;
  raw_event_ids: string[] | null;
  event_date: string | null;
  created_at: string;
};

function leadSentence(text: string, cap = 320): string {
  const plain = text.replace(/[*_`>]/g, "").replace(/\r/g, "").trim();
  const paras = plain
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/gm, "").replace(/\n/g, " ").trim())
    .filter(Boolean);
  const isHeading = (p: string) =>
    p.length < 60 || (p === p.toUpperCase() && /[A-Z]/.test(p)) || !/[.!?]/.test(p);
  const lead = paras.find((p) => !isHeading(p)) ?? paras[0] ?? plain;
  return lead.length > cap ? `${lead.slice(0, cap - 1).trimEnd()}…` : lead;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "03 Nov UTC" — used in the masthead date line and the digest subject. */
function formatDateUTC(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} UTC`;
}

/** "03 Nov" — used next to a linked source, where repeating "UTC" per source is just noise. */
function formatSourceDateUTC(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}`;
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const SIGNAL_COLUMNS =
  "id, title, summary, ai_analysis, severity, region, commodity_impacts, currency_pair_impacts, raw_event_ids, event_date, created_at";

/**
 * Signals the alert-dispatcher's per-user daily budget deferred (decided 2026-10-02)
 * for this user — `alerts_sent` rows with status "deferred" and
 * deferred_to_digest still true. These still bypass the preference OR-filter
 * and the MMR pick: the user already cleared an alert_rules match for them.
 * They do not bypass the 24-hour window. A deferred signal whose
 * signals.created_at is older than 24 hours is left out.
 */
async function deferredSignalsForUser(userId: string, now: Date): Promise<SignalRow[]> {
  const { data: deferredRows, error: deferredErr } = await supabase
    .from("alerts_sent")
    .select("signal_id")
    .eq("user_id", userId)
    .eq("status", "deferred")
    .eq("deferred_to_digest", true);
  if (deferredErr || !deferredRows?.length) return [];

  const signalIds = [...new Set(deferredRows.map((r) => r.signal_id as string))];
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("signals")
    .select(SIGNAL_COLUMNS)
    .in("id", signalIds)
    .gte("created_at", since);
  if (error) {
    console.error("[digest] deferred-signal select failed:", error.message);
    return [];
  }
  return (data ?? []) as SignalRow[];
}

/** Clears the deferred_to_digest flag so a sent digest never resurfaces the same signal tomorrow. */
export async function clearDeferredDigestFlags(userId: string, signalIds: string[]): Promise<void> {
  if (signalIds.length === 0) return;
  await supabase
    .from("alerts_sent")
    .update({ deferred_to_digest: false })
    .eq("user_id", userId)
    .eq("status", "deferred")
    .in("signal_id", signalIds);
}

/**
 * Pull the last 24h of signals that overlap a single user's watched commodities /
 * regions / forex pairs, above their own min_severity floor (if set), then pick
 * DIGEST_LIMIT of them via pickDiverse() rather than a flat top-N — a severity-only
 * cut previously let one heavily-covered story crowd out every other watchlist hit
 * (see LIVE_TODO #83 note on a CORN/WHEAT-only digest) — plus any signal the
 * alert-dispatcher budget deferred for this user (decided 2026-10-02) whose
 * signals.created_at is within the last 24 hours. Deferred rows still bypass
 * the diversity pick, since the user already cleared a real alert_rules match.
 * Returns [] when the user has no preferences and nothing deferred remains
 * inside the window (the digest is genuinely personalized — no global top-5
 * fallback). An empty result is the existing skippedNoSignals path.
 */
export async function selectDigestSignalsForUser(pref: PrefRow, now = new Date()): Promise<SignalRow[]> {
  const regions = Array.isArray(pref.regions) ? pref.regions : [];
  const commodities = Array.isArray(pref.commodities) ? pref.commodities : [];
  const forexPairs = Array.isArray(pref.forex_pairs) ? pref.forex_pairs : [];

  const deferred = await deferredSignalsForUser(pref.user_id, now);

  if (regions.length === 0 && commodities.length === 0 && forexPairs.length === 0) {
    return deferred.slice(0, DIGEST_LIMIT);
  }

  const orParts: string[] = [];
  // TODO(PERS-P1): once apps/backend/src/lib/region-variants.ts lands, switch this
  // (and whichWatchMatched's region check below) to regionMatches() instead of the
  // REGION_LABEL id/substring pair — P1 hasn't landed yet, so behavior is unchanged.
  for (const rid of regions) {
    orParts.push(`region.eq.${rid}`);
    const label = REGION_LABEL[rid];
    if (label) orParts.push(`region.ilike.*${label}*`);
  }
  for (const sym of commodities) {
    if (/^[A-Z0-9]+$/.test(sym)) orParts.push(`commodity_impacts.cs.[{"asset":"${sym}"}]`);
  }
  // Forex pairs fold into the same combined OR, matched against
  // currency_pair_impacts with the same jsonb-containment operator (#87 phase 3).
  for (const sym of forexPairs) {
    if (/^[A-Z0-9]+$/.test(sym)) orParts.push(`currency_pair_impacts.cs.[{"asset":"${sym}"}]`);
  }

  let regular: SignalRow[] = [];
  if (orParts.length > 0) {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    let query = supabase
      .from("signals")
      .select(SIGNAL_COLUMNS)
      .eq("is_active", true)
      .gte("created_at", since)
      .or(orParts.join(","));
    if (pref.min_severity != null) query = query.gte("severity", pref.min_severity);

    const { data, error } = await query
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_POOL_LIMIT);

    if (error) {
      console.error("[digest] signal select failed:", error.message);
    } else {
      regular = pickDiverse((data ?? []) as SignalRow[], DIGEST_LIMIT);
    }
  }

  const byId = new Map<string, SignalRow>();
  for (const s of [...deferred, ...regular]) byId.set(s.id, s);
  return [...byId.values()]
    .sort((a, b) => b.severity - a.severity || b.created_at.localeCompare(a.created_at))
    .slice(0, DIGEST_LIMIT);
}

/**
 * Picks `limit` items out of `candidates` (already ordered severity-desc,
 * created_at-desc) via Maximal Marginal Relevance (Carbonell & Goldstein 1998):
 * greedily adds the candidate maximizing score = λ*relevance - (1-λ)*maxSim,
 * where relevance is normalized severity (severity/10, scale is always 1-10)
 * and maxSim is the highest title-Jaccard-similarity against items already
 * picked (same tokenizer signal-merge.ts uses for cross-source dedup, imported
 * above rather than reimplemented). Pure function — no I/O — so a digest full of
 * near-duplicate coverage of one story no longer crowds out the other 4 slots.
 */
export function pickDiverse(candidates: SignalRow[], limit: number): SignalRow[] {
  if (candidates.length <= limit) return candidates;

  const titleTokens = candidates.map((c) => tokenize(c.title));
  const pickedIdx: number[] = [];
  const remaining = new Set(candidates.map((_, i) => i));

  while (pickedIdx.length < limit && remaining.size > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (const i of remaining) {
      const relevance = candidates[i].severity / 10;
      const maxSim = pickedIdx.length
        ? Math.max(...pickedIdx.map((j) => jaccardSimilarity(titleTokens[i], titleTokens[j])))
        : 0;
      const score = MMR_LAMBDA * relevance - (1 - MMR_LAMBDA) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    pickedIdx.push(bestIdx);
    remaining.delete(bestIdx);
  }

  return pickedIdx.map((i) => candidates[i]);
}

function whichWatchMatched(signal: SignalRow, pref: PrefRow): string {
  const hits: string[] = [];
  const impacts = Array.isArray(signal.commodity_impacts) ? signal.commodity_impacts : [];
  for (const sym of pref.commodities ?? []) {
    if (impacts.some((c) => c.asset === sym)) hits.push(sym);
  }
  const fxImpacts = Array.isArray(signal.currency_pair_impacts) ? signal.currency_pair_impacts : [];
  for (const sym of pref.forex_pairs ?? []) {
    if (fxImpacts.some((c) => c.asset === sym)) hits.push(sym);
  }
  for (const rid of pref.regions ?? []) {
    const label = REGION_LABEL[rid];
    if (signal.region === rid || (label && signal.region?.toLowerCase().includes(label.toLowerCase()))) {
      hits.push(label ?? rid);
    }
  }
  return hits.length ? hits.join(", ") : "your watchlist";
}

export type DigestSource = { url: string; date: string | null };

/** Article date comes from raw_events.event_date (set by every collector to the article's publish time), not raw_data — so it's available the same way regardless of source. */
async function sourceUrlsFor(signals: SignalRow[]): Promise<Map<string, DigestSource[]>> {
  const ids = [...new Set(signals.flatMap((s) => (Array.isArray(s.raw_event_ids) ? s.raw_event_ids : [])))];
  const byRawEvent = new Map<string, DigestSource>();
  if (ids.length) {
    const { data } = await supabase.from("raw_events").select("id, raw_data, event_date").in("id", ids);
    for (const re of data ?? []) {
      const url = (re as any).raw_data?.url;
      if (typeof url === "string" && url) {
        byRawEvent.set((re as any).id, { url, date: (re as any).event_date ?? null });
      }
    }
  }
  const out = new Map<string, DigestSource[]>();
  for (const s of signals) {
    const srcs = (s.raw_event_ids ?? [])
      .map((id) => byRawEvent.get(id))
      .filter((u): u is DigestSource => Boolean(u))
      .slice(0, 2);
    out.set(s.id, srcs);
  }
  return out;
}

function newestIncludedLine(signals: SignalRow[]): string {
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const s of signals) {
    const ms = Date.parse(s.created_at);
    if (ms > maxMs) maxMs = ms;
  }
  const stamp = Number.isFinite(maxMs) ? new Date(maxMs).toISOString() : "";
  return `Newest signal in this email: ${stamp}`;
}

function formatWeekAheadAssets(assets: WeekAheadEvent["assets"]): string {
  return assets === "all" ? "All markets" : assets.join(", ");
}

function renderWeekAheadText(events: WeekAheadEvent[]): string {
  const lines = events.map(
    (e) =>
      `${e.date}${e.time ? ` ${e.time} UTC` : ""} — ${e.event} (${formatWeekAheadAssets(e.assets)}) — ${e.sourceUrl}`,
  );
  return [
    "WEEK AHEAD",
    ...lines,
    "",
    "Weekly rhythm:",
    ...weeklyRhythmLines().map((l) => `- ${l}`),
    "",
    `Full calendar: ${CALENDAR_URL}`,
  ].join("\n");
}

function renderWeekAheadHtml(events: WeekAheadEvent[]): string {
  const rows = events
    .map(
      (e) =>
        `<li><a href="${esc(e.sourceUrl)}" style="color:#2563eb;">${esc(e.event)}</a> — ${esc(e.date)}${
          e.time ? ` ${esc(e.time)} UTC` : ""
        } <span style="color:#6b7280;">(${esc(formatWeekAheadAssets(e.assets))})</span></li>`,
    )
    .join("");
  const rhythm = weeklyRhythmLines()
    .map((l) => `<li>${esc(l)}</li>`)
    .join("");
  return `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;">
    <div style="font:800 14px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin-bottom:8px;">Week ahead</div>
    <ul style="margin:0 0 10px;padding-left:18px;font:400 13px/1.6 -apple-system,sans-serif;color:#1f2937;">${rows}</ul>
    <div style="font:700 11px/1.5 -apple-system,sans-serif;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Weekly rhythm</div>
    <ul style="margin:0;padding-left:18px;font:400 12px/1.6 -apple-system,sans-serif;color:#6b7280;">${rhythm}</ul>
    <div style="margin-top:8px;"><a href="${CALENDAR_URL}" style="color:#2563eb;font:400 12px -apple-system,sans-serif;">Full calendar →</a></div>
  </div>`;
}

/**
 * Monday-only "no watchlist matches, but your commodities have scheduled
 * releases this week" email. Sent in place of the usual skip when
 * selectDigestSignalsForUser() returns nothing and weekAheadFor() returns at
 * least one event (#CAL2, 2026-10-27).
 */
export function renderWeekAheadOnlyEmail(
  events: WeekAheadEvent[],
  appUrl: string,
): { subject: string; html: string; text: string } {
  const intro = "No new matches for your watchlist in the last 24 hours — here's what's scheduled this week.";
  const subject = `Week ahead: ${events.length} scheduled releases for your commodities`;
  const text = [intro, "", renderWeekAheadText(events), "", TRUST_LINE, "", "Turn this digest off anytime in Settings → Notifications."].join(
    "\n",
  );
  const html = `<div style="max-width:600px;margin:0 auto;padding:24px 16px;background:#ffffff;">
    <div style="font:800 20px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">Your Blue Beacon digest</div>
    <div style="font:400 13px/1.5 -apple-system,sans-serif;color:#6b7280;margin:4px 0 20px;">${esc(intro)}</div>
    ${renderWeekAheadHtml(events)}
    <div style="font:400 11px/1.5 -apple-system,sans-serif;color:#9ca3af;border-top:1px solid #eee;padding-top:12px;margin-top:16px;">
      ${TRUST_LINE}<br><br>
      You're receiving this because the daily digest is on for your account.
      <a href="${appUrl}/settings" style="color:#6b7280;">Turn it off in Settings → Notifications</a>.
    </div>
  </div>`;
  return { subject, html, text };
}

function renderText(
  signals: SignalRow[],
  pref: PrefRow,
  sources: Map<string, DigestSource[]>,
  weekAheadEvents: WeekAheadEvent[] = [],
): string {
  const blocks = signals.map((s, i) => {
    const impacts = [
      ...(Array.isArray(s.commodity_impacts) ? s.commodity_impacts : []),
      ...(Array.isArray(s.currency_pair_impacts) ? s.currency_pair_impacts : []),
    ];
    const instruments = impacts.length
      ? impacts.map((c) => c.asset).filter(Boolean).join("  ·  ")
      : "No specific instruments were flagged.";
    const why = s.ai_analysis
      ? leadSentence(String(s.ai_analysis))
      : `${s.summary ?? "No summary available."} No extended note for this item.`;
    const src = sources.get(s.id) ?? [];
    const srcLines = src.map((item) =>
      item.date ? `${sourceHost(item.url)} (${formatSourceDateUTC(item.date)})` : sourceHost(item.url),
    );
    return [
      `${i + 1}. EVENT: ${s.title}`,
      `   WHY IT MATTERS: ${why}`,
      `   WHICH INSTRUMENTS: ${instruments}`,
      `   ALERT THRESHOLD: severity ${s.severity} — matched ${whichWatchMatched(s, pref)}`,
      ...(srcLines.length ? [`   SOURCE: ${srcLines.join("  ·  ")}`] : []),
    ].join("\n");
  });
  const lines = [
    `Your Blue Beacon digest — top ${signals.length} from the last 24 hours, ranked by severity,`,
    `filtered to the regions, commodities, and forex pairs you follow.`,
    ``,
    blocks.join("\n\n"),
    ``,
    TRUST_LINE,
    ``,
    `Turn this digest off anytime in Settings → Notifications.`,
    newestIncludedLine(signals),
  ];
  if (weekAheadEvents.length > 0) {
    lines.push("", renderWeekAheadText(weekAheadEvents));
  }
  return lines.join("\n");
}

function renderHtml(
  signals: SignalRow[],
  pref: PrefRow,
  sources: Map<string, DigestSource[]>,
  appUrl: string,
  weekAheadEvents: WeekAheadEvent[] = [],
  now: Date = new Date(),
  address?: string,
): string {
  const cards = signals
    .map((s) => {
      const impacts = [
        ...(Array.isArray(s.commodity_impacts) ? s.commodity_impacts : []),
        ...(Array.isArray(s.currency_pair_impacts) ? s.currency_pair_impacts : []),
      ];
      const instruments = impacts.length
        ? tagList(impacts.map((c) => c.asset ?? "").filter(Boolean))
        : `<em style="color:#5B6B7F;">No specific instruments were flagged.</em>`;
      const why = s.ai_analysis
        ? esc(leadSentence(String(s.ai_analysis)))
        : `${esc(s.summary ?? "No summary available.")}<br><span style="color:#5B6B7F;font-style:italic;font-size:12px;">No extended note for this item.</span>`;
      const src = sources.get(s.id) ?? [];
      const evidence = src.length
        ? src
            .map(
              (item) =>
                `<a href="${esc(item.url)}" style="color:#0A2643;">${esc(sourceHost(item.url))}</a>${
                  item.date ? ` — ${esc(formatSourceDateUTC(item.date))}` : ""
                }`,
            )
            .join("<br>")
        : `<span style="color:#5B6B7F;">No linked source for this item.</span>`;

      const block = eventExposureEvidence({
        event: `<a href="${appUrl}/events/${s.id}" style="color:#0B1220;font-weight:700;text-decoration:none;">${esc(
          s.title,
        )}</a>`,
        exposure: `${instruments}<div style="margin-top:4px;">${why}</div>`,
        evidence,
      });
      const matched = `<div style="font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#5B6B7F;margin-top:4px;">Matched: ${esc(
        whichWatchMatched(s, pref),
      )} · Severity ${s.severity}</div>`;
      return `<div style="margin:0 0 18px;border-bottom:1px solid #D9DDE3;padding-bottom:12px;">${block}${matched}</div>`;
    })
    .join("");

  const body = `
    ${masthead("BLUE BEACON RESEARCH", `Daily Brief · ${formatDateUTC(now)}`)}
    ${preheader(signals[0]?.title ?? "")}
    <div style="font:400 13px/1.5 Arial,Helvetica,sans-serif;color:#5B6B7F;margin:0 0 16px;">
      Top ${signals.length} from the last 24 hours, ranked by severity, filtered to the regions, commodities, and forex pairs you follow.
    </div>
    ${cards}
    <div style="font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#5B6B7F;">${esc(newestIncludedLine(signals))}</div>
    ${weekAheadEvents.length > 0 ? renderWeekAheadHtml(weekAheadEvents) : ""}
    ${footer({
      reason: `${TRUST_LINE} You're receiving this because the daily digest is on for your account.`,
      unsubscribeUrl: `${appUrl}/settings`,
      preferencesUrl: `${appUrl}/settings`,
      address,
    })}
  `;

  return documentWrapper("Blue Beacon Research — Daily Brief", body);
}

/** Build the {subject, html, text} for one user's digest. Exported for tests/verification. */
export function renderDigestEmail(
  signals: SignalRow[],
  pref: PrefRow,
  sources: Map<string, DigestSource[]>,
  appUrl: string,
  weekAheadEvents: WeekAheadEvent[] = [],
  now: Date = new Date(),
  address?: string,
): { subject: string; html: string; text: string } {
  return {
    subject: `Blue Beacon Research: ${signals[0].title.slice(0, 60)} (${formatDateUTC(now)})`,
    html: renderHtml(signals, pref, sources, appUrl, weekAheadEvents, now, address),
    text: renderText(signals, pref, sources, weekAheadEvents),
  };
}

export { sourceUrlsFor };

export type DigestRunResult = {
  eligible: number;
  sent: number;
  skippedNoSignals: number;
  failed: number;
  senderEnabled: boolean;
};

type DigestLogError = { message?: string; code?: string };

function isMissingDigestSendLogTable(error: DigestLogError): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

/**
 * One public.digest_send_log row for this run. A failed insert is logged and
 * never thrown, so a missing table or a write error cannot stop the digest
 * or change what is sent.
 */
export async function recordDigestSendLog(
  result: DigestRunResult,
  errorText: string | null = null,
): Promise<void> {
  try {
    const { error } = await supabase.from("digest_send_log").insert({
      eligible: result.eligible,
      sent: result.sent,
      skipped_no_signals: result.skippedNoSignals,
      failed: result.failed,
      sender_enabled: result.senderEnabled,
      error: errorText,
    });
    if (!error) return;
    if (isMissingDigestSendLogTable(error)) {
      console.warn("[digest] digest_send_log table missing, skipping log");
      return;
    }
    console.error("[digest] digest_send_log insert failed:", error.message);
  } catch (e) {
    console.error("[digest] digest_send_log insert threw:", e instanceof Error ? e.message : e);
  }
}

/**
 * Once-daily personalized digest. Scheduled from workers.ts alongside the
 * existing collectors' cron. For every user who finished onboarding and hasn't opted
 * out, sends their own top-5 signals from the last 24h (matched to their watchlist),
 * in the same Event → Why → Instruments → Threshold framing as the in-app Alerts card.
 */
export async function runDigestOnce(
  opts?: { onlyUserIds?: string[]; dryRun?: boolean; now?: Date },
): Promise<DigestRunResult> {
  const result: DigestRunResult = {
    eligible: 0,
    sent: 0,
    skippedNoSignals: 0,
    failed: 0,
    senderEnabled: email.enabled,
  };
  let errorText: string | null = null;
  const now = opts?.now ?? new Date();
  // Mondays only (UTC). The "Week ahead" section/calendar-only email is a
  // this-task addition (2026-10-27) layered on top of the existing digest —
  // every other day behaves exactly as before.
  const isMonday = now.getUTCDay() === 1;

  try {
    let query = supabase
      .from("user_preferences")
      .select("user_id, commodities, regions, forex_pairs, min_severity")
      .not("onboarding_completed_at", "is", null)
      .eq("digest_enabled", true);
    if (opts?.onlyUserIds?.length) query = query.in("user_id", opts.onlyUserIds);

    const { data: prefs, error } = await query;
    if (error) {
      errorText = error.message;
      console.error("[digest] preferences query failed:", error.message);
      return result;
    }

    // #146 — demo/prospect accounts must never enter digest eligible/sent counts
    // or generate bounce traffic to unused mailboxes.
    const { data: testRows, error: testErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_test_account", true);
    if (testErr) {
      errorText = testErr.message;
      console.error("[digest] is_test_account filter failed:", testErr.message);
      return result;
    }
    const testIds = new Set((testRows ?? []).map((r) => r.id as string));
    const realPrefs = (prefs ?? []).filter((p) => !testIds.has(p.user_id));

    result.eligible = realPrefs.length;
    if (realPrefs.length === 0) return result;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bluebeaconresearch.com";

    // Resolve recipient emails once.
    const emailById = new Map<string, string>();
    const { data: userPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    for (const u of userPage?.users ?? []) if (u.email) emailById.set(u.id, u.email);

    for (const pref of realPrefs as PrefRow[]) {
      const to = emailById.get(pref.user_id);
      if (!to) {
        result.failed += 1;
        continue;
      }

      const commodities = Array.isArray(pref.commodities) ? pref.commodities : [];
      const weekAheadEvents = isMonday ? weekAhead(commodities, now) : [];

      const signals = await selectDigestSignalsForUser(pref, now);
      if (signals.length === 0) {
        if (weekAheadEvents.length === 0) {
          result.skippedNoSignals += 1;
          continue;
        }
        // Monday, nothing matched the watchlist, but there's a scheduled
        // release this week for the user's commodities — send a calendar-only
        // email instead of skipping. Counted in `sent` (no separate field):
        // it's still a sent digest for this user today.
        const { subject, html, text } = renderWeekAheadOnlyEmail(weekAheadEvents, appUrl);
        if (opts?.dryRun) {
          console.log(`[digest] DRY RUN (week-ahead only) → ${to} (${weekAheadEvents.length} events)`);
          result.sent += 1;
          continue;
        }
        try {
          const res = await email.send({
            to,
            subject,
            html,
            text,
            headers: { "List-Unsubscribe": `<${appUrl}/settings>` },
          });
          if (res.sent) {
            result.sent += 1;
            console.log(`[digest] sent week-ahead-only to ${to} (${weekAheadEvents.length} events) id=${res.id}`);
          } else {
            result.failed += 1;
            console.warn(`[digest] week-ahead-only not sent to ${to}: ${res.reason}`);
          }
        } catch (e) {
          result.failed += 1;
          console.error(`[digest] week-ahead-only send threw for ${to}:`, e instanceof Error ? e.message : e);
        }
        continue;
      }
      const sources = await sourceUrlsFor(signals);
      const { subject, html, text } = renderDigestEmail(signals, pref, sources, appUrl, weekAheadEvents, now);

      if (opts?.dryRun) {
        console.log(`[digest] DRY RUN → ${to} (${signals.length} signals)`);
        result.sent += 1;
        continue;
      }

      try {
        const res = await email.send({
          to,
          subject,
          html,
          text,
          headers: { "List-Unsubscribe": `<${appUrl}/settings>` },
        });
        if (res.sent) {
          result.sent += 1;
          console.log(`[digest] sent to ${to} (${signals.length} signals) id=${res.id}`);
          // Only on a confirmed real send — never on a dry run or a failed/throwing
          // send — so a budget-deferred signal keeps retrying tomorrow's digest
          // until it has actually gone out once.
          await clearDeferredDigestFlags(pref.user_id, signals.map((s) => s.id));
        } else {
          result.failed += 1;
          console.warn(`[digest] not sent to ${to}: ${res.reason}`);
        }
      } catch (e) {
        result.failed += 1;
        console.error(`[digest] send threw for ${to}:`, e instanceof Error ? e.message : e);
      }
    }

    return result;
  } finally {
    await recordDigestSendLog(result, errorText);
  }
}
