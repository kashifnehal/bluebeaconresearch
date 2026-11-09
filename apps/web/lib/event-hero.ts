import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { loadMediaImpactCaveats } from "@/lib/media-impact-watchlist";
import { serverTimingEnabled } from "@/lib/server-timing";
import {
  buildEventSources,
  computeFirstReportInfo,
  type RawEventRow,
} from "@/lib/event-sources";
import type { EventHeroProps } from "@/app/(dashboard)/events/[id]/EventHero";

// The event page's first HTML reads the signal row and the reports already
// linked to it (title, summary, severity, times, outlet name and link).
// The same client pair as GET /api/signals/:id: cookie session for the auth
// decision, service-role key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY)
// for the read after that decision. In production a missing user is
// unauthorized, matching that route's 401. In development a missing user
// still reads, matching that route. 2026-11-09.

export type EventHeroLoad =
  | { status: "ok"; hero: EventHeroProps; signalRowMs: number }
  | { status: "not_found"; signalRowMs: number }
  | { status: "unauthorized"; signalRowMs: number };

const SIGNAL_COLUMNS =
  "id, title, summary, severity, country, media_impact_entity, sources_count, created_at, updated_at, event_date, raw_event_ids";

type SignalHeroRow = {
  id: string;
  title: string;
  summary: string;
  severity: number;
  country: string | null;
  media_impact_entity: string | null;
  sources_count: number | null;
  created_at: string;
  updated_at: string | null;
  event_date: string | null;
  raw_event_ids: string[] | null;
};

export function toEventHeroProps(
  row: SignalHeroRow,
  rawEvents: RawEventRow[],
  mediaImpactCaveat: string | null,
): EventHeroProps {
  const sources = buildEventSources(rawEvents);
  const clock = computeFirstReportInfo(rawEvents, row.event_date);
  const entity =
    typeof row.media_impact_entity === "string" && row.media_impact_entity.trim()
      ? row.media_impact_entity
      : null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    country: row.country,
    mediaImpactEntity: entity,
    mediaImpactCaveat: entity ? mediaImpactCaveat : null,
    sourcesCount: row.sources_count ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sources,
    firstReportAt: clock.firstReportAt,
    firstReportKind: clock.firstReportKind,
    firstFetchedAt: clock.firstFetchedAt,
  };
}

export async function loadEventHero(id: string): Promise<EventHeroLoad> {
  const timingOn = serverTimingEnabled();
  const started = timingOn ? performance.now() : 0;
  const ms = () => (timingOn ? performance.now() - started : 0);

  const clients = await getRouteSupabaseClients({ verify: "claims" });
  if (!clients) {
    throw new Error("This page could not be loaded.");
  }
  if (!clients.user && process.env.NODE_ENV === "production") {
    return { status: "unauthorized", signalRowMs: ms() };
  }

  const { data, error } = await clients.supabase
    .from("signals")
    .select(SIGNAL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[events/:id] signal row:", error.message);
    throw new Error("This page could not be loaded.");
  }
  if (!data) return { status: "not_found", signalRowMs: ms() };

  const row = data as SignalHeroRow;
  const rawIds = row.raw_event_ids ?? [];
  let rawEvents: RawEventRow[] = [];
  if (rawIds.length > 0) {
    const raw = await clients.supabase
      .from("raw_events")
      .select("title, event_date, created_at, source, raw_data")
      .in("id", rawIds);
    if (raw.error) {
      console.error("[events/:id] linked reports:", raw.error.message);
    } else {
      rawEvents = (raw.data ?? []) as RawEventRow[];
    }
  }

  let caveat: string | null = null;
  const entity = row.media_impact_entity?.trim();
  if (entity) {
    const caveats = await loadMediaImpactCaveats(clients.supabase);
    caveat = caveats.get(entity) ?? null;
  }

  return {
    status: "ok",
    hero: toEventHeroProps(row, rawEvents, caveat),
    signalRowMs: ms(),
  };
}
