export const COMMODITIES = [
  { symbol: "USOIL", label: "WTI Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "UKOIL", label: "Brent Crude", unit: "USD/bbl", category: "energy" },
  { symbol: "XAUUSD", label: "Gold", unit: "USD/oz", category: "metals" },
  { symbol: "WHEAT", label: "Wheat", unit: "USc/bu", category: "agriculture" },
  {
    symbol: "NGAS",
    label: "Natural Gas",
    unit: "USD/MMBtu",
    category: "energy",
  },
  { symbol: "CORN", label: "Corn", unit: "USc/bu", category: "agriculture" },
  { symbol: "EURUSD", label: "EUR/USD", unit: "", category: "fx" },
  { symbol: "USDRUB", label: "USD/RUB", unit: "", category: "fx" },
] as const;

export const REGIONS = [
  { id: "middle-east", label: "Middle East", emoji: "🌍" },
  { id: "eastern-europe", label: "Eastern Europe", emoji: "🌍" },
  { id: "africa", label: "Africa", emoji: "🌍" },
  { id: "asia-pacific", label: "Asia-Pacific", emoji: "🌏" },
  { id: "americas", label: "Americas", emoji: "🌎" },
] as const;

export const SEVERITY_CONFIG = {
  10: { label: "Critical", color: "#EF4444", bgColor: "#2D1B1B" },
  9: { label: "Extreme", color: "#F97316", bgColor: "#2D1B10" },
  8: { label: "High", color: "#F59E0B", bgColor: "#2D2210" },
  7: { label: "Elevated", color: "#EAB308", bgColor: "#2D2610" },
} as const;

