import * as Sentry from "@sentry/nextjs";

// Same minimal pattern already used on the backend (server.ts/workers.ts) — a bare
// Sentry.init(dsn), no-op until NEXT_PUBLIC_SENTRY_DSN is actually set.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
