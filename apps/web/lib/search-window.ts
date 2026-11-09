/**
 * Relevance search applies a default time window to the rows. The count the
 * caller shows has to use that same window. Matches outside it are reported
 * separately so the UI can offer to widen the window.
 */
export function searchWindowAgreement(
  windowedTotal: number,
  allTotal: number,
): { total: number; olderMatches: number } {
  const total = Math.max(0, windowedTotal);
  const olderMatches = Math.max(0, allTotal - total);
  return { total, olderMatches };
}
