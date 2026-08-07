import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Query recent alerts_sent joined with signals if user is authenticated
  if (user) {
    const { data, error } = await supabase
      .from("alerts_sent")
      .select("*, signals(id, title, severity)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!error && data) {
      return NextResponse.json({ alerts: data });
    }
  }

  // Fallback: Query latest high-severity signals as recent alerts
  const { data: signals } = await supabase
    .from("signals")
    .select("id, title, severity, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const alerts = (signals ?? []).map((s) => ({
    id: s.id,
    signal_id: s.id,
    created_at: s.created_at,
    is_read: false,
    signals: {
      id: s.id,
      title: s.title,
      severity: s.severity,
    },
  }));

  return NextResponse.json({ alerts });
}
