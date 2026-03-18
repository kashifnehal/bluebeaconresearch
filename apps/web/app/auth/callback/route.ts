import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  const response = NextResponse.redirect(new URL("/onboarding", request.url));

  if (!code) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return response;

  // Try to route based on onboarding flag (if profiles table exists).
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return response;

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.onboarding_completed) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  } catch {
    // ignore bootstrap errors
  }

  return response;
}

