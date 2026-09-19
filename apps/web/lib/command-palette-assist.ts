export const SEARCH_ASSIST_MIN_QUERY = 2;
export const SEARCH_ASSIST_RESULT_CAP = 2;

/** Fire the RAG fallback only after the existing palette search has settled
 * with fewer than SEARCH_ASSIST_RESULT_CAP hits. Never on each keystroke. */
export function shouldFetchSearchAssist(opts: {
  open: boolean;
  trimmedQuery: string;
  debouncedQuery: string;
  deterministicCount: number;
  signalsFetching: boolean;
}): boolean {
  if (!opts.open) return false;
  if (opts.trimmedQuery.length < SEARCH_ASSIST_MIN_QUERY) return false;
  if (opts.debouncedQuery.length < SEARCH_ASSIST_MIN_QUERY) return false;
  if (opts.debouncedQuery !== opts.trimmedQuery) return false;
  if (opts.signalsFetching) return false;
  return opts.deterministicCount < SEARCH_ASSIST_RESULT_CAP;
}
