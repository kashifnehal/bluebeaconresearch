import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = [
  "/dashboard",
  "/events",
  "/watchlist",
  "/alerts",
  "/backtesting",
  "/settings",
];

export async function middleware(request: NextRequest) {
  // ─── DEV BYPASS ───────────────────────────────────────────────────────────
  // In local development, skip auth so you can preview all screens instantly.
  // Remove this block before deploying to production.
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }
  // ──────────────────────────────────────────────────────────────────────────

  const response = NextResponse.next();

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

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isProtected = PROTECTED.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  if (isProtected && !session)
    return NextResponse.redirect(new URL("/login", request.url));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

