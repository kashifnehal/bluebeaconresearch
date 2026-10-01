// Shared loop for the "page with .range() until a short page comes back" pattern
// already proven in apps/web/app/api/signals/driver-breakdown/route.ts
// (fetchImpactRows) and apps/web/lib/signal-outcomes-server.ts
// (fetchSignalOutcomeRows) — this is the only way to get a true complete result
// set past PostgREST's default per-request row cap. Callers supply the actual
// `.range(from, to)` query as a closure so this stays storage-agnostic and
// testable without mocking a Supabase client.
export type PagedRangeResult<T> = { rows: T[]; error: string | null };

export async function fetchAllRangedRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<PagedRangeResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      return { rows, error: error.message };
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { rows, error: null };
}
