/**
 * Resolves with `fallback` when `work` does not settle within `ms`, or when it
 * rejects. The homepage is rendered per request (force-dynamic) and reads the
 * database three ways; on 2026-11-16 the database host stopped answering and
 * the public homepage waited with it (Vercel runtime logs: Cloudflare 522 from
 * the Supabase host while "/" kept revalidating). A visitor should get the
 * page without the live numbers, not a blank wait.
 *
 * The timeout value used by callers is a BBR working value with no published
 * source. The pending call is not cancelled; the response simply stops
 * waiting for it.
 */
export function withTimeoutOrFallback<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Longest the homepage waits for each database read. BBR working value, no published source. */
export const HOMEPAGE_DB_TIMEOUT_MS = 4000;
