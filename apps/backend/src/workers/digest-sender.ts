import { getSupabaseAdmin } from "../clients/supabase.js";
import { EmailService } from "../services/email.service.js";

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

type PrefRow = {
  user_id: string;
  commodities: string[] | null;
  regions: string[] | null;
  min_severity: number | null;
};

type SignalRow = {
  id: string;
  title: string;
  summary: string | null;
  ai_analysis: string | null;
  severity: number;
  region: string | null;
  commodity_impacts: Array<{ asset?: string; direction?: string }> | null;
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

/**
 * Pull the last 24h of signals that overlap a single user's watched commodities /
 * regions, ranked by severity, top N. Returns [] when the user has no preferences
 * (the digest is genuinely personalized — no global top-5 fallback).
 */
export async function selectDigestSignalsForUser(pref: PrefRow): Promise<SignalRow[]> {
  const regions = Array.isArray(pref.regions) ? pref.regions : [];
  const commodities = Array.isArray(pref.commodities) ? pref.commodities : [];
  if (regions.length === 0 && commodities.length === 0) return [];

  const orParts: string[] = [];
  for (const rid of regions) {
    orParts.push(`region.eq.${rid}`);
    const label = REGION_LABEL[rid];
    if (label) orParts.push(`region.ilike.*${label}*`);
  }
  for (const sym of commodities) {
    if (/^[A-Z0-9]+$/.test(sym)) orParts.push(`commodity_impacts.cs.[{"asset":"${sym}"}]`);
  }
  if (orParts.length === 0) return [];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("signals")
    .select(
      "id, title, summary, ai_analysis, severity, region, commodity_impacts, raw_event_ids, event_date, created_at",
    )
    .eq("is_active", true)
    .gte("created_at", since)
    .or(orParts.join(","))
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(DIGEST_LIMIT);

  if (error) {
    console.error("[digest] signal select failed:", error.message);
    return [];
  }
  return (data ?? []) as SignalRow[];
}

function whichWatchMatched(signal: SignalRow, pref: PrefRow): string {
  const hits: string[] = [];
  const impacts = Array.isArray(signal.commodity_impacts) ? signal.commodity_impacts : [];
  for (const sym of pref.commodities ?? []) {
    if (impacts.some((c) => c.asset === sym)) hits.push(sym);
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
    const impacts = Array.isArray(s.commodity_impacts) ? s.commodity_impacts : [];
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
    `filtered to the regions and commodities you follow.`,
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
      const impacts = Array.isArray(s.commodity_impacts) ? s.commodity_impacts : [];
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
      Top ${signals.length} from the last 24 hours, ranked by severity, filtered to the regions and commodities you follow.
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
    .select("user_id, commodities, regions, min_severity")
    .not("onboarding_completed_at", "is", null)
    .eq("digest_enabled", true);
  if (opts?.onlyUserIds?.length) query = query.in("user_id", opts.onlyUserIds);

  const { data: prefs, error } = await query;
  if (error) {
    console.error("[digest] preferences query failed:", error.message);
    return result;
  }
  result.eligible = prefs?.length ?? 0;
  if (!prefs || prefs.length === 0) return result;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bluebeaconresearch.com";

  // Resolve recipient emails once.
  const emailById = new Map<string, string>();
  const { data: userPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  for (const u of userPage?.users ?? []) if (u.email) emailById.set(u.id, u.email);

  for (const pref of prefs as PrefRow[]) {
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
