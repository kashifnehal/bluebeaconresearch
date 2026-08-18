"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function ErrorBoundary({
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
    <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-on-surface mb-2">Something went wrong</h1>
        <p className="text-sm text-on-surface-variant mb-6">
          This page hit an unexpected error. It's been reported — try again, or head back to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface text-sm font-medium hover:bg-surface-container-high"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
