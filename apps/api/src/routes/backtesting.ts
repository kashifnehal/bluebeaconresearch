import type { FastifyInstance } from "fastify";
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

function mockResult(p: z.infer<typeof schema>): Result {
  const totalEvents = 18;
  const accuracyPct = 71;
  const avgMovePct = 3.2;
  const maxMovePct = 9.1;
  const minMovePct = -6.4;
  const now = Date.now();

  const countries = ["Yemen", "Ukraine", "Sudan", "Iran", "Nigeria"];

  const points = Array.from({ length: totalEvents }).map((_, i) => ({
    severity: 5 + (i % 5),
    movePct: (Math.sin(i / 2) * 4 + (i % 2 ? 1.2 : -0.7)) as number,
    summary: `${p.eventType} impact case #${i + 1}`,
    date: new Date(now - i * 86400000 * 6).toISOString().slice(0, 10),
    country: countries[i % countries.length],
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

export async function backtestingRoutes(app: FastifyInstance) {
  app.post("/", async (req, reply) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", issues: parsed.error.issues });
    }

    // Bootstrap mode: return deterministic mock results quickly.
    // Real implementation would require historical data access and longer execution + job queue.
    const value = mockResult(parsed.data);
    return reply.send(value);
  });
}

