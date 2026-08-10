import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  // Handle OAuth error params forwarded by Supabase or Google
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    console.error("[OAuth Callback Error]", error, errorDescription);
    const msg = encodeURIComponent(errorDescription ?? error);
    return NextResponse.redirect(new URL(`/login?error=${msg}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=No+auth+code+received", origin));
  }

  // We construct a single response object that captures cookies set by Supabase
  let targetPath = "/onboarding";

  const response = NextResponse.redirect(new URL(targetPath, origin));

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

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[OAuth Code Exchange Error]", exchangeError.message);
    const msg = encodeURIComponent(exchangeError.message);
    return NextResponse.redirect(new URL(`/login?error=${msg}`, origin));
  }

  // Check onboarding status
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.onboarding_completed) {
        targetPath = "/dashboard";
      }
    }
  } catch {
    // ignore bootstrap errors
  }

  // Build final redirect response and copy over all session cookies
  const finalResponse = NextResponse.redirect(new URL(targetPath, origin));
  response.cookies.getAll().forEach((c) => {
    finalResponse.cookies.set(c.name, c.value, c);
  });

  return finalResponse;
}


