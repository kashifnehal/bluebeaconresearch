"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Scoped to the (dashboard) route group so a crash in one page's content doesn't take
// out the Sidebar/TopBar chrome (rendered by (dashboard)/layout.tsx, which stays
// mounted above this boundary) — same error, better contained than the root one.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex h-screen w-full pt-16 items-center justify-center" style={{ backgroundColor: "#0e0e0e" }}>
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-on-surface mb-2">This page hit an error</h1>
        <p className="text-sm text-on-surface-variant mb-6">
          It's been reported. The rest of the dashboard is still working — try reloading this section.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
