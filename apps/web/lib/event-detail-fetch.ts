/**
 * 20000 ms limit for the event page fetch.
 * Engineering choice with no outside source.
 */
export const EVENT_DETAIL_FETCH_TIMEOUT_MS = 20_000;

export const EVENT_DETAIL_SLOW_MESSAGE =
  "This is taking longer than usual. The data service is slow right now.";

export type EventDetailFailure = "timeout" | "fetch_failed" | "not_found";

export type EventDetailNotice = {
  failure: EventDetailFailure | null;
  message: string | null;
  degradedLine: string | null;
  hideHistorical: boolean;
  hideRelated: boolean;
};

/** Maps a failed event fetch, or a degraded response, to the line the page shows. */
export function eventDetailNotice(
  error: { message?: string } | null,
  degraded: readonly string[],
): EventDetailNotice {
  const code = error?.message;
  const failure: EventDetailFailure | null =
    code === "timeout" || code === "fetch_failed" || code === "not_found"
      ? code
      : error
        ? "fetch_failed"
        : null;

  return {
    failure,
    message:
      failure === "timeout" || failure === "fetch_failed" ? EVENT_DETAIL_SLOW_MESSAGE : null,
    degradedLine:
      degraded.length > 0
        ? `Some sections are still loading slowly: ${degraded.join(", ")}.`
        : null,
    hideHistorical: degraded.includes("historical"),
    hideRelated: degraded.includes("related"),
  };
}
