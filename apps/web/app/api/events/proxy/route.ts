import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "../token/route";
import { createClient } from "@supabase/supabase-js";
import { incr } from "@/lib/metrics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const userId = validateToken(token);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let lastSeen = new Date(Date.now() - 60_000).toISOString();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
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
              incr("sse.proxy.events_sent");
            }
          }
        } catch (e) {
          // log and continue
          // eslint-disable-next-line no-console
          console.warn("[events/proxy] poll error", e?.message ?? e);
        }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        clearInterval(poll);
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
