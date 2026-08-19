"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { getSupabaseEmailAuthClient } from "@/lib/supabase-email-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { fetchMyProfile, resolvePostAuthRedirect } from "@/lib/profile";

// Receiving end of the signup confirmation email link (emailRedirectTo in
// signup/page.tsx's signUp() call points here). Same implicit-flow-in-the-hash
// mechanism as reset-password/page.tsx, and for the same reason: this link is
// routinely opened in a different browser/device than the one that signed up
// (Gmail app, WhatsApp preview, a phone). See lib/supabase-email-auth.ts.
function ConfirmForm() {
  const [status, setStatus] = useState<"validating" | "invalid">("validating");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseEmailAuthClient();
    if (!supabase) {
      setStatus("invalid");
      return;
    }

    let settled = false;

    async function bridgeAndRedirect() {
      if (settled) return;
      settled = true;

      // The confirmed session lives in this implicit-flow client's own storage
      // (localStorage), not in the cookies middleware/SSR check -- bridge it into
      // the shared cookie-based client (same client login/page.tsx uses) so the
      // very next request is recognized as authenticated. Same pattern as the
      // password-reset auto-sign-in fix.
      const { data: sessionData } = await supabase!.auth.getSession();
      const sharedClient = getSupabaseBrowserClient();
      if (!sessionData.session || !sharedClient) {
        setStatus("invalid");
        return;
      }

      const { error: bridgeError } = await sharedClient.auth.setSession({
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      });
      if (bridgeError) {
        setError(bridgeError.message);
        setStatus("invalid");
        return;
      }

      const profile = await fetchMyProfile();
      window.location.href = resolvePostAuthRedirect(profile);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") bridgeAndRedirect();
    });

    // Covers the case where the sign-in event already fired (during client
    // construction) before the listener above attached.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) bridgeAndRedirect();
    });

    const hasConfirmMarker =
      typeof window !== "undefined" &&
      (window.location.hash.includes("access_token") ||
        window.location.search.includes("code=") ||
        window.location.search.includes("type="));

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setStatus("invalid");
      }
    }, hasConfirmMarker ? 5000 : 500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest px-4">
      <Card className="w-full max-w-[440px] bg-surface border border-outline-variant rounded-xl p-8 shadow-none text-center">
        <div className="mb-2">
          <Logo />
        </div>

        {status === "validating" ? (
          <div className="py-8">
            <p className="text-on-surface-variant text-sm">Confirming your account…</p>
          </div>
        ) : (
          <div className="py-4">
            <h1 className="text-[22px] font-semibold text-on-surface mb-2">
              Confirmation link expired or invalid
            </h1>
            <p className="text-on-surface-variant text-sm mb-6">
              {error ??
                // GoTrue returns the identical otp_expired error whether the link was
                // already used (e.g. clicked twice, or prefetched by an email security
                // scanner) or is genuinely past its expiry window — the client can't
                // tell those apart, so this covers both without guessing which one it is.
                "This link has already been used or is no longer valid. If you've already confirmed your account, sign in below — otherwise, sign up again to get a new link."}
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/login">
                <Button className="w-full h-10 bg-accent hover:bg-accent-hover text-white">
                  Sign in
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="outline" className="w-full h-10">
                  Back to sign up
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmForm />
    </Suspense>
  );
}
