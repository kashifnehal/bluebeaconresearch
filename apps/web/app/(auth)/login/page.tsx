"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { loginSchema } from "@/lib/validators";

type FormValues = z.infer<typeof loginSchema>;

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.65 32.657 29.215 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.957 3.043l5.657-5.657C34.46 6.053 29.47 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20c0-1.341-.138-2.65-.389-3.917Z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691 12.88 19.51C14.656 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.957 3.043l5.657-5.657C34.46 6.053 29.47 4 24 4 16.318 4 9.656 8.337 6.306 14.691Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.147 0 9.993-1.977 13.588-5.197l-6.274-5.309C29.27 35.48 26.77 36 24 36c-5.195 0-9.62-3.317-11.29-7.946l-6.52 5.023C9.505 39.556 16.227 44 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a11.98 11.98 0 0 1-4.0 5.494l.003-.002 6.274 5.309C36.594 39.8 44 34 44 24c0-1.341-.138-2.65-.389-3.917Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: { email: "", password: "" },
  });

  const redirectTo = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return `${base}/auth/callback`;
  }, []);

  async function onSubmit(values: FormValues) {
    setError(null);
    setIsLoading(true);
    try {
      const parsed = loginSchema.safeParse(values);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (field === "email" || field === "password") {
            form.setError(field, { message: issue.message });
          }
        }
        return;
      }
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (signInError) throw signInError;
      router.push("/onboarding");
    } catch (e: any) {
      setError(e?.message ?? "Failed to sign in.");
    } finally {
      setIsLoading(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setIsLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) throw oauthError;
    } catch (e: any) {
      setError(e?.message ?? "Google sign-in failed.");
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
          Welcome back
        </h1>
        <p className="text-[14px] text-text-secondary text-center mb-8">
          Sign in to your intelligence feed
        </p>

        <Button
          type="button"
          onClick={signInWithGoogle}
          disabled={isLoading}
          className="w-full h-10 bg-surface-secondary border border-border text-text-primary hover:bg-surface-elevated"
        >
          <GoogleIcon />
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 border-t border-border" />
          <div className="text-text-muted text-[11px]">or</div>
          <div className="flex-1 border-t border-border" />
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            <div className="flex items-center justify-between">
              <Label className="text-text-secondary">Password</Label>
              <Link
                href="#"
                className="text-accent text-sm hover:underline"
              >
                Forgot password?
              </Link>
            </div>
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
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-text-secondary">
          Don&apos;t have an account?{" "}
          <Link className="text-accent hover:underline" href="/signup">
            Sign up
          </Link>
        </div>
      </Card>
    </div>
  );
}

