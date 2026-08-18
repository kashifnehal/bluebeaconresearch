import { Worker } from "bullmq";
import { z } from "zod";

import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { QUEUE_NAMES, buildQueues } from "../queues.js";
import { ClaudeService } from "../services/claude.service.js";
import { publishNewSignal } from "../workers/pubsub.js";

const classificationSchema = z.object({
  severity: z.number().int().min(1).max(10),
  confidence: z.number().min(0).max(1),
  commodityImpacts: z.array(
    z.object({
      asset: z.string().min(1),
      direction: z.enum(["up", "down", "volatile", "neutral"]),
      confidence: z.number().min(0).max(1),
    }),
  ),
  isBreaking: z.boolean(),
  summary: z.string().min(1).max(140),
  region: z.string().min(1),
});

const COUNTRY_CODES: Record<string, string> = {
  US: "United States", IR: "Iran", UA: "Ukraine", RU: "Russia",
  IL: "Israel", SA: "Saudi Arabia", CN: "China", SY: "Syria",
  IQ: "Iraq", AF: "Afghanistan", YE: "Yemen", LY: "Libya",
  SD: "Sudan", ET: "Ethiopia", IN: "India", PK: "Pakistan",
  GB: "United Kingdom", DE: "Germany", FR: "France", JP: "Japan",
  KR: "South Korea", TW: "Taiwan", TR: "Turkey", EG: "Egypt",
  QA: "Qatar", AE: "United Arab Emirates", KP: "North Korea",
  PL: "Poland", BY: "Belarus", VE: "Venezuela", CO: "Colombia",
  BR: "Brazil", MX: "Mexico", NG: "Nigeria", ZA: "South Africa",
};

export function formatCountryName(rawCountry?: string | null): string {
  if (!rawCountry || rawCountry.toUpperCase() === "UNKNOWN") return "Global";
  const upper = rawCountry.toUpperCase().trim();
  return COUNTRY_CODES[upper] || rawCountry;
}

export function startAiClassifierWorker() {
  const connection = getRedis();
  if (!connection) {
    console.warn("⚠️ [AI Classifier] Redis connection missing. Worker not started.");
    return null;
  }
  const supabase = getSupabaseAdmin();
  const claude = new ClaudeService();
  const queues = buildQueues();

  const worker = new Worker(
    QUEUE_NAMES.aiClassification,
    async (job) => {
      const rawEventId = job.data?.rawEventId as string | undefined;
      if (!rawEventId) throw new Error("Missing rawEventId");

      const { data: rawEvent, error } = await supabase.from("raw_events").select("*").eq("id", rawEventId).maybeSingle();
      if (error || !rawEvent) throw new Error("raw_event not found");

      // Check if a signal for this raw_event_id already exists to prevent duplicate creation
      const { data: existingSignal } = await supabase
        .from("signals")
        .select("id")
        .contains("raw_event_ids", [rawEventId])
        .maybeSingle();

      if (existingSignal?.id) {
        console.log(`[CLASSIFIER] Duplicate signal skipped for raw_event: ${rawEventId}`);
        return { signalId: existingSignal.id, duplicate: true };
      }

      const result = await claude.classifyEvent(rawEvent);
      const parsed = classificationSchema.safeParse(result);
      if (!parsed.success) {
        throw new Error("Invalid classification payload");
      }

      const r = parsed.data;
      const countryName = formatCountryName(rawEvent.country);

      const insert = await supabase.from("signals").insert({
        raw_event_ids: [rawEventId],
        title: rawEvent.title ?? "Untitled event",
        summary: r.summary,
        severity: r.severity,
        confidence: r.confidence,
        event_type: rawEvent.event_type ?? "unknown",
        country: countryName,
        region: r.region,
        lat: rawEvent.lat,
        lng: rawEvent.lng,
        sources_count: 1,
        commodity_impacts: r.commodityImpacts,
        is_breaking: r.isBreaking,
        is_active: true,
      }).select("id").maybeSingle();

      if (insert.error || !insert.data?.id) throw new Error("Failed to insert signal");
      const signalId = insert.data.id as string;

      // Dormant path: nothing currently enqueues jobs onto `aiClassification` (this
      // worker's own queue), so neither line below ever runs in the live system today.
      // The real collectors (rss/gnews/gdelt) and the reconciliation job call
      // generateSignalAnalysis() and dispatchAlertsForSignal() directly instead — see
      // signal-generator.ts and alert-dispatcher.ts. Kept as-is, reserved for a
      // possible future move back to a fully queued classify→generate→dispatch pipeline.
      if (r.severity >= 7) {
        await queues.signalGeneration.add("generate", { signalId }, { attempts: 3, backoff: { type: "exponential", delay: 1000 } });
      }
      await queues.alertDispatcher.add("dispatch", { signalId }, { attempts: 5, backoff: { type: "exponential", delay: 1000 } });

      await publishNewSignal({ signalId });

      return { signalId };
    },
    { connection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    job?.log(`failed: ${err.message}`).catch(() => {});
  });

  return worker;
}

