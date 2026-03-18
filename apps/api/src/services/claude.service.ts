import { Anthropic } from "@anthropic-ai/sdk";

import { getEnv } from "../env";

export type ClassificationResult = {
  severity: number;
  confidence: number;
  commodityImpacts: Array<{ asset: string; direction: "up" | "down" | "volatile" | "neutral"; confidence: number }>;
  isBreaking: boolean;
  summary: string;
  region: string;
};

export class ClaudeService {
  private client: Anthropic | null = null;

  private getClient() {
    if (this.client) return this.client;
    const env = getEnv();
    if (!env.ANTHROPIC_API_KEY) return null;
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return this.client;
  }

  async classifyEvent(rawEvent: Record<string, unknown>): Promise<ClassificationResult> {
    const client = this.getClient();
    if (!client) {
      // Safe bootstrap mode: keep pipeline working without external AI.
      return {
        severity: 7,
        confidence: 0.55,
        commodityImpacts: [{ asset: "USOIL", direction: "volatile", confidence: 0.5 }],
        isBreaking: false,
        summary: String(rawEvent.title ?? "New conflict event").slice(0, 120),
        region: String(rawEvent.region ?? rawEvent.country ?? "global"),
      };
    }

    const system =
      "You are a geopolitical risk analyst. Classify this news event for financial market impact.";
    const user =
      `Event: ${String(rawEvent.title ?? "")}\n` +
      `Country: ${String(rawEvent.country ?? "")}\n` +
      `Type: ${String(rawEvent.event_type ?? "")}\n` +
      `Date: ${String(rawEvent.event_date ?? "")}\n\n` +
      `Return ONLY valid JSON (no markdown): ` +
      `{ "severity": number 1-10, "confidence": number 0.0-1.0, "commodityImpacts": [{ "asset": string, "direction": "up"|"down"|"volatile"|"neutral", "confidence": number }], "isBreaking": boolean, "summary": string (max 120 chars), "region": string }`;

    const msg = await client.messages.create({
      model: "claude-3-5-haiku-latest",
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
    const raw = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
    return JSON.parse(raw) as ClassificationResult;
  }

  async generateAnalysis(_signal: Record<string, unknown>, _context: { contextNotes: string[] }) {
    const client = this.getClient();
    if (!client) return "AI analysis will appear here once ANTHROPIC_API_KEY is configured.";

    const system =
      "You are a senior geopolitical intelligence analyst for a commodities trading firm. You write precise, actionable intelligence briefings.";
    const user = `Write a 5-8 sentence intelligence briefing for the following event.\n\n${JSON.stringify(_signal).slice(0, 6000)}`;

    const msg = await client.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 800,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: user }],
    });

    return msg.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  }
}

