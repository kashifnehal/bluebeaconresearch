"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Catches a crash in the ROOT layout itself (not just a page) — Next.js requires this
// to render its own <html>/<body> since it replaces the layout entirely. Kept in plain
// inline styles rather than Tailwind classes: this is the last-resort fallback, so it
// shouldn't depend on the app's normal CSS pipeline having loaded successfully.
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0e0e0e",
          color: "#e5e2e1",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Blue Beacon Research hit a critical error
          </h1>
          <p style={{ fontSize: 14, color: "#bbcac0", marginBottom: 24 }}>
            The application failed to load. It's been reported — try reloading.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              backgroundColor: "#4edea3",
              color: "#003824",
              border: "none",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
