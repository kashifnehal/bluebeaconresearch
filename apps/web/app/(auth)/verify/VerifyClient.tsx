"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function VerifyClient() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(false), 3000);
    return () => clearTimeout(t);
  }, [sent]);

  async function resend() {
    setError(null);
    setIsLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (resendError) throw resendError;
      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to resend email.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-app px-4">
      <Card className="w-full max-w-[440px] bg-surface border border-border rounded-xl p-8 shadow-none text-center">
        <div className="mb-2">
          <Logo />
        </div>
        <div className="mx-auto mt-4 mb-4 flex items-center justify-center">
          <Mail className="text-accent" size={48} />
        </div>
        <h1 className="text-[24px] font-semibold text-text-primary">
          Check your email
        </h1>
        <p className="text-text-secondary text-sm mt-2">
          We sent a verification link to{" "}
          <span className="text-text-primary font-medium">
            {email || "your email"}
          </span>
          . Click it to activate your account.
        </p>

        <div className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={resend}
            disabled={!email || isLoading}
            className="w-full h-10 bg-transparent border-border text-text-primary hover:bg-surface-elevated"
          >
            {isLoading ? "Sending..." : "Resend email"}
          </Button>
          {sent ? <p className="text-success text-sm mt-3">Email sent!</p> : null}
          {error ? <p className="text-danger text-sm mt-3">{error}</p> : null}
        </div>

        <p className="mt-6 text-text-muted text-sm">
          Wrong email?{" "}
          <Link className="text-accent hover:underline" href="/signup">
            Sign up again
          </Link>
        </p>
      </Card>
    </div>
  );
}

