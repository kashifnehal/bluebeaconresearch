// CFTC Disaggregated Futures Only contract map. Codes were read from
// https://publicreporting.cftc.gov/resource/72hh-3qpy.json on 2026-10-17.
// A symbol is included only when exactly one Futures Only contract is a clear
// match for that BBR registry entry. FX and unmatched commodities are omitted.

export type CotContract = {
  symbol: string;
  contractMarketCode: string;
};

export const COT_CONTRACTS: readonly CotContract[] = [
  // WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE
  { symbol: "USOIL", contractMarketCode: "067651" },
  // BRENT LAST DAY - NEW YORK MERCANTILE EXCHANGE
  { symbol: "UKOIL", contractMarketCode: "06765T" },
  // NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE
  { symbol: "NGAS", contractMarketCode: "023651" },
  // GOLD - COMMODITY EXCHANGE INC.
  { symbol: "XAUUSD", contractMarketCode: "088691" },
  // SILVER - COMMODITY EXCHANGE INC.
  { symbol: "XAGUSD", contractMarketCode: "084691" },
  // COPPER- #1 - COMMODITY EXCHANGE INC.
  { symbol: "COPPER", contractMarketCode: "085692" },
  // WHEAT-SRW - CHICAGO BOARD OF TRADE
  { symbol: "WHEAT", contractMarketCode: "001602" },
  // CORN - CHICAGO BOARD OF TRADE
  { symbol: "CORN", contractMarketCode: "002602" },
];

export const COT_CONTRACT_BY_CODE: ReadonlyMap<string, CotContract> = new Map(
  COT_CONTRACTS.map((c) => [c.contractMarketCode, c]),
);

export function cotContractCodes(): string[] {
  return COT_CONTRACTS.map((c) => c.contractMarketCode);
}
