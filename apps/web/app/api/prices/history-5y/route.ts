import { NextResponse, type NextRequest } from "next/server";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type History5yPayload = {
  symbol: string;
  yahooSymbol: string | null;
  interval: "1wk";
  requestedFrom: string;
  availableFrom: string | null;
  availableTo: string | null;
  incomplete: boolean;
  points: Array<{ price: number; fetchedAt: string }>;
};

function emptyPayload(symbol: string): History5yPayload {
  return {
    symbol,
    yahooSymbol: null,
    interval: "1wk",
    requestedFrom: new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString(),
    availableFrom: null,
    availableTo: null,
    incomplete: true,
    points: [],
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) {
    return apiError(400, "missing_symbol");
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    const rl = await rateLimitOrPass(`prices-history-5y:${ip}`);
    if (!rl.success) {
      return NextResponse.json(
        { ...emptyPayload(symbol), error: { code: "rate_limited", message: "rate_limited" } },
        { status: 429 },
      );
    }
  } catch (err) {
    console.warn("⚠️ [API Prices History 5y] Rate limit check failed, continuing:", err);
  }

  const apiBase = process.env.API_URL?.replace(/\/$/, "");
  if (!apiBase) {
    return NextResponse.json(emptyPayload(symbol));
  }

  try {
    const res = await fetch(`${apiBase}/v1/prices/history-5y/${encodeURIComponent(symbol)}`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as History5yPayload | null;
    if (!res.ok || !json || !Array.isArray(json.points)) {
      return NextResponse.json(emptyPayload(symbol));
    }
    return NextResponse.json(json);
  } catch (err) {
    console.warn("⚠️ [API Prices History 5y] Upstream fetch failed:", err);
    return NextResponse.json(emptyPayload(symbol));
  }
}
