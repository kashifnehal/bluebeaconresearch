/**
 * A price change is never shown by colour alone: it always carries an arrow and
 * the word "up", "down" or "flat" next to the figure.
 */
export type PriceChangeParts = {
  direction: "up" | "down" | "flat";
  arrow: string;
  word: string;
  /** Absolute value with a fixed number of decimals, e.g. "1.2%". */
  figure: string;
  /** "↑ up 1.2%" */
  text: string;
};

export function priceChangeParts(pct: number, decimals = 1): PriceChangeParts {
  const rounded = Number(Math.abs(pct).toFixed(decimals));
  const direction = rounded === 0 ? "flat" : pct > 0 ? "up" : "down";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  const figure = `${rounded.toFixed(decimals)}%`;
  return { direction, arrow, word: direction, figure, text: `${arrow} ${direction} ${figure}` };
}

export function priceChangeColor(direction: PriceChangeParts["direction"]): string {
  return direction === "up" ? "var(--price-up)" : direction === "down" ? "var(--price-down)" : "var(--text-muted)";
}
