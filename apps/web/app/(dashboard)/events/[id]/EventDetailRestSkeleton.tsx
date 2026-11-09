import { Skeleton } from "@/components/ui/skeleton";

// <Suspense> fallback for EventDetailRest (2026-11-09).
// Shown immediately in the same server-rendered first HTML, in place of the
// market-impact aside, the alert/share/record buttons, and the
// analysis/historical/map/sources/related tabs — all of which wait on the
// heavier GET /api/signals/[id] payload (outcomes, price baselines, related
// scoring) and stream in once that resolves. No network call lives here.
export function EventDetailRestSkeleton() {
  return (
    <div data-testid="event-detail-rest-skeleton">
      <div className="xl:float-right xl:w-[320px] mb-6 xl:mb-0">
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}
