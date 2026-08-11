import { createClient } from "@supabase/supabase-js";

export const HIGH_RELEVANCE_KEYWORDS = [
  "war", "conflict", "attack", "strike", "missile", "bomb", "explosion", "troops",
  "military", "sanction", "blockade", "invasion", "offensive", "airstrike", "ceasefire",
  "oil", "crude", "gas", "pipeline", "refinery", "opec", "hormuz", "energy", "fuel",
  "tariff", "embargo", "trade war", "inflation", "fed", "central bank", "recession",
  "iran", "russia", "ukraine", "china", "taiwan", "israel", "hamas", "houthi", "nato",
  "wheat", "grain", "gold", "copper", "shipping", "tanker", "suez", "red sea"
];

export const EXCLUDE_KEYWORDS = [
  "sports", "football", "soccer", "fifa", "nfl", "nba", "olympics",
  "celebrity", "music", "movie", "film", "award", "weather", "tourism"
];

function isRelevant(title: string, summary: string = ""): boolean {
  const text = (title + " " + summary).toLowerCase();
  if (EXCLUDE_KEYWORDS.some((kw) => text.includes(kw))) return false;
  return HIGH_RELEVANCE_KEYWORDS.some((kw) => text.includes(kw));
}

function heuristicClassify(title: string, summaryText: string) {
  const text = (title + " " + summaryText).toLowerCase();
  let severity = 5;
  if (/war|invasion|nuclear|missile|heavy strike|airstrike|escalation|blockade/i.test(text)) severity = 9;
  else if (/sanction|embargo|oil spill|drone attack|explosion|military|opec/i.test(text)) severity = 8;
  else if (/tariff|trade war|recession|pipeline|tanker|strike|protest/i.test(text)) severity = 7;
  else if (/tension|talks|negotiation|diplomat|election/i.test(text)) severity = 6;

  let region = "global";
  if (/iran|israel|middle east|gaza|yemen|red sea|hormuz|saudi|qatar|iraq|syria/i.test(text)) region = "middle-east";
  else if (/russia|ukraine|black sea|poland|belarus|europe/i.test(text)) region = "eastern-europe";
  else if (/china|taiwan|asia|pacific|japan|korea|south china sea/i.test(text)) region = "asia-pacific";
  else if (/us|united states|fed|dollar|america|mexico|brazil/i.test(text)) region = "americas";
  else if (/sudan|ethiopia|nigeria|africa|congo/i.test(text)) region = "africa";

  const commodityImpacts: Array<{ asset: string; direction: "up" | "down" | "volatile" | "neutral"; confidence: number }> = [];
  if (/oil|crude|opec|tanker|hormuz|pipeline|refinery|energy/i.test(text)) {
    commodityImpacts.push({ asset: "USOIL", direction: "up", confidence: 0.85 });
    commodityImpacts.push({ asset: "UKOIL", direction: "up", confidence: 0.82 });
  }
  if (/gas|nord stream|lng|pipeline/i.test(text)) {
    commodityImpacts.push({ asset: "NGAS", direction: "up", confidence: 0.80 });
  }
  if (/war|conflict|missile|attack|sanction|gold|safe haven/i.test(text)) {
    commodityImpacts.push({ asset: "XAUUSD", direction: "up", confidence: 0.88 });
  }
  if (/grain|wheat|corn|agriculture|food|black sea/i.test(text)) {
    commodityImpacts.push({ asset: "WHEAT", direction: "up", confidence: 0.75 });
  }
  if (commodityImpacts.length === 0) {
    commodityImpacts.push({ asset: "USOIL", direction: "volatile", confidence: 0.50 });
  }

  const isBreaking = severity >= 8 || /breaking|urgent|just in|alert/i.test(text);
  let matchedCategories = 0;
  if (severity > 5) matchedCategories++;
  if (region !== "global") matchedCategories++;
  if (commodityImpacts.length > 1) matchedCategories++;
  if (isBreaking) matchedCategories++;

  return {
    severity,
    confidence: parseFloat(Math.min(0.90, 0.55 + matchedCategories * 0.07).toFixed(2)),
    commodityImpacts,
    isBreaking,
    summary: title.slice(0, 120),
    region,
  };
}

let lastIngestTime = 0;

export async function autoIngestIfStale() {
  // Rate limit inline auto-ingest to once every 10 minutes max per server instance
  if (Date.now() - lastIngestTime < 10 * 60 * 1000) return;
  lastIngestTime = Date.now();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const newsApiKey = process.env.GNEWS_API_KEY || process.env.NEWS_API_KEY || "0be0d72df15f0e7616dc4e67a2c8907b";

  if (!supabaseUrl || !serviceKey) return;

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const url = `https://gnews.io/api/v4/search?q=conflict+OR+war+OR+sanctions+OR+military+OR+oil&lang=en&max=5&sortby=publishedAt&token=${newsApiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const data = await res.json();
    const articles = data?.articles ?? [];

    for (const a of articles) {
      if (!a.url) continue;
      const externalId = `gnews-${Buffer.from(a.url).toString("base64").slice(0, 32)}`;
      const title = a.title?.slice(0, 280) ?? "GNews article";
      const summary = a.description?.slice(0, 1000) ?? "";

      if (!isRelevant(title, summary)) continue;

      const { data: existing } = await supabase.from("raw_events").select("id").eq("external_id", externalId).maybeSingle();
      if (existing?.id) continue;

      const eventDate = a.publishedAt ?? new Date().toISOString();
      const rawPayload = {
        source: "newsapi",
        external_id: externalId,
        title,
        summary: summary || null,
        country: null,
        lat: null,
        lng: null,
        event_type: "news",
        event_date: eventDate,
        raw_data: a,
      };

      const { data: insRaw, error: errRaw } = await supabase.from("raw_events").insert(rawPayload).select("id").maybeSingle();
      if (errRaw || !insRaw?.id) continue;

      const classification = heuristicClassify(title, summary);
      await supabase.from("signals").insert({
        raw_event_ids: [insRaw.id],
        title,
        summary: classification.summary,
        severity: classification.severity,
        confidence: classification.confidence,
        event_type: "news",
        country: "Global",
        region: classification.region,
        lat: null,
        lng: null,
        sources_count: 1,
        commodity_impacts: classification.commodityImpacts,
        is_breaking: classification.isBreaking,
        is_active: true,
        event_date: eventDate,
      });
    }
  } catch (err: any) {
    console.warn("⚠️ [AutoIngest] Inline ingestion warning:", err.message);
  }
}
