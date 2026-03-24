"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Eye, EyeOff, ArrowRight, Shield } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { loginSchema } from "@/lib/validators";
import { fetchMyProfile } from "@/lib/profile";

type FormValues = z.infer<typeof loginSchema>;

// ── Exact Stitch colors ──────────────────────────
const C = {
  bg: "#0e0e0e",
  surface: "#131313",
  surfaceLowest: "#0e0e0e",
  surfaceHigh: "#2a2a2a",
  surfaceBright: "#393939",
  primary: "#6ffbbe",
  primaryContainer: "#4edea3",
  onPrimary: "#003824",
  onPrimaryContainer: "#005f40",
  onSurface: "#e5e2e1",
  onSurfaceVariant: "#bbcac0",
  outline: "#86948a",
  outlineVariant: "#3c4a42",
  error: "#ffb4ab",
} as const;

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.65 32.657 29.215 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.957 3.043l5.657-5.657C34.46 6.053 29.47 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20c0-1.341-.138-2.65-.389-3.917Z"/>
      <path fill="#FF3D00" d="M6.306 14.691 12.88 19.51C14.656 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.957 3.043l5.657-5.657C34.46 6.053 29.47 4 24 4 16.318 4 9.656 8.337 6.306 14.691Z"/>
      <path fill="#4CAF50" d="M24 44c5.147 0 9.993-1.977 13.588-5.197l-6.274-5.309C29.27 35.48 26.77 36 24 36c-5.195 0-9.62-3.317-11.29-7.946l-6.52 5.023C9.505 39.556 16.227 44 24 44Z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a11.98 11.98 0 0 1-4.0 5.494l6.274 5.309C36.594 39.8 44 34 44 24c0-1.341-.138-2.65-.389-3.917Z"/>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({ defaultValues: { email: "", password: "" } });

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
      const profile = await fetchMyProfile();
      router.push(profile?.onboardingCompleted ? "/dashboard" : "/onboarding");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to sign in.");
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
      setIsLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    backgroundColor: C.surfaceLowest,
    border: "none",
    borderBottom: `1px solid ${C.outlineVariant}`,
    color: C.onSurface,
    padding: "12px 4px",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box" as const,
    transition: "border-color 0.2s",
  };

  const labelStyle = {
    display: "block",
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
    color: C.onSurfaceVariant,
    marginBottom: "8px",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.bg,
        color: C.onSurface,
        fontFamily: "'Inter', sans-serif",
        padding: "24px",
        position: "relative",
      }}
    >
      {/* Background glow decoration */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          opacity: 0.2,
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "500px",
            height: "500px",
            background: "rgba(78,222,163,0.05)",
            filter: "blur(120px)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "400px",
            height: "400px",
            background: "rgba(114,223,77,0.05)",
            filter: "blur(100px)",
            borderRadius: "50%",
          }}
        />
      </div>

      {/* Card */}
      <main
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "440px",
          backgroundColor: C.surface,
          border: `1px solid ${C.outlineVariant}`,
          borderRadius: "16px",
          padding: "32px",
          overflow: "hidden",
        }}
      >
        {/* Status ribbon */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "2px",
            background: C.primaryContainer,
          }}
        />

        {/* Header */}
        <header style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
            <Shield size={28} color={C.primaryContainer} />
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: C.onSurface,
                textTransform: "uppercase",
              }}
            >
              GeoSignal Pro
            </span>
          </div>
          <div style={{ textAlign: "center" }}>
            <h1
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "24px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: C.onSurface,
                marginBottom: "8px",
              }}
            >
              Welcome back
            </h1>
            <p
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "12px",
                color: C.onSurfaceVariant,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Sign in to your intelligence feed
            </p>
          </div>
        </header>

        {/* Google OAuth */}
        <section style={{ marginBottom: "24px" }}>
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={isLoading}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              backgroundColor: C.surfaceHigh,
              border: `1px solid ${C.outlineVariant}`,
              color: C.onSurface,
              padding: "12px",
              borderRadius: "12px",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.surfaceBright; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.surfaceHigh; }}
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </section>

        {/* Divider */}
        <div style={{ position: "relative", marginBottom: "24px" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
            <div style={{ width: "100%", borderTop: `1px solid rgba(60,74,66,0.3)` }} />
          </div>
          <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
            <span
              style={{
                backgroundColor: C.surface,
                padding: "0 16px",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "11px",
                color: C.onSurfaceVariant,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
              }}
            >
              or
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Email */}
          <div>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              style={inputStyle}
              {...form.register("email")}
              onFocus={(e) => { e.target.style.borderBottomColor = C.primaryContainer; }}
              onBlur={(e) => { e.target.style.borderBottomColor = C.outlineVariant; }}
            />
            {form.formState.errors.email && (
              <p style={{ color: C.error, fontSize: "11px", marginTop: "4px", fontFamily: "'JetBrains Mono', monospace" }}>
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "8px" }}>
              <label htmlFor="password" style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
              <Link
                href="/forgot-password"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: C.primaryContainer,
                  textDecoration: "none",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Forgot password?
              </Link>
            </div>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                style={{ ...inputStyle, paddingRight: "40px" }}
                {...form.register("password")}
                onFocus={(e) => { e.target.style.borderBottomColor = C.primaryContainer; }}
                onBlur={(e) => { e.target.style.borderBottomColor = C.outlineVariant; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: C.onSurfaceVariant,
                  padding: 0,
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {form.formState.errors.password && (
              <p style={{ color: C.error, fontSize: "11px", marginTop: "4px", fontFamily: "'JetBrains Mono', monospace" }}>
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "12px",
                backgroundColor: "rgba(255,180,171,0.1)",
                border: "1px solid rgba(255,180,171,0.2)",
                borderRadius: "4px",
              }}
            >
              <p
                style={{
                  color: C.error,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11px",
                  textAlign: "center",
                }}
              >
                {error}
              </p>
            </div>
          )}

          {/* Submit */}
          <div style={{ paddingTop: "16px" }}>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: "100%",
                backgroundColor: C.primaryContainer,
                border: "none",
                color: C.onPrimaryContainer,
                padding: "16px",
                borderRadius: "12px",
                fontFamily: "'Inter', sans-serif",
                fontWeight: 800,
                fontSize: "14px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.15s",
                boxShadow: "0 4px 15px rgba(78,222,163,0.15)",
              }}
              onMouseEnter={(e) => { if (!isLoading) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.primary; } }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.primaryContainer; }}
            >
              {isLoading ? "Signing in..." : (
                <>
                  SIGN IN
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <footer style={{ marginTop: "40px", textAlign: "center" }}>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "14px", color: C.onSurfaceVariant }}>
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              style={{
                color: C.primaryContainer,
                fontWeight: 700,
                textDecoration: "none",
                marginLeft: "4px",
              }}
            >
              Sign up
            </Link>
          </p>
        </footer>

        {/* System meta */}
        <div
          style={{
            marginTop: "32px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px",
            opacity: 0.3,
          }}
        >
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.3em" }}>
            Secure Node: GS-ALPHA-09
          </span>
          <span
            style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: C.primaryContainer, display: "block" }}
            className="animate-pulse"
          />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: C.onSurfaceVariant, textTransform: "uppercase", letterSpacing: "0.3em" }}>
            v4.22.0
          </span>
        </div>
      </main>
    </div>
  );
}
