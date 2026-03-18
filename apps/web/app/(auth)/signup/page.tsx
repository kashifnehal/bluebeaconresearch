"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { Check, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { signupSchema } from "@/lib/validators";
import type { PlanTier } from "@geosignal/shared";

type FormValues = z.infer<typeof signupSchema>;

const PLANS: Array<{
  id: PlanTier;
  name: string;
  price: string;
  features: string[];
}> = [
  { id: "free", name: "Free", price: "$0", features: ["Delayed feed", "Basic alerts"] },
  { id: "analyst", name: "Analyst", price: "$49/mo", features: ["Real-time feed", "Telegram alerts"] },
  { id: "pro", name: "Pro", price: "$199/mo", features: ["Backtesting", "Slack + exports"] },
];

function passwordScore(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

function scoreColor(i: number, score: number) {
  if (i > score) return "bg-surface-elevated";
  if (score <= 1) return "bg-danger";
  if (score === 2) return "bg-warning";
  if (score === 3) return "bg-warning";
  return "bg-success";
}

export default function SignupPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("analyst");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const redirectTo = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/auth/callback`;
  }, []);

  async function onSubmit(values: FormValues) {
    setError(null);
    setIsLoading(true);
    try {
      const parsed = signupSchema.safeParse(values);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (field === "fullName" || field === "email" || field === "password") {
            form.setError(field, { message: issue.message });
          }
        }
        return;
      }
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { full_name: values.fullName, plan_tier: selectedPlan },
          emailRedirectTo: redirectTo,
        },
      });
      if (signUpError) throw signUpError;

      // Upsert profile if table exists; safe to ignore failures during local bootstrap.
      if (data.user?.id) {
        await supabase
          .from("profiles")
          .upsert({ id: data.user.id, full_name: values.fullName, plan_tier: selectedPlan });
      }

      // Stripe checkout wiring comes in Phase 6; for now follow spec: paid → checkout, free → onboarding.
      if (selectedPlan === "free") router.push("/onboarding");
      else router.push("/verify?email=" + encodeURIComponent(values.email));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to sign up.");
    } finally {
      setIsLoading(false);
    }
  }

  async function signUpWithGoogle() {
    setError(null);
    setIsLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { state: selectedPlan },
        },
      });
      if (oauthError) throw oauthError;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google sign-up failed.");
      setIsLoading(false);
    }
  }

  const pw = form.watch("password");
  const score = passwordScore(pw ?? "");

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-app px-4">
      <Card className="w-full max-w-[440px] bg-surface border border-border rounded-xl p-8 shadow-none">
        <div className="mb-2">
          <Logo />
        </div>
        <h1 className="text-[24px] font-semibold text-text-primary text-center">
          Start your free trial
        </h1>
        <p className="text-[14px] text-text-secondary text-center mb-8">
          No credit card required. Real signals in 5 minutes.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {PLANS.map((p) => {
            const active = selectedPlan === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlan(p.id)}
                className={[
                  "text-left bg-surface-secondary border rounded-lg p-3 transition-colors",
                  active ? "border-accent border-2" : "border-border hover:bg-surface-elevated",
                ].join(" ")}
              >
                <div className="text-text-primary font-semibold">{p.name}</div>
                <div className="text-[20px] font-bold text-text-primary">{p.price}</div>
                <ul className="mt-2 space-y-1">
                  {p.features.slice(0, 2).map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <Check className="text-success" size={14} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          onClick={signUpWithGoogle}
          disabled={isLoading}
          className="w-full h-10 bg-surface-secondary border border-border text-text-primary hover:bg-surface-elevated"
        >
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 border-t border-border" />
          <div className="text-text-muted text-[11px]">or</div>
          <div className="flex-1 border-t border-border" />
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-text-secondary">Full name</Label>
            <Input
              placeholder="Alex Chen"
              className="h-10 bg-surface-secondary border-border text-text-primary placeholder:text-text-muted focus-visible:ring-0 focus-visible:border-accent"
              {...form.register("fullName")}
            />
            {form.formState.errors.fullName ? (
              <p className="text-danger text-sm">
                {form.formState.errors.fullName.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label className="text-text-secondary">Email</Label>
            <Input
              type="email"
              placeholder="you@example.com"
              className="h-10 bg-surface-secondary border-border text-text-primary placeholder:text-text-muted focus-visible:ring-0 focus-visible:border-accent"
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <p className="text-danger text-sm">
                {form.formState.errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label className="text-text-secondary">Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="h-10 pr-10 bg-surface-secondary border-border text-text-primary placeholder:text-text-muted focus-visible:ring-0 focus-visible:border-accent"
                {...form.register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded ${scoreColor(i, score)}`}
                />
              ))}
            </div>
            {form.formState.errors.password ? (
              <p className="text-danger text-sm">
                {form.formState.errors.password.message}
              </p>
            ) : null}
          </div>

          {error ? <p className="text-danger text-sm">{error}</p> : null}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-10 bg-accent hover:bg-accent-hover text-white font-medium"
          >
            {isLoading ? "Creating..." : "Create account"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{" "}
          <Link className="text-accent hover:underline" href="/login">
            Sign in
          </Link>
        </div>

        <p className="mt-4 text-center text-text-muted text-xs">
          By signing up you agree to our Terms and Privacy Policy
        </p>
      </Card>
    </div>
  );
}

