"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { getSupabaseEmailAuthClient } from "@/lib/supabase-email-auth";

export function VerifyClient() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(false), 3000);
    return () => clearTimeout(t);
  }, [sent]);

  // Cross-device confirmation auto-detect. The confirmation link is routinely
  // opened on a different device (phone Gmail) than the one sitting on this
  // screen. That other device gets authenticated by confirm/page.tsx's bridging —
  // never this one — so once we learn confirmation happened, this device can only
  // be sent to /login (it has no session of its own), never /dashboard.
  //
  // Polls /api/auth/confirmation-status every 7s while mounted AND the tab is
  // visible (Page Visibility API), resuming promptly on visibilitychange. Gives
  // up after 10 minutes; the "Resend email" button remains the fallback. A failed
  // poll fails silently and just retries on the next interval — polling must never
  // surface an error or break the page (same principle as lib/funnel-events.ts).
  useEffect(() => {
    if (!email) return;

    const POLL_MS = 7000;
    const MAX_MS = 10 * 60 * 1000;
    const startedAt = Date.now();
    let stopped = false;
    let inFlight = false;
    let lastPollAt = 0;

    async function poll() {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      lastPollAt = Date.now();
      try {
        const res = await fetch("/api/auth/confirmation-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (res.ok) {
          const data = (await res.json()) as { confirmed?: boolean };
          if (data.confirmed && !stopped) {
            stopped = true;
            teardown();
            // window.location.href (not router.push) — SSR-cookie-attachment rule
            // in 10_DECISIONS.md that every redirect in this auth flow follows.
            window.location.href = "/login?confirmed=1";
          }
        }
        // A non-OK response (rate-limited, upstream error) is ignored — the next
        // interval just tries again.
      } catch {
        // Failed poll — fail silently, retry next interval.
      } finally {
        inFlight = false;
      }
    }

    const interval = setInterval(() => {
      if (Date.now() - startedAt >= MAX_MS) {
        stopped = true;
        teardown();
        return;
      }
      void poll();
    }, POLL_MS);

    function onVisibility() {
      // setInterval never fires early, so gating the event-triggered poll on the
      // 7s floor is all that's needed to never poll faster than every 7 seconds.
      if (document.visibilityState === "visible" && Date.now() - lastPollAt >= POLL_MS) {
        void poll();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    function teardown() {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    }

    return () => {
      stopped = true;
      teardown();
    };
  }, [email]);

  // Supabase's default shared SMTP has a low email-send rate limit (confirmed live:
  // 429 "email rate limit exceeded" on repeated signup/resend attempts). A visible
  // cooldown stops a user (or repeated testing) from hammering the resend button
  // straight into that wall.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const RESEND_COOLDOWN_SECONDS = 60;

  async function resend() {
    setError(null);
    setIsLoading(true);
    try {
      // Same implicit-flow client signUp() uses (lib/supabase-email-auth.ts) --
      // the resent link must match what confirm/page.tsx expects to receive.
      const supabase = getSupabaseEmailAuthClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (resendError) throw resendError;
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to resend email.";
      setError(message);
      // Rate-limit errors mean the cooldown wasn't respected (or an earlier attempt
      // already used it up) — start the cooldown anyway so the next click doesn't
      // immediately repeat the same failure.
      if (message.toLowerCase().includes("rate limit")) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest px-4">
      <Card className="w-full max-w-[440px] bg-surface border border-outline-variant rounded-xl p-8 shadow-none text-center">
        <div className="mb-2">
          <Logo />
        </div>
        <div className="mx-auto mt-4 mb-4 flex items-center justify-center">
          <Mail className="text-accent" size={48} />
        </div>
        <h1 className="text-[24px] font-semibold text-on-surface">
          Check your email
        </h1>
        {/* Deliberately a single, non-conditional message shown to every submitter
            regardless of whether the email was new or already registered — GoTrue's
            anti-enumeration response is distinguishable server-side (see signup/page.tsx),
            but that difference must never surface here. Don't reintroduce a branch. */}
        <p className="text-on-surface-variant text-sm mt-2">
          Check your inbox — we&apos;ve sent a link to confirm your account. It should
          arrive in a minute or two.
        </p>

        <div className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={resend}
            disabled={!email || isLoading || cooldown > 0}
            className="w-full h-10 bg-transparent border-outline-variant text-on-surface hover:bg-surface-container-high"
          >
            {isLoading
              ? "Sending..."
              : cooldown > 0
                ? `Resend email (${cooldown}s)`
                : "Resend email"}
          </Button>
          {sent ? <p className="text-success text-sm mt-3">Email sent!</p> : null}
          {error ? <p className="text-danger text-sm mt-3">{error}</p> : null}
        </div>

        <p className="mt-6 text-outline text-sm">
          Wrong email?{" "}
          <Link className="text-accent hover:underline" href="/signup">
            Sign up again
          </Link>
        </p>
      </Card>
    </div>
  );
}

