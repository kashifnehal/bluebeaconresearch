import { getRouteSupabaseClients } from "@/lib/supabase-server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const clients = await getRouteSupabaseClients();

  // If env missing, keep stream alive with heartbeats to avoid client crash.
  if (!clients) {
    console.warn("[sse] Supabase env variables missing — stream operating in heartbeat mode");
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        }, 30_000);
        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          controller.close();
        });
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const { supabase, user } = clients;

  // Allow unauthenticated reads in dev/preview only. In production, an authenticated
  // `user` is required, full stop — SUPABASE_SERVICE_ROLE_KEY being configured must
  // never factor into this decision. The service-role client (`supabase` above, via
  // getRouteSupabaseClients) exists only to reliably SERVE data to an
  // already-authenticated request (working around RLS/session propagation edge
  // cases), never to decide whether a request gets served at all.
  // Previously `!serviceKey` was in this condition; since the service key is always set
  // in production (required by /api/signals and /api/prices), that made the 401 branch
  // unreachable — any unauthenticated request could open this stream and read live
  // `signals` rows via the service-role client, bypassing RLS entirely.
  const isDev = process.env.NODE_ENV !== "production";
  if (!user && !isDev) {
    console.warn("[sse] Unauthenticated SSE connection rejected (401)");
    return new Response("Unauthorized", { status: 401 });
  }

  console.log(`[sse] Client connected (${user ? `user:${user.id}` : "anonymous/preview"})`);

  let lastSeen = new Date(Date.now() - 60_000).toISOString();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch (e) {
          // Client disconnected
        }
      }, 30_000);

      const poll = setInterval(async () => {
        try {
          const { data } = await supabase
            .from("signals")
            .select("*")
            .gt("created_at", lastSeen)
            .order("created_at", { ascending: true })
            .limit(20);

          if (data?.length) {
            for (const row of data) {
              lastSeen = row.created_at;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(row)}\n\n`),
              );
            }
          }
        } catch (e: any) {
          console.warn("[sse] Signal poll error:", e?.message ?? e);
        }
      }, 15_000);

      // Hard cap on connection lifetime — protects against connections that never
      // cleanly fire `abort` (bots, flaky networks, sleeping laptops), which would
      // otherwise hold an open interval + Supabase poll running indefinitely.
      // The client already has reconnect-with-backoff logic (useSignalFeed.ts), so
      // forcing a reconnect here is a normal, expected event, not an error state.
      const MAX_STREAM_MS = 15 * 60 * 1000;
      const maxLifetime = setTimeout(() => {
        console.log("[sse] Max stream lifetime reached, closing to force reconnect");
        clearInterval(heartbeat);
        clearInterval(poll);
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
      }, MAX_STREAM_MS);

      request.signal.addEventListener("abort", () => {
        console.log("[sse] Client disconnected");
        clearInterval(heartbeat);
        clearInterval(poll);
        clearTimeout(maxLifetime);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
