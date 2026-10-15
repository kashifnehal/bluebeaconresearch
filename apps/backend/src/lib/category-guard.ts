import { recordServiceHealth, type RecordServiceHealthOptions } from "./service-health.js";

// P20 — Claude-classified signals are supposed to carry event_category. Zero
// missing rows is the natural line, because the prompt requires the field.
// A day with no Claude rows is a provider stop, not a category failure.
const DAY_MS = 24 * 60 * 60 * 1000;

export type CategoryGuardSupabase = {
  from: (table: string) => any;
};

async function writeOkOnce(
  supabase: CategoryGuardSupabase,
  now: Date,
  detail: string,
): Promise<void> {
  const dayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const { data, error } = await supabase
    .from("service_health_events")
    .select("id")
    .eq("service", "category-guard")
    .eq("status", "ok")
    .gte("created_at", dayStart)
    .limit(1);
  if (error) throw new Error(error.message ?? "category-guard health read failed");
  if (Array.isArray(data) && data.length > 0) return;
  await recordServiceHealth("category-guard", "ok", detail, undefined, {
    supabase: supabase as RecordServiceHealthOptions["supabase"],
  });
}

export async function checkCategoryCoverage(
  supabase: CategoryGuardSupabase,
  now: Date,
): Promise<void> {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const { data, error } = await supabase
    .from("signals")
    .select("event_category")
    .eq("classification_method", "claude")
    .gte("created_at", since);
  if (error) throw new Error(error.message ?? "signals category read failed");

  const rows = (data ?? []) as Array<{ event_category: string | null }>;
  const total = rows.length;
  if (total === 0) {
    await writeOkOnce(supabase, now, "no Claude-classified signals in 24h");
    return;
  }

  const missing = rows.filter((row) => row.event_category == null).length;
  if (missing > 0) {
    await recordServiceHealth(
      "category-guard",
      "degraded",
      `${missing} of ${total} Claude-classified signals have no category in 24h`,
      undefined,
      { supabase: supabase as RecordServiceHealthOptions["supabase"] },
    );
    return;
  }

  await writeOkOnce(
    supabase,
    now,
    `0 of ${total} Claude-classified signals have no category in 24h`,
  );
}
