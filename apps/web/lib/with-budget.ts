/**
 * 6000 ms for each optional read, started together.
 * Engineering choice with no outside source.
 */
export const OPTIONAL_READ_BUDGET_MS = 6000;

/**
 * Stop waiting after `ms` and resolve `fallback`. The original call keeps
 * running. The timer is cleared when that call settles.
 */
export function withBudget<T>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  const tracked = Promise.resolve(promise).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
  void tracked.catch(() => {});
  return Promise.race([tracked, timeout]);
}
