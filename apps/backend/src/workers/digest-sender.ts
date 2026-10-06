import { getSupabaseAdmin } from "../clients/supabase.js";
import { EmailService } from "../services/email.service.js";
import { tokenize, jaccardSimilarity } from "./signal-merge.js";

const supabase = getSupabaseAdmin();
const email = new EmailService();

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

const DIRECTION_ARROW: Record<string, string> = { up: "↑", down: "↓", volatile: "↕", neutral: "→" };

const TRUST_LINE =
  "Blue Beacon surfaces signals for your own analysis — informational only, not financial advice or a buy/sell call.";

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

const SIGNAL_COLUMNS =
  "id, title, summary, ai_analysis, severity, region, commodity_impacts, currency_pair_impacts, raw_event_ids, event_date, created_at";

/**
 * Signals the alert-dispatcher's per-user daily budget deferred (decided 2026-10-02)
 * for this user — `alerts_sent` rows with status "deferred" and
 * deferred_to_digest still true. These bypass the normal preference/time-window
 * filter below: the user already cleared an alert_rules match for them, so they
 * belong in the digest regardless of whether they also happen to fall in the last
 * 24h or match the OR-filter this function otherwise builds.
 */
async function deferredSignalsForUser(userId: string): Promise<SignalRow[]> {
  const { data: deferredRows, error: deferredErr } = await supabase
    .from("alerts_sent")
    .select("signal_id")
    .eq("user_id", userId)
    .eq("status", "deferred")
    .eq("deferred_to_digest", true);
  if (deferredErr || !deferredRows?.length) return [];

  const signalIds = [...new Set(deferredRows.map((r) => r.signal_id as string))];
  const { data, error } = await supabase.from("signals").select(SIGNAL_COLUMNS).in("id", signalIds);
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
 * alert-dispatcher budget deferred for this user (decided 2026-10-02), which
 * bypasses the diversity pick entirely since the user already cleared a real
 * alert_rules match for it. Returns [] when the user has no preferences and
 * nothing was deferred (the digest is genuinely personalized — no global top-5
 * fallback).
 */
export async function selectDigestSignalsForUser(pref: PrefRow): Promise<SignalRow[]> {
  const regions = Array.isArray(pref.regions) ? pref.regions : [];
  const commodities = Array.isArray(pref.commodities) ? pref.commodities : [];
  const forexPairs = Array.isArray(pref.forex_pairs) ? pref.forex_pairs : [];

  const deferred = await deferredSignalsForUser(pref.user_id);

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
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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

async function sourceUrlsFor(signals: SignalRow[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(signals.flatMap((s) => (Array.isArray(s.raw_event_ids) ? s.raw_event_ids : [])))];
  const byRawEvent = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from("raw_events").select("id, raw_data").in("id", ids);
    for (const re of data ?? []) {
      const url = (re as any).raw_data?.url;
      if (typeof url === "string" && url) byRawEvent.set((re as any).id, url);
    }
  }
  const out = new Map<string, string[]>();
  for (const s of signals) {
    const urls = (s.raw_event_ids ?? [])
      .map((id) => byRawEvent.get(id))
      .filter((u): u is string => Boolean(u))
      .slice(0, 2);
    out.set(s.id, urls);
  }
  return out;
}

function renderText(signals: SignalRow[], pref: PrefRow, sources: Map<string, string[]>): string {
  const blocks = signals.map((s, i) => {
    const impacts = [
      ...(Array.isArray(s.commodity_impacts) ? s.commodity_impacts : []),
      ...(Array.isArray(s.currency_pair_impacts) ? s.currency_pair_impacts : []),
    ];
    const instruments = impacts.length
      ? impacts.map((c) => `${c.asset} ${DIRECTION_ARROW[c.direction ?? "neutral"] ?? "→"}`).join("  ·  ")
      : "No specific instruments were flagged.";
    const why = s.ai_analysis
      ? leadSentence(String(s.ai_analysis))
      : `${s.summary ?? "No summary available."} (Deeper analyst commentary wasn't available for this signal.)`;
    const src = sources.get(s.id) ?? [];
    return [
      `${i + 1}. EVENT: ${s.title}`,
      `   WHY IT MATTERS: ${why}`,
      `   WHICH INSTRUMENTS: ${instruments}`,
      `   ALERT THRESHOLD: severity ${s.severity} — matched ${whichWatchMatched(s, pref)}`,
      ...(src.length ? [`   SOURCE: ${src.join("  ")}`] : []),
    ].join("\n");
  });
  return [
    `Your Blue Beacon digest — top ${signals.length} from the last 24 hours, ranked by severity,`,
    `filtered to the regions, commodities, and forex pairs you follow.`,
    ``,
    blocks.join("\n\n"),
    ``,
    TRUST_LINE,
    ``,
    `Turn this digest off anytime in Settings → Notifications.`,
  ].join("\n");
}

function renderHtml(signals: SignalRow[], pref: PrefRow, sources: Map<string, string[]>, appUrl: string): string {
  const section = (step: number, label: string, body: string) =>
    `<tr><td style="padding:6px 0;border-top:1px solid #eee;">
       <div style="font:700 10px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#3aa981;">${step} · ${label}</div>
       <div style="font:400 14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;margin-top:3px;">${body}</div>
     </td></tr>`;

  const cards = signals
    .map((s) => {
      const impacts = [
        ...(Array.isArray(s.commodity_impacts) ? s.commodity_impacts : []),
        ...(Array.isArray(s.currency_pair_impacts) ? s.currency_pair_impacts : []),
      ];
      const instruments = impacts.length
        ? impacts
            .map(
              (c) =>
                `<span style="display:inline-block;padding:2px 8px;margin:2px 4px 2px 0;border-radius:999px;background:#f1f5f9;font:600 12px monospace;color:#0f172a;">${esc(
                  c.asset ?? "",
                )} ${DIRECTION_ARROW[c.direction ?? "neutral"] ?? "→"}</span>`,
            )
            .join("")
        : `<em style="color:#6b7280;">No specific instruments were flagged.</em>`;
      const why = s.ai_analysis
        ? esc(leadSentence(String(s.ai_analysis)))
        : `${esc(s.summary ?? "No summary available.")}<br><span style="color:#9ca3af;font-style:italic;font-size:12px;">Deeper analyst commentary wasn't available for this signal — showing the event summary.</span>`;
      const src = sources.get(s.id) ?? [];
      const srcHtml = src.length
        ? `<tr><td style="padding:6px 0;border-top:1px solid #eee;font:400 12px/1.5 -apple-system,sans-serif;">
             <span style="font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;font-size:10px;">Built from</span><br>
             ${src.map((u) => `<a href="${esc(u)}" style="color:#2563eb;">${esc(u.replace(/^https?:\/\//, "").slice(0, 70))}</a>`).join("<br>")}
           </td></tr>`
        : "";
      return `<table role="presentation" width="100%" style="margin:0 0 18px;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;">
        ${section(1, "Event", `<a href="${appUrl}/events/${s.id}" style="color:#0f172a;font-weight:700;text-decoration:none;">${esc(s.title)}</a>`)}
        ${section(2, "Why it matters", why)}
        ${section(3, "Which instruments", instruments)}
        ${section(4, "Alert threshold", `Severity ${s.severity} — matched <strong>${esc(whichWatchMatched(s, pref))}</strong>`)}
        ${srcHtml}
      </table>`;
    })
    .join("");

  return `<div style="max-width:600px;margin:0 auto;padding:24px 16px;background:#ffffff;">
    <div style="font:800 20px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">Your Blue Beacon digest</div>
    <div style="font:400 13px/1.5 -apple-system,sans-serif;color:#6b7280;margin:4px 0 20px;">
      Top ${signals.length} from the last 24 hours, ranked by severity, filtered to the regions, commodities, and forex pairs you follow.
    </div>
    ${cards}
    <div style="font:400 11px/1.5 -apple-system,sans-serif;color:#9ca3af;border-top:1px solid #eee;padding-top:12px;">
      ${TRUST_LINE}<br><br>
      You're receiving this because the daily digest is on for your account.
      <a href="${appUrl}/settings" style="color:#6b7280;">Turn it off in Settings → Notifications</a>.
    </div>
  </div>`;
}

/** Build the {subject, html, text} for one user's digest. Exported for tests/verification. */
export function renderDigestEmail(
  signals: SignalRow[],
  pref: PrefRow,
  sources: Map<string, string[]>,
  appUrl: string,
): { subject: string; html: string; text: string } {
  return {
    subject: `Blue Beacon digest — ${signals[0].title.slice(0, 60)}${
      signals.length > 1 ? ` +${signals.length - 1} more` : ""
    }`,
    html: renderHtml(signals, pref, sources, appUrl),
    text: renderText(signals, pref, sources),
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

/**
 * #83 — once-daily personalized digest. Scheduled from workers.ts alongside the
 * existing collectors' cron. For every user who finished onboarding and hasn't opted
 * out, sends their own top-5 signals from the last 24h (matched to their watchlist),
 * in the same Event → Why → Instruments → Threshold framing as the in-app Alerts card.
 */
export async function runDigestOnce(opts?: { onlyUserIds?: string[]; dryRun?: boolean }): Promise<DigestRunResult> {
  const result: DigestRunResult = {
    eligible: 0,
    sent: 0,
    skippedNoSignals: 0,
    failed: 0,
    senderEnabled: email.enabled,
  };

  let query = supabase
    .from("user_preferences")
    .select("user_id, commodities, regions, forex_pairs, min_severity")
    .not("onboarding_completed_at", "is", null)
    .eq("digest_enabled", true);
  if (opts?.onlyUserIds?.length) query = query.in("user_id", opts.onlyUserIds);

  const { data: prefs, error } = await query;
  if (error) {
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
    const signals = await selectDigestSignalsForUser(pref);
    if (signals.length === 0) {
      result.skippedNoSignals += 1;
      continue;
    }
    const sources = await sourceUrlsFor(signals);
    const { subject, html, text } = renderDigestEmail(signals, pref, sources, appUrl);

    if (opts?.dryRun) {
      console.log(`[digest] DRY RUN → ${to} (${signals.length} signals)`);
      result.sent += 1;
      continue;
    }

    try {
      const res = await email.send({ to, subject, html, text });
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
}
