import type { FastifyInstance } from "fastify";

export const COMMODITIES = [
  { symbol: "USOIL", label: "WTI Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "UKOIL", label: "Brent Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "XAUUSD", label: "Gold", unit: "USD/oz", category: "metals" },
  { symbol: "WHEAT", label: "Wheat", unit: "USc/bu", category: "agriculture" },
  { symbol: "NGAS", label: "Natural Gas", unit: "USD/MMBtu", category: "energy" },
  { symbol: "CORN", label: "Corn", unit: "USc/bu", category: "agriculture" },
  { symbol: "EURUSD", label: "EUR/USD", unit: "", category: "fx" },
  { symbol: "USDRUB", label: "USD/RUB", unit: "", category: "fx" },
  // COPPER / XAGUSD / USDINR added W7-ASSET-LISTS (2026-10-05, founder decision
  // Oct 5, D2a): classifier already tags COPPER/XAGUSD (W7-ASSETS-COPPER-SILVER,
  // b24f88e) and price-syncer.ts already syncs all three, but this route's list
  // was never updated so the UI had no way to filter by them.
  { symbol: "COPPER", label: "Copper", unit: "USD/lb", category: "metals" },
  { symbol: "XAGUSD", label: "Silver", unit: "USD/oz", category: "metals" },
  { symbol: "USDINR", label: "USD/INR", unit: "", category: "fx" },
] as const;

export async function commoditiesRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    return reply.send({ data: COMMODITIES });
  });
}

