export type IdleCancel = () => void;

/**
 * Runs `fn` once the main thread is idle (requestIdleCallback), or after a
 * macrotask if that API isn't available (Safari, some test environments).
 * Used so background calls (the notification bell, the Telegram status
 * check, and the signal-viewed usage posts) wait until the main thread is
 * idle instead of starting with the page's own content. 2026-11-09.
 *
 * Returns a canceller; call it on unmount so a fast navigation away doesn't
 * fire the deferred call for a component that's no longer mounted.
 */
export function deferToIdle(fn: () => void, timeoutMs = 300): IdleCancel {
  if (typeof window === "undefined") {
    fn();
    return () => {};
  }
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") {
    const handle = ric(fn, { timeout: timeoutMs });
    const cic = (window as unknown as { cancelIdleCallback?: (h: number) => void })
      .cancelIdleCallback;
    return () => {
      if (typeof cic === "function") cic(handle);
    };
  }
  const handle = window.setTimeout(fn, 0);
  return () => window.clearTimeout(handle);
}
