import { Anthropic } from "@anthropic-ai/sdk";
import { getEnv } from "../env.js";

export type ClassificationResult = {
  severity: number;
  confidence: number;
  commodityImpacts: Array<{
    asset: string;
    direction: "up" | "down" | "volatile" | "neutral";
    confidence: number;
  }>;
  isBreaking: boolean;
  summary: string;
  region: string;
};

export class ClaudeService {
  private client: Anthropic | null = null;

  private static readonly ALLOWED_COMMODITY_ASSETS = new Set([
    "USOIL",
    "UKOIL",
    "NGAS",
    "XAUUSD",
    "WHEAT",
    "CORN",
    "EURUSD",
    "USDRUB",
  ]);

  private getClient() {
    if (this.client) return this.client;
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) return null;
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return this.client;
  }

  async classifyEvent(
    rawEvent: Record<string, unknown>,
  ): Promise<ClassificationResult> {
    const client = this.getClient();
    const title = String(rawEvent.title ?? "New geopolitical event");
    const summaryText = String(rawEvent.summary ?? "");

    if (client) {
      try {
        const system =
          "You are a senior geopolitical risk analyst. Classify this news event for financial market impact.";
        const user =
          `Event: ${title}\n` +
          `Country: ${String(rawEvent.country ?? "")}\n` +
          `Type: ${String(rawEvent.event_type ?? "")}\n` +
          `Date: ${String(rawEvent.event_date ?? "")}\n\n` +
          `Return ONLY valid JSON (no markdown):\n` +
          `{\n` +
          `  "severity": integer between 1 and 10,\n` +
          `  "confidence": a float between 0.0 and 1.0 representing certainty,\n` +
          `  "commodityImpacts": [{ "asset": string, "direction": "up"|"down"|"volatile"|"neutral", "confidence": number }],\n` +
          `  "isBreaking": boolean,\n` +
          `  "summary": string (max 120 chars),\n` +
          `  "region": string\n` +
          `}`;

        const msg = await client.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 500,
          temperature: 0.2,
          system,
          messages: [{ role: "user", content: user }],
        });

        const text = msg.content
          .map((c) => (c.type === "text" ? c.text : ""))
          .join("")
          .trim();
        const jsonStart = text.indexOf("{");
        const jsonEnd = text.lastIndexOf("}");
        const raw =
          jsonStart >= 0 && jsonEnd >= 0
            ? text.slice(jsonStart, jsonEnd + 1)
            : text;
        console.log("[CLAUDE AI CLASSIFICATION SUCCESS]");
        const parsed = JSON.parse(raw) as ClassificationResult;
        parsed.commodityImpacts = this.sanitizeCommodityImpacts(
          parsed.commodityImpacts ?? [],
        );
        return parsed;
      } catch (err: any) {
        console.warn(
          `⚠️ [Claude AI Classifier] API error (${err.message}). Using intelligent heuristic fallback classifier.`,
        );
      }
    }

    return this.heuristicClassify(title, summaryText, rawEvent);
  }

  private heuristicClassify(
    title: string,
    summaryText: string,
    rawEvent: Record<string, unknown>,
  ): ClassificationResult {
    const text = (title + " " + summaryText).toLowerCase();

    // Severity Calculation
    let severity = 5;
    if (
      /war|invasion|nuclear|missile|heavy strike|airstrike|escalation|blockade/i.test(
        text,
      )
    ) {
      severity = 9;
    } else if (
      /sanction|embargo|oil spill|drone attack|explosion|military|opec/i.test(
        text,
      )
    ) {
      severity = 8;
    } else if (
      /tariff|trade war|recession|pipeline|tanker|strike|protest/i.test(text)
    ) {
      severity = 7;
    } else if (/tension|talks|negotiation|diplomat|election/i.test(text)) {
      severity = 6;
    }

    // Region Detection
    let region = "global";
    if (
      /iran|israel|middle east|gaza|yemen|red sea|hormuz|saudi|qatar|iraq|syria/i.test(
        text,
      )
    ) {
      region = "middle-east";
    } else if (/russia|ukraine|black sea|poland|belarus|europe/i.test(text)) {
      region = "eastern-europe";
    } else if (
      /china|taiwan|asia|pacific|japan|korea|south china sea/i.test(text)
    ) {
      region = "asia-pacific";
    } else if (
      /us|united states|fed|dollar|america|mexico|brazil/i.test(text)
    ) {
      region = "americas";
    } else if (/sudan|ethiopia|nigeria|africa|congo/i.test(text)) {
      region = "africa";
    }

    // Commodity Impacts
    const commodityImpacts: Array<{
      asset: string;
      direction: "up" | "down" | "volatile" | "neutral";
      confidence: number;
    }> = [];

    const isSafeHaven =
      /\b(gold|safe[- ]haven|safe haven asset|safe-haven asset)\b/i.test(text);
    const oilSignal =
      /\b(?:crude|opec|tanker|hormuz|pipeline|refinery|oil price|crude price|oil production|oil shipment|oil export|oil import|oil supply|oil demand)\b/i.test(
        text,
      );
    const gasSignal =
      /\b(?:natural gas|ng|lng|nord stream|pipeline|gas prices|gas supply|gas demand|gas export|gas import|gas fields?|gas shipments?)\b/i.test(
        text,
      );
    const wheatSignal =
      /\b(?:grain|wheat|corn|agriculture|food|black sea|crop|shipments?)\b/i.test(
        text,
      );

    if (oilSignal) {
      commodityImpacts.push({
        asset: "USOIL",
        direction: "up",
        confidence: 0.85,
      });
      commodityImpacts.push({
        asset: "UKOIL",
        direction: "up",
        confidence: 0.82,
      });
    }

    if (gasSignal) {
      commodityImpacts.push({
        asset: "NGAS",
        direction: "up",
        confidence: 0.8,
      });
    }

    if (isSafeHaven) {
      commodityImpacts.push({
        asset: "XAUUSD",
        direction: "up",
        confidence: 0.88,
      });
    }

    if (wheatSignal) {
      commodityImpacts.push({
        asset: "WHEAT",
        direction: "up",
        confidence: 0.75,
      });
    }

    const isBreaking =
      severity >= 8 || /breaking|urgent|just in|alert/i.test(text);

    // Compute dynamic confidence: more matching signal categories = higher certainty
    // Top-level confidence is the source/classification confidence while each impact
    // confidence is the market-impact confidence for that asset.
    let matchedCategories = 0;
    if (severity > 5) matchedCategories++;
    if (region !== "global") matchedCategories++;
    if (commodityImpacts.length > 1) matchedCategories++;
    if (isBreaking) matchedCategories++;
    if (rawEvent.country) matchedCategories++;
    const dynamicConfidence = Math.min(0.9, 0.55 + matchedCategories * 0.07);

    return {
      severity,
      confidence: parseFloat(dynamicConfidence.toFixed(2)),
      commodityImpacts: this.sanitizeCommodityImpacts(commodityImpacts),
      isBreaking,
      summary: title.slice(0, 120),
      region,
    };
  }

  private sanitizeCommodityImpacts(
    impacts: Array<{
      asset: string;
      direction: "up" | "down" | "volatile" | "neutral";
      confidence: number;
    }>,
  ) {
    return impacts.filter((impact) =>
      ClaudeService.ALLOWED_COMMODITY_ASSETS.has(impact.asset),
    );
  }

  async generateAnalysis(
    _signal: Record<string, unknown>,
    _context: { contextNotes: string[] },
  ) {
    const client = this.getClient();
    if (!client)
      return "AI intelligence briefing generated via Blue Beacon heuristic analysis engine.";

    try {
      const system =
        "You are a senior geopolitical intelligence analyst for a commodities trading firm. You write precise, actionable intelligence briefings.";
      const user = `Write a 5-8 sentence intelligence briefing for the following event.\n\n${JSON.stringify(_signal).slice(0, 6000)}`;

      const msg = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 800,
        temperature: 0.3,
        system,
        messages: [{ role: "user", content: user }],
      });

      return msg.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("")
        .trim();
    } catch {
      return `Geopolitical Signal Briefing: High-priority event detected in region ${_signal.region ?? "Global"}. Market volatility expected across impacted commodity benchmarks (${(_signal.commodityImpacts as any[])?.map((c) => c.asset).join(", ") || "Energy/Metals"}). Traders should monitor strategic chokepoints and policy responses.`;
    }
  }
}
