import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError, apiErrorLogged } from "@/lib/api-response";

export type AlertSignalSource = {
  title: string;
  url: string | null;
  sourceLabel: string | null;
};

export async function GET(req: NextRequest) {
  const clients = await getRouteSupabaseClients();
  if (!clients) {
    return apiError(500, "config_error");
  }
  // Deliberately queries via supabaseAuth (the user's own RLS-scoped session) below,
  // not the service-role `supabase` client — alerts_sent access should stay scoped to
  // what the requesting user's own policy allows, per the RLS remediation decision
  // recorded in supabase/migrations/011_rls_remediation.sql.
  const { supabaseAuth, supabase, user } = clients;

  if (!user) {
    return NextResponse.json({ alerts: [], total: 0, hasMore: false });
  }

  // `limit` defaults to 10 to preserve NotificationPanel's existing behavior exactly;
  // the alerts page passes a higher value so it has enough history to group matches
  // per alert_rule rather than just the last 10 across all rules combined.
  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 10;

  // `offset` defaults to 0 — the alerts page pages forward with it to reach alerts
  // older than the first `limit` rows (audit #276: this route previously had no way
  // to see past its first page at all). Omitting it keeps every existing caller
  // (NotificationPanel's 10-row preview included) on exactly the same first page.
  const rawOffset = Number(req.nextUrl.searchParams.get("offset"));
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  // Real alerts_sent rows only — no fallback to raw signals relabeled as delivered
  // alerts. An empty result here means no alert_rules have matched anything yet, which
  // is a genuine "no alerts" state, not a gap to paper over.
  //
  // #82: the joined signal now also carries `ai_analysis` (the "why it matters"
  // section), `commodity_impacts` (the "which instruments" section) and
  // `raw_event_ids` so the card can link back to the source article(s) the signal
  // was built from.
  //
  // `count: "exact"` gives an authoritative total straight from Postgres (not a
  // row-limited estimate), so the "Showing N of total" text on the alerts page is
  // honest at any history size.
  const { data, error, count } = await supabaseAuth
    .from("alerts_sent")
    .select(
      "*, signals(id, title, severity, summary, ai_analysis, commodity_impacts, currency_pair_impacts, is_breaking, updated_at, country, region, event_type, event_date, confidence, raw_event_ids)",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return apiErrorLogged(500, "db_error", error);
  }

  const rows = data ?? [];
  const total = count ?? offset + rows.length;
  const hasMore = offset + rows.length < total;

  // Surface the source article(s) each matched signal was built from — already linked
  // through the ingestion pipeline via signals.raw_event_ids → raw_events.raw_data.url.
  // One batched lookup for every raw_event referenced across the whole result set.
  const rawEventIds = [
    ...new Set(
      rows.flatMap((r: any) => (Array.isArray(r.signals?.raw_event_ids) ? r.signals.raw_event_ids : [])),
    ),
  ] as string[];

  const sourcesByRawEventId = new Map<string, AlertSignalSource>();
  if (rawEventIds.length > 0) {
    const { data: rawEvents } = await supabase
      .from("raw_events")
      .select("id, title, raw_data")
      .in("id", rawEventIds);
    for (const re of rawEvents ?? []) {
      // `raw_data.source` isn't a consistent shape across collectors: NewsAPI/GNews write
      // it as an object (`{ id, name, url, country }`), while others write a plain string.
      // Coercing the object straight into a template literal renders "[object Object]".
      const rawSource = (re as any).raw_data?.source;
      const sourceLabel =
        (typeof rawSource === "string" ? rawSource : rawSource?.name) ??
        (re as any).raw_data?.domain ??
        null;
      sourcesByRawEventId.set(re.id, {
        title: (re as any).title ?? "Untitled source",
        url: (re as any).raw_data?.url ?? null,
        sourceLabel,
      });
    }
  }

  const alerts = rows.map((r: any) => {
    const ids: string[] = Array.isArray(r.signals?.raw_event_ids) ? r.signals.raw_event_ids : [];
    const sources = ids
      .map((id) => sourcesByRawEventId.get(id))
      .filter((s): s is AlertSignalSource => Boolean(s && s.url));
    return { ...r, signals: r.signals ? { ...r.signals, sources } : r.signals };
  });

  return NextResponse.json({ alerts, total, hasMore });
}
