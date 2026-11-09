import { cache } from "react";
import { NextRequest } from "next/server";
import { GET as getSignalDetail, type EventDetailResponse } from "@/app/api/signals/[id]/route";
import { serverTimingComment, serverTimingEnabled } from "@/lib/server-timing";
import { EventDetailClient } from "./EventDetailClient";

// The heavy half of the event page, rendered inside the page's <Suspense>
// boundary (2026-11-09). Calls the existing GET /api/signals/:id handler in
// this process — same 6 second optional-read budget, same timeout fallbacks,
// same auth check — instead of the browser fetching it after hydration.
// cookies() inside that handler reads this request, so the access rule stays
// the one the route already applies.

export type EventDetailLoad =
  | { ok: true; payload: EventDetailResponse; streamRestMs: number }
  | { ok: false; streamRestMs: number };

export const loadEventDetail = cache(async (id: string): Promise<EventDetailLoad> => {
  const timingOn = serverTimingEnabled();
  const started = timingOn ? performance.now() : 0;
  const req = new NextRequest(`http://internal.invalid/api/signals/${encodeURIComponent(id)}`);
  const res = await getSignalDetail(req, { params: Promise.resolve({ id }) });
  const streamRestMs = timingOn ? performance.now() - started : 0;
  if (res.status !== 200) return { ok: false, streamRestMs };
  const payload = (await res.json()) as EventDetailResponse;
  return { ok: true, payload, streamRestMs };
});

function timingMark(ms: number) {
  const comment = serverTimingComment("stream_rest", ms);
  if (!comment) return null;
  return <span className="hidden" dangerouslySetInnerHTML={{ __html: comment }} />;
}

export async function EventDetailRest({ id }: { id: string }) {
  const loaded = await loadEventDetail(id);
  if (!loaded.ok) {
    return (
      <div className="contents">
        {timingMark(loaded.streamRestMs)}
        <div
          className="min-w-0 xl:col-start-1 xl:row-start-2 max-w-2xl p-10 rounded-lg border-2 border-dashed border-border/40 text-center"
          data-testid="event-detail-rest-error"
        >
          <p className="text-[12px] md:text-[11px] font-bold text-muted uppercase tracking-widest leading-relaxed">
            Some sections of this event could not load. Please refresh the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="contents">
      {timingMark(loaded.streamRestMs)}
      <EventDetailClient data={loaded.payload} />
    </div>
  );
}
