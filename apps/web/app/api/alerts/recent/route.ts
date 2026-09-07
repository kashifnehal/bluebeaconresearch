import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-response";

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
    return NextResponse.json({ alerts: [] });
  }

  // `limit` defaults to 10 to preserve NotificationPanel's existing behavior exactly;
  // the alerts page passes a higher value so it has enough history to group matches
  // per alert_rule rather than just the last 10 across all rules combined.
  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 10;

  // Real alerts_sent rows only — no fallback to raw signals relabeled as delivered
  // alerts. An empty result here means no alert_rules have matched anything yet, which
  // is a genuine "no alerts" state, not a gap to paper over.
  //
  // #82: the joined signal now also carries `ai_analysis` (the "why it matters"
  // section), `commodity_impacts` (the "which instruments" section) and
  // `raw_event_ids` so the card can link back to the source article(s) the signal
  // was built from.
  const { data, error } = await supabaseAuth
    .from("alerts_sent")
    .select(
      "*, signals(id, title, severity, summary, ai_analysis, commodity_impacts, is_breaking, updated_at, country, region, event_type, event_date, confidence, raw_event_ids)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return apiError(500, "db_error", error.message);
  }

  const rows = data ?? [];

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
      sourcesByRawEventId.set(re.id, {
        title: (re as any).title ?? "Untitled source",
        url: (re as any).raw_data?.url ?? null,
        sourceLabel: (re as any).raw_data?.source ?? (re as any).raw_data?.domain ?? null,
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

  return NextResponse.json({ alerts });
}
