import { NextResponse } from "next/server";
import { CONFIGURED_RSS_FEED_COUNT } from "@blue-beacon-research/shared";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-response";
import { outletFromRawEvent } from "@/lib/coverage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE = 1000;
const IN_CHUNK = 100;

export async function GET() {
  const clients = await getRouteSupabaseClients();
  if (!clients) {
    return apiError(500, "supabase-unconfigured");
  }

  const { supabase, user } = clients;
  if (!user && process.env.NODE_ENV === "production") {
    return apiError(401, "unauthorized");
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const rawEventIds: string[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("signals")
        .select("raw_event_ids")
        .gte("created_at", since)
        .range(from, from + PAGE - 1);
      if (error) {
        return apiError(500, "coverage-query-failed", error.message);
      }
      const rows = data ?? [];
      for (const row of rows) {
        const ids = row.raw_event_ids;
        if (Array.isArray(ids)) {
          for (const id of ids) {
            if (typeof id === "string") rawEventIds.push(id);
          }
        }
      }
      if (rows.length < PAGE) break;
    }

    const uniqueIds = [...new Set(rawEventIds)];
    const outlets = new Set<string>();

    for (let i = 0; i < uniqueIds.length; i += IN_CHUNK) {
      const chunk = uniqueIds.slice(i, i + IN_CHUNK);
      const { data, error } = await supabase
        .from("raw_events")
        .select("source, raw_data")
        .in("id", chunk);
      if (error) {
        return apiError(500, "coverage-query-failed", error.message);
      }
      for (const row of data ?? []) {
        const outlet = outletFromRawEvent(row);
        if (outlet) outlets.add(outlet);
      }
    }

    return NextResponse.json({
      sourcesLast24h: outlets.size,
      rssFeedCount: CONFIGURED_RSS_FEED_COUNT,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "coverage-query-failed";
    return apiError(500, "coverage-query-failed", message);
  }
}
