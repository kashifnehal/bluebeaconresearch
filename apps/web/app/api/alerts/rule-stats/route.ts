import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError, apiErrorLogged } from "@/lib/api-response";

const TREND_WINDOW_DAYS = 14;

export type RuleStats = {
  ruleId: string;
  totalMatches: number;
  dailyCounts: { date: string; count: number }[];
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function GET(_req: NextRequest) {
  const clients = await getRouteSupabaseClients();
  if (!clients) {
    return apiError(500, "config_error");
  }
  // Same RLS-scoped-session pattern as alerts/recent and alert-rules — stays scoped to
  // the requesting user's own alerts_sent rows, not the service-role client.
  const { supabaseAuth, user } = clients;

  if (!user) {
    return NextResponse.json({ stats: [] });
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (TREND_WINDOW_DAYS - 1));
  since.setUTCHours(0, 0, 0, 0);

  // Two lightweight column-only queries (never full match/signal records) to build the
  // per-rule trend chart on /alerts: distinct-signal counts per rule for the fixed
  // 14-day window, plus an all-time distinct-signal total per rule for the "not enough
  // history yet" gate. A signal can have multiple alerts_sent rows (one per delivery
  // channel), so both are deduped by signal_id to match "matches" as the alerts page
  // already defines it.
  const [windowResult, totalResult] = await Promise.all([
    supabaseAuth
      .from("alerts_sent")
      .select("rule_id, signal_id, created_at")
      .eq("user_id", user.id)
      .not("rule_id", "is", null)
      .gte("created_at", since.toISOString()),
    supabaseAuth
      .from("alerts_sent")
      .select("rule_id, signal_id")
      .eq("user_id", user.id)
      .not("rule_id", "is", null),
  ]);

  if (windowResult.error) return apiErrorLogged(500, "db_error", windowResult.error);
  if (totalResult.error) return apiErrorLogged(500, "db_error", totalResult.error);

  const totalSeenByRule = new Map<string, Set<string>>();
  for (const row of totalResult.data ?? []) {
    const ruleId = row.rule_id as string;
    const seen = totalSeenByRule.get(ruleId) ?? new Set<string>();
    seen.add(row.signal_id as string);
    totalSeenByRule.set(ruleId, seen);
  }

  const dayBuckets: string[] = [];
  for (let i = 0; i < TREND_WINDOW_DAYS; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    dayBuckets.push(dayKey(d.toISOString()));
  }

  const seenByRuleDay = new Map<string, Map<string, Set<string>>>();
  for (const row of windowResult.data ?? []) {
    const ruleId = row.rule_id as string;
    const day = dayKey(row.created_at as string);
    let byDay = seenByRuleDay.get(ruleId);
    if (!byDay) {
      byDay = new Map();
      seenByRuleDay.set(ruleId, byDay);
    }
    const seen = byDay.get(day) ?? new Set<string>();
    seen.add(row.signal_id as string);
    byDay.set(day, seen);
  }

  const ruleIds = new Set<string>([...totalSeenByRule.keys(), ...seenByRuleDay.keys()]);
  const stats: RuleStats[] = Array.from(ruleIds).map((ruleId) => ({
    ruleId,
    totalMatches: totalSeenByRule.get(ruleId)?.size ?? 0,
    dailyCounts: dayBuckets.map((date) => ({
      date,
      count: seenByRuleDay.get(ruleId)?.get(date)?.size ?? 0,
    })),
  }));

  return NextResponse.json({ stats });
}
