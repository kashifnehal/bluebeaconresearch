import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
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

  let supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Helpful debug info when clients observe intermittent 401s — log cookie names
    try {
      const names = cookieStore.getAll().map((c) => c.name);
      console.warn(
        "[events/stream] no user for request; cookies:",
        names,
        "cookieHeaderPresent:",
        !!request.headers.get("cookie"),
      );
    } catch (e) {
      console.warn(
        "[events/stream] no user and failed to read cookieStore",
        e?.message ?? e,
      );
    }

    // In local/dev allow a fallback stream using the service role (if configured)
    // so EventSource can still receive pulses while we debug auth issues.
    if (process.env.NODE_ENV !== "production") {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey && supabaseUrl) {
        // Use service role client for polling in dev when user session is missing
        const serviceClient = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false },
        });
        // continue but use serviceClient for polling below by replacing `supabase`
        // (we'll shadow the variable by reassigning)
        // @ts-ignore
        supabase = serviceClient;
      } else {
        // No service key: do not return 401 in dev — provide a heartbeat-only stream
        const devStream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(`: connected (dev fallback)\n\n`),
            );
            const heartbeat = setInterval(() => {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            }, 30_000);
            request.signal.addEventListener("abort", () => {
              clearInterval(heartbeat);
              controller.close();
            });
          },
        });
        return new Response(devStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      }
    } else {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let isPro = true;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_tier")
      .eq("id", user.id)
      .maybeSingle();
    const tier = ((profile as { plan_tier?: string | null } | null)
      ?.plan_tier ?? "free") as string;
    isPro = ["analyst", "pro", "api"].includes(tier);
  } catch {
    isPro = false;
  }

  let lastSeen = new Date(Date.now() - 60_000).toISOString();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 30_000);

      let poll: NodeJS.Timeout | null = null;
      if (isPro) {
        poll = setInterval(async () => {
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
      }

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        if (poll) clearInterval(poll);
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
