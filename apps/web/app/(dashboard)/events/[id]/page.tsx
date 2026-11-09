import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { loadEventHero, type EventHeroLoad } from "@/lib/event-hero";
import { serverTimingComment } from "@/lib/server-timing";
import { EventHero } from "./EventHero";
import { EventDetailRest } from "./EventDetailRest";
import { EventDetailRestSkeleton } from "./EventDetailRestSkeleton";

export const dynamic = "force-dynamic";

type Deps = {
  loadHero?: (id: string) => Promise<EventHeroLoad>;
};

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return renderEventPage(id);
}

export async function renderEventPage(id: string, deps?: Deps) {
  if (!id) notFound();
  const load = deps?.loadHero ?? loadEventHero;
  const loaded = await load(id);
  if (loaded.status === "not_found") notFound();
  if (loaded.status === "unauthorized") redirect("/login");

  const signalRowMark = serverTimingComment("signal_row", loaded.signalRowMs);

  return (
    <div className="h-full flex flex-col bg-app pt-16" style={{ backgroundColor: "var(--bg-app)" }}>
      {signalRowMark ? (
        <span className="hidden" dangerouslySetInnerHTML={{ __html: signalRowMark }} />
      ) : null}
      <div className="px-8 pt-6 pb-2">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Events" },
            { label: loaded.hero.title },
          ]}
        />
      </div>
      <div className="flex-1 px-4 py-4 sm:p-8 sm:pt-4 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-10 items-start mb-12">
            <div className="min-w-0 xl:col-start-1 xl:row-start-1">
              <EventHero {...loaded.hero} />
            </div>
            <Suspense
              fallback={
                <>
                  <div className="xl:col-start-2 xl:row-start-1" data-testid="event-aside-skeleton">
                    <Skeleton className="h-48 w-full rounded-lg" />
                  </div>
                  <div className="min-w-0 xl:col-start-1 xl:row-start-2">
                    <EventDetailRestSkeleton />
                  </div>
                </>
              }
            >
              <EventDetailRest id={id} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
