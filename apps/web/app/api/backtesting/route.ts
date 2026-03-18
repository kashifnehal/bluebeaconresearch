import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  eventType: z.string().min(1),
  region: z.string().min(1),
  commodity: z.string().min(1),
  horizon: z.enum(["4hr", "24hr", "48hr", "7d"]),
  from: z.string().optional(),
  to: z.string().optional(),
});

type Result = {
  totalEvents: number;
  accuracyPct: number;
  avgMovePct: number;
  maxMovePct: number;
  minMovePct: number;
  points: Array<{ severity: number; movePct: number; summary: string; date: string; country: string }>;
  rows: Array<{ date: string; country: string; summary: string; movePct: number; correct: boolean }>;
};

const cache = new Map<string, { expiresAt: number; value: Result }>();

function cacheKey(p: z.infer<typeof schema>) {
  return `${p.eventType}|${p.region}|${p.commodity}|${p.horizon}|${p.from ?? ""}|${p.to ?? ""}`;
}

function mockResult(p: z.infer<typeof schema>): Result {
  const totalEvents = 14;
  const accuracyPct = 71;
  const avgMovePct = 3.2;
  const maxMovePct = 9.1;
  const minMovePct = -6.4;
  const now = Date.now();
  const points = Array.from({ length: totalEvents }).map((_, i) => ({
    severity: 6 + (i % 5),
    movePct: (Math.sin(i) * 4 + (i % 2 ? 1.2 : -0.7)) as number,
    summary: `${p.eventType} impact case #${i + 1}`,
    date: new Date(now - i * 86400000 * 13).toISOString().slice(0, 10),
    country: ["Yemen", "Ukraine", "Sudan", "Iran", "Nigeria"][i % 5],
  }));
  const rows = points.slice(0, 20).map((pt) => ({
    date: pt.date,
    country: pt.country,
    summary: pt.summary,
    movePct: pt.movePct,
    correct: pt.movePct > 0,
  }));
  return { totalEvents, accuracyPct, avgMovePct, maxMovePct, minMovePct, points, rows };
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const key = cacheKey(parsed.data);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return NextResponse.json(hit.value);

  const value = mockResult(parsed.data);
  cache.set(key, { value, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return NextResponse.json(value);
}

