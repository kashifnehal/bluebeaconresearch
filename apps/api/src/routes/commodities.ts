import type { FastifyInstance } from "fastify";

const COMMODITIES = [
  { symbol: "USOIL", label: "WTI Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "UKOIL", label: "Brent Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "XAUUSD", label: "Gold", unit: "USD/oz", category: "metals" },
  { symbol: "WHEAT", label: "Wheat", unit: "USc/bu", category: "agriculture" },
  { symbol: "NGAS", label: "Natural Gas", unit: "USD/MMBtu", category: "energy" },
  { symbol: "CORN", label: "Corn", unit: "USc/bu", category: "agriculture" },
  { symbol: "EURUSD", label: "EUR/USD", unit: "", category: "fx" },
  { symbol: "USDRUB", label: "USD/RUB", unit: "", category: "fx" },
] as const;

export async function commoditiesRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    return reply.send({ data: COMMODITIES });
  });
}

