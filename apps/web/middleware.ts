import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProjectReady } from "@/lib/flags";

// Routes that can be accessed when the project is not ready (Gate Active)
const GATED_ALLOWED = [
  "/login",
  "/signup",
  "/auth", // /auth/callback etc. needed for oauth/email confirmation
  "/verify", // "check your email" post-signup state — must stay reachable so a
  // gated signup can still confirm their address, not just OAuth
  "/confirm", // receiving end of the signup confirmation email link
  "/forgot-password",
  "/reset-password",
];

// Routes that require authentication (only relevant if isProjectReady is true)
const PROTECTED = [
  "/dashboard",
  "/events",
  "/watchlist",
  "/alerts",
  "/backtesting",
  "/settings",
  "/onboarding",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Gate: if project is NOT ready, block everything except /login, /signup, /auth, /api, and static assets ──
  if (!isProjectReady) {
    const isAllowed =
      pathname === "/" ||
      GATED_ALLOWED.some((p) => pathname.startsWith(p)) ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      pathname === "/favicon.ico" ||
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml";

    if (!isAllowed) {
      // Redirect to root – modal is shown there
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Allow the request to proceed (e.g., to /signup or /api)
    return NextResponse.next();
  }

  // ── Normal flow when project IS ready ────────────────────────────────────
  const response = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === "production") {
      console.warn("⚠️ Middleware: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Skipping auth check.");
    }
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
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

  // getUser() validates the JWT server-side against Supabase on every request,
  // ensuring expired or revoked tokens are rejected in production.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
