"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { COMMODITIES, REGIONS } from "@blue-beacon-research/shared";
import { ArrowRight, Terminal } from "lucide-react";
import Image from "next/image";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [useCase, setUseCase] = useState("trader");
  // Preference capture (#81) — "so we can show you what matters to you", not
  // alert configuration. These seed user_preferences.commodities / .regions, which
  // the feed's "My Feed" toggle and the watchlist default read from.
  const [commodities, setCommodities] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill name from OAuth metadata; redirect to /dashboard if already onboarded
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.onboarding_completed) {
        router.replace("/dashboard");
        return;
      }

      const defaultName =
        profile?.full_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "";

      setName(defaultName);
    })();
  }, [router]);

  const toggle = (
    list: string[],
    setList: (v: string[]) => void,
    value: string,
  ) => {
    setList(
      list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value],
    );
  };

  async function finish(withPreferences: boolean) {
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const finalName = name.trim() || user.user_metadata?.full_name || user.email?.split("@")[0] || "Operator";

        await supabase.from("profiles").upsert({
          id: user.id,
          full_name: finalName,
          onboarding_completed: true,
        });

        await supabase.from("user_preferences").upsert({
          user_id: user.id,
          use_case: useCase,
          theme: "dark",
          // Empty arrays when skipped — the feed/watchlist just fall back to the
          // full view, exactly as they do for any user who hasn't set preferences.
          commodities: withPreferences ? commodities : [],
          regions: withPreferences ? regions : [],
          onboarding_completed_at: new Date().toISOString(),
        });
      }

      toast.success("Profile initialized successfully");
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      toast.error("Failed to initialize profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleStepOne(e: React.FormEvent) {
    e.preventDefault();
    setStep(2);
  }

  const useCaseOptions = [
    { value: "trader", label: "Trader" },
    { value: "analyst", label: "Analyst" },
    { value: "risk", label: "Risk Manager" },
    { value: "other", label: "Other" },
  ];

  const chipStyle = (active: boolean) => ({
    border: `1px solid ${active ? "#4edea3" : "rgba(60,74,66,0.3)"}`,
    backgroundColor: active ? "#4edea3" : "#1c1b1b",
    color: active ? "#005f40" : "#e5e2e1",
    padding: "10px 14px",
    borderRadius: "4px",
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
  });

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: "#0e0e0e", color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Tactical grid overlay */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#4edea3 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.1,
        }}
      />

      {/* Globe background */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ opacity: 0.2 }}>
        <Image
          src="/onboarding-bg.jpg"
          alt="Global digital network"
          fill
          className="object-cover grayscale"
          priority
        />
      </div>

      {/* Main container */}
      <main className="relative z-10 w-full flex justify-center px-6 py-12">
        {/* Card */}
        <div
          style={{
            width: "100%",
            maxWidth: "480px",
            backgroundColor: "#131313",
            border: "1px solid rgba(60,74,66,0.3)",
            borderRadius: "8px",
            padding: "32px",
            position: "relative",
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
              background: "linear-gradient(90deg, #4edea3, #6ffbbe)",
            }}
          />

          {/* Header */}
          <header style={{ marginBottom: "32px", textAlign: "center" }}>
            <div style={{ marginBottom: "24px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <Terminal size={28} color="#4edea3" />
              <span
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#4edea3",
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                Blue Beacon Research
              </span>
            </div>
            <h1
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "30px",
                fontWeight: 800,
                color: "#e5e2e1",
                marginBottom: "8px",
                lineHeight: 1.2,
              }}
            >
              {step === 1 ? "Set up your profile" : "What should we keep an eye on for you?"}
            </h1>
            <p style={{ color: "#bbcac0", fontFamily: "'Inter', sans-serif" }}>
              {step === 1
                ? "Tell us how you'll use Blue Beacon Research"
                : "Pick the commodities and regions you follow so we can show you what matters to you. You can change this anytime in Settings."}
            </p>
            <div
              style={{
                marginTop: "16px",
                display: "flex",
                gap: "6px",
                justifyContent: "center",
              }}
            >
              {[1, 2].map((s) => (
                <span
                  key={s}
                  style={{
                    width: "24px",
                    height: "3px",
                    borderRadius: "2px",
                    backgroundColor: s <= step ? "#4edea3" : "#3c4a42",
                  }}
                />
              ))}
            </div>
          </header>

          {step === 1 ? (
            /* ── Step 1: identity + use case ─────────────────────────── */
            <form onSubmit={handleStepOne} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Name field */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  htmlFor="name"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontSize: "11px",
                    color: "#bbcac0",
                  }}
                >
                  YOUR NAME
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Enter operator name..."
                  value={name}
                  suppressHydrationWarning
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    backgroundColor: "#0e0e0e",
                    border: "none",
                    borderBottom: "1px solid #3c4a42",
                    color: "#e5e2e1",
                    padding: "12px 0",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => { e.target.style.borderBottomColor = "#4edea3"; }}
                  onBlur={(e) => { e.target.style.borderBottomColor = "#3c4a42"; }}
                />
              </div>

              {/* Use Case */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontSize: "11px",
                    color: "#bbcac0",
                  }}
                >
                  USE CASE
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {useCaseOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setUseCase(option.value)}
                      style={{
                        border: `1px solid ${useCase === option.value ? "#4edea3" : "rgba(60,74,66,0.3)"}`,
                        backgroundColor: useCase === option.value ? "#4edea3" : "#1c1b1b",
                        color: useCase === option.value ? "#005f40" : "#e5e2e1",
                        padding: "12px 16px",
                        borderRadius: "4px",
                        fontFamily: "'Space Grotesk', sans-serif",
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.05em",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Telegram notice — the real connect flow (generate a code, send
                  "/connect <code>" to @BlueBeaconResearchBot) needs an async round trip
                  to Telegram, which doesn't fit a single-input onboarding field. Point to
                  Settings instead of collecting a raw handle here, which never produced a
                  usable chat ID (see apps/web/components/TelegramConnect.tsx). */}
              <p
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10px",
                  color: "#86948a",
                  fontStyle: "italic",
                }}
              >
                Tactical alerts via Telegram can be connected afterward from Settings → Notifications.
              </p>

              {/* Continue */}
              <div style={{ paddingTop: "16px" }}>
                <button
                  type="submit"
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, #6ffbbe, #4edea3)",
                    color: "#003824",
                    padding: "16px",
                    borderRadius: "4px",
                    border: "none",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.08em",
                    fontSize: "14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 0 20px rgba(78,222,163,0.15)",
                    transition: "all 0.2s",
                  }}
                >
                  CONTINUE
                  <ArrowRight size={18} />
                </button>
              </div>
            </form>
          ) : (
            /* ── Step 2: preference capture ─────────────────────────── */
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontSize: "11px",
                    color: "#bbcac0",
                  }}
                >
                  COMMODITIES YOU FOLLOW
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {COMMODITIES.map((c) => (
                    <button
                      key={c.symbol}
                      type="button"
                      aria-pressed={commodities.includes(c.symbol)}
                      onClick={() => toggle(commodities, setCommodities, c.symbol)}
                      style={chipStyle(commodities.includes(c.symbol))}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontSize: "11px",
                    color: "#bbcac0",
                  }}
                >
                  REGIONS YOU FOLLOW
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {REGIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={regions.includes(r.id)}
                      onClick={() => toggle(regions, setRegions, r.id)}
                      style={chipStyle(regions.includes(r.id))}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => finish(true)}
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, #6ffbbe, #4edea3)",
                    color: "#003824",
                    padding: "16px",
                    borderRadius: "4px",
                    border: "none",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.08em",
                    fontSize: "14px",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.5 : 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 0 20px rgba(78,222,163,0.15)",
                    transition: "all 0.2s",
                  }}
                >
                  {isSubmitting ? "INITIALIZING..." : "SAVE AND ENTER DASHBOARD"}
                  <ArrowRight size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => finish(false)}
                  disabled={isSubmitting}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#86948a",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.05em",
                    textDecoration: "underline",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <footer
            style={{
              marginTop: "32px",
              paddingTop: "32px",
              borderTop: "1px solid rgba(60,74,66,0.2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontSize: "10px",
                  color: "#86948a",
                }}
              >
                NODE STATUS
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10px",
                  color: "#4edea3",
                }}
              >
                BB-ALPHA-ONLINE
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontSize: "10px",
                  color: "#86948a",
                }}
              >
                ENCRYPTION
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10px",
                  color: "#e5e2e1",
                }}
              >
                AES-256 ACTIVE
              </div>
            </div>
          </footer>
        </div>
      </main>

      {/* Bottom-left status */}
      <div
        className="fixed bottom-10 left-10 hidden xl:flex flex-col gap-1 z-0"
        style={{ opacity: 0.4 }}
      >
        {[
          { label: "LATENCY: 14MS", pulse: false },
          { label: "UPTIME: 99.998%", pulse: false },
          { label: "SOCKET: CONNECTED", pulse: true },
        ].map(({ label, pulse }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                height: "4px",
                width: "4px",
                backgroundColor: "#4edea3",
                borderRadius: "50%",
                display: "block",
              }}
              className={pulse ? "animate-pulse" : ""}
            />
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "10px",
                color: "#e5e2e1",
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Top-right timestamp */}
      <div
        className="fixed top-10 right-10 hidden xl:block z-0"
        style={{ opacity: 0.4 }}
      >
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "10px",
            textAlign: "right",
            color: "#e5e2e1",
          }}
        >
          TIMESTAMP: 2024-05-21T14:48:02Z<br />
          COORDS: 40.7128° N, 74.0060° W
        </div>
      </div>
    </div>
  );
}
