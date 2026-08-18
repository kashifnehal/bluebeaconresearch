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

  if (!user) {
    return NextResponse.json({ alerts: [] });
  }

  // Real alerts_sent rows only — no fallback to raw signals relabeled as delivered
  // alerts. An empty result here means no alert_rules have matched anything yet, which
  // is a genuine "no alerts" state, not a gap to paper over.
  const { data, error } = await supabase
    .from("alerts_sent")
    .select("*, signals(id, title, severity)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ alerts: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data ?? [] });
}
