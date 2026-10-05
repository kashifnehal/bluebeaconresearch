/**
 * Pure add/remove toggle for a symbol inside a watchlist array. Adding checks
 * membership first so a double-click (or a stale re-render) can never insert
 * a duplicate; removing filters every occurrence of the symbol, so even a
 * pre-existing duplicate is fully cleared in one toggle.
 */
export function toggleWatchlistSymbol(current: string[], symbol: string): string[] {
  return current.includes(symbol)
    ? current.filter((s) => s !== symbol)
    : [...current, symbol];
}
