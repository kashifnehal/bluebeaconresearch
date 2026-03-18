"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setIsLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${base}/reset-password`,
      });
      if (e) throw e;
      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to send reset email.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-app px-4">
      <Card className="w-full max-w-[440px] bg-surface border border-border rounded-xl p-8 shadow-none">
        <div className="mb-2">
          <Logo />
        </div>
        <h1 className="text-[24px] font-semibold text-text-primary text-center">
          Reset your password
        </h1>
        <p className="text-[14px] text-text-secondary text-center mb-8">
          We&apos;ll email you a secure reset link.
        </p>

        <div className="space-y-2">
          <Label className="text-text-secondary">Email</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-10 bg-surface-secondary border-border text-text-primary placeholder:text-text-muted focus-visible:ring-0 focus-visible:border-accent"
          />
        </div>

        {sent ? (
          <div className="mt-4 text-success text-sm flex items-center gap-2">
            <Mail size={16} /> Email sent. Check your inbox.
          </div>
        ) : null}
        {error ? <p className="mt-4 text-danger text-sm">{error}</p> : null}

        <Button
          className="mt-6 w-full h-10 bg-accent hover:bg-accent-hover text-white"
          disabled={!email || isLoading}
          onClick={send}
        >
          {isLoading ? "Sending..." : "Send reset link"}
        </Button>

        <div className="mt-6 text-center text-sm text-text-secondary">
          Back to{" "}
          <Link className="text-accent hover:underline" href="/login">
            sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}

