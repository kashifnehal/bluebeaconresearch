// Retired 2026-09-03 — see project memory project_vercel_fluid_sse_leak.md. This SSE
// endpoint (nodejs runtime, connections held open up to 15 min with client-side
// auto-reconnect for as long as /dashboard or /map stayed open) is exactly what
// Vercel Fluid Compute bills "Provisioned Memory" GB-Hrs for: the full connection
// lifetime, not just active work. useSignalFeed.ts no longer opens this stream — its
// existing 90s-poll fallback is now the sole update path. Kept as a fast, terminal
// stub (no ReadableStream, ever) rather than deleted outright, so a stale cached
// client bundle or a stray direct request gets an instant, cheap 410 instead of
// silently 404ing or — worse — a handler that could regress back into holding a
// connection open.
export async function GET() {
  return new Response("Realtime signal stream has been retired; polling is now the sole update path.", {
    status: 410,
  });
}
