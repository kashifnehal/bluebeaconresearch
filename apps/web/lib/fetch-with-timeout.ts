/** 20000 ms is an engineering choice with no outside source. */
export const FETCH_TIMEOUT_MS = 20_000;

export const DATA_SLOW_MESSAGE =
  "This is taking longer than usual. The data service is slow right now.";

export type FetchJsonOptions = Omit<RequestInit, "signal"> & {
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Called for a non-OK response. Return an Error to throw that code
   * (the event page uses this for not_found). Return null to throw fetch_failed.
   */
  statusError?: (res: Response) => Promise<Error | null> | Error | null;
};

export async function fetchJsonWithTimeout<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = FETCH_TIMEOUT_MS, signal: outer, statusError, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  outer?.addEventListener("abort", onOuterAbort);
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new Error("timeout");
      throw new Error("fetch_failed");
    }
    if (!res.ok) {
      const mapped = statusError ? await statusError(res) : null;
      throw mapped ?? new Error("fetch_failed");
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new Error("fetch_failed");
    }
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}

/** Body for GET /api/signals when the handler errors and has no cached payload. Status stays 200. */
export function emptySignalsErrorBody() {
  return { signals: [] as [], nextCursor: null, total: 0, degraded: true as const };
}
