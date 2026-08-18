"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { getSupabaseEmailAuthClient } from "@/lib/supabase-email-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { fetchMyProfile, resolvePostAuthRedirect } from "@/lib/profile";

function ResetPasswordForm() {
  const [status, setStatus] = useState<"validating" | "ready" | "invalid">("validating");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase's client detects the recovery code/token in the URL on load and fires a
  // PASSWORD_RECOVERY auth event once it has exchanged it for a session. We also check
  // getSession() directly in case that event fired before this listener attached.
  useEffect(() => {
    const supabase = getSupabaseEmailAuthClient();
    if (!supabase) {
      setStatus("invalid");
      return;
    }

    let settled = false;
    const markReady = () => {
      if (settled) return;
      settled = true;
      setStatus("ready");
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") markReady();
    });

    // Covers the case where the recovery event already fired (during client
    // construction) before the listener above attached.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    const hasRecoveryMarker =
      typeof window !== "undefined" &&
      (window.location.hash.includes("type=recovery") ||
        window.location.search.includes("code=") ||
        window.location.search.includes("type=recovery"));

    // Give Supabase a window to process the URL and fire PASSWORD_RECOVERY. No point
    // waiting the full window if the URL never had a recovery marker to begin with.
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setStatus("invalid");
      }
    }, hasRecoveryMarker ? 5000 : 500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = getSupabaseEmailAuthClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // The recovery session lives in this implicit-flow client's own storage
      // (localStorage), not in the cookies middleware/SSR actually check -- so
      // without this, redirecting anywhere protected would just bounce back to
      // /login regardless of destination. Bridge it into the shared cookie-based
      // client (same one login/page.tsx uses) so the very next request is
      // recognized as authenticated. Falls back to /login if this fails for any
      // reason -- the password update itself already succeeded either way.
      let target = "/login";
      const { data: sessionData } = await supabase.auth.getSession();
      const sharedClient = getSupabaseBrowserClient();
      if (sessionData.session && sharedClient) {
        const { error: bridgeError } = await sharedClient.auth.setSession({
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        });
        if (!bridgeError) {
          const profile = await fetchMyProfile();
          target = resolvePostAuthRedirect(profile);
        }
      }

      setDone(true);
      // Full navigation (not router.push) — required so the bridged session cookie
      // attaches correctly for SSR/middleware on the next page, same rule as login.
      setTimeout(() => {
        window.location.href = target;
      }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to reset password.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest px-4">
      <Card className="w-full max-w-[440px] bg-surface border border-outline-variant rounded-xl p-8 shadow-none">
        <div className="mb-2">
          <Logo />
        </div>

        {status === "validating" ? (
          <div className="py-8 text-center">
            <p className="text-on-surface-variant text-sm">Validating your reset link…</p>
          </div>
        ) : status === "invalid" ? (
          <div className="py-4 text-center">
            <h1 className="text-[22px] font-semibold text-on-surface mb-2">
              Link expired or invalid
            </h1>
            <p className="text-on-surface-variant text-sm mb-6">
              This password reset link is no longer valid. Request a new one to continue.
            </p>
            <Link href="/forgot-password">
              <Button className="w-full h-10 bg-accent hover:bg-accent-hover text-white">
                Request a new link
              </Button>
            </Link>
          </div>
        ) : done ? (
          <div className="py-8 text-center flex flex-col items-center gap-3">
            <ShieldCheck className="text-success" size={40} />
            <p className="text-on-surface text-sm">Password updated. Redirecting…</p>
          </div>
        ) : (
          <>
            <h1 className="text-[24px] font-semibold text-on-surface text-center">
              Set a new password
            </h1>
            <p className="text-[14px] text-on-surface-variant text-center mb-8">
              Choose a new password for your account.
            </p>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-on-surface-variant">New password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 bg-surface-container-low border-outline-variant text-on-surface placeholder:text-outline focus-visible:ring-0 focus-visible:border-accent pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-outline"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-on-surface-variant">Confirm password</Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 bg-surface-container-low border-outline-variant text-on-surface placeholder:text-outline focus-visible:ring-0 focus-visible:border-accent"
                />
              </div>

              {error ? <p className="text-danger text-sm">{error}</p> : null}

              <Button
                type="submit"
                className="mt-2 w-full h-10 bg-accent hover:bg-accent-hover text-white"
                disabled={!password || !confirmPassword || isLoading}
              >
                {isLoading ? "Updating..." : "Update password"}
              </Button>
            </form>
          </>
        )}

        <div className="mt-6 text-center text-sm text-on-surface-variant">
          Back to{" "}
          <Link className="text-accent hover:underline" href="/login">
            sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
