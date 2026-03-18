import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env missing, keep stream alive but emit nothing.
  if (!supabaseUrl || !supabaseAnonKey) {
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

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new Response("Unauthorized", { status: 401 });

  let lastSeen = new Date(Date.now() - 60_000).toISOString();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 30_000);

      const poll = setInterval(async () => {
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
      }, 15_000);

      request.signal.addEventListener("abort", () => {
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

