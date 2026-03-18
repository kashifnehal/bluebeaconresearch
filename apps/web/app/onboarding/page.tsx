"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Mail, Send, Slack } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { COMMODITIES, REGIONS } from "@geosignal/shared";

type Step = 1 | 2 | 3;

const REGION_DESCS: Record<string, string> = {
  "middle-east": "Oil, gas, Strait of Hormuz events",
  "eastern-europe": "Ukraine war, wheat, Russian gas",
  africa: "Sudan, DRC, food security events",
  "asia-pacific": "China-Taiwan tensions, shipping lanes",
  americas: "Venezuela oil, US sanctions",
};

function Progress({ step }: { step: Step }) {
  const items: Array<{ n: Step; label: string }> = [
    { n: 1, label: "Regions" },
    { n: 2, label: "Commodities" },
    { n: 3, label: "Alerts" },
  ];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2">
        {items.map((it, idx) => {
          const isDone = step > it.n;
          const isActive = step === it.n;
          return (
            <div key={it.n} className="flex-1 flex flex-col items-center">
              <div className="flex items-center w-full">
                {idx !== 0 ? <div className="flex-1 h-px bg-border" /> : <div className="w-0" />}
                <div
                  className={[
                    "size-8 rounded-full flex items-center justify-center border text-xs font-semibold",
                    isDone ? "bg-success text-white border-success" : "",
                    isActive ? "bg-accent text-white border-accent" : "",
                    !isDone && !isActive ? "bg-surface-secondary text-text-muted border-border" : "",
                  ].join(" ")}
                >
                  {isDone ? <Check size={16} /> : it.n}
                </div>
                {idx !== items.length - 1 ? <div className="flex-1 h-px bg-border" /> : <div className="w-0" />}
              </div>
              <div className="mt-2 text-xs text-text-secondary">{it.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [regions, setRegions] = useState<string[]>([]);
  const [assets, setAssets] = useState<string[]>([]);
  const [emailFrequency, setEmailFrequency] = useState("immediate");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [telegramConnected, setTelegramConnected] = useState(false);

  const [prices, setPrices] = useState<Record<string, { price: number; changePct24h: number }>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    async function load() {
      setLoadingPrices(true);
      try {
        const res = await fetch("/api/prices");
        const json = await res.json();
        if (cancelled) return;
        const map: Record<string, { price: number; changePct24h: number }> = {};
        for (const p of json.prices ?? []) {
          map[p.symbol] = { price: p.price, changePct24h: p.change_pct_24h ?? p.changePct24h ?? 0 };
        }
        setPrices(map);
      } finally {
        if (!cancelled) setLoadingPrices(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [step]);

  const regionCards = useMemo(() => {
    return REGIONS.map((r) => ({
      id: r.id,
      label: r.label,
      desc: REGION_DESCS[r.id] ?? "",
    }));
  }, []);

  function toggleRegion(id: string) {
    setRegions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAsset(symbol: string) {
    setAssets((prev) => (prev.includes(symbol) ? prev.filter((x) => x !== symbol) : [...prev, symbol]));
  }

  function selectAllRegions() {
    setRegions(regionCards.map((r) => r.id));
  }

  async function complete(onSkip = false) {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Missing Supabase env vars.");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("user_preferences").upsert({
          user_id: user.id,
          regions: regions,
          commodities: assets,
          min_severity: 7,
          theme: "dark",
        });
        await supabase.from("profiles").upsert({
          id: user.id,
          onboarding_completed: true,
        });
      }
    } catch {
      // allow onboarding to proceed during bootstrap
    }
    toast.success(onSkip ? "Setup skipped" : "Setup complete");
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-surface-app px-4 py-10">
      <div className="mx-auto w-full max-w-[560px]">
        <div className="mb-6 flex items-center justify-center">
          <Logo />
        </div>
        <Progress step={step} />

        {step === 1 ? (
          <Card className="mt-8 bg-surface border border-border rounded-xl p-6 shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-text-primary text-xl font-semibold">
                Which regions do you trade?
              </h2>
              <button
                onClick={selectAllRegions}
                className="text-accent text-sm hover:underline"
              >
                Select all
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {regionCards.map((r) => {
                const selected = regions.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleRegion(r.id)}
                    className={[
                      "text-left bg-surface-secondary border border-border rounded-lg p-4 cursor-pointer",
                      selected ? "border-accent bg-[color:var(--accent-subtle)]" : "hover:bg-surface-elevated",
                    ].join(" ")}
                  >
                    <div className="text-text-primary font-medium">{r.label}</div>
                    <div className="text-text-muted text-xs mt-1">{r.desc}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6">
              <Button
                disabled={regions.length < 1}
                onClick={() => setStep(2)}
                className="w-full h-10 bg-accent hover:bg-accent-hover text-white font-medium"
              >
                Continue <ChevronRight size={16} />
              </Button>
            </div>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card className="mt-8 bg-surface border border-border rounded-xl p-6 shadow-none">
            <h2 className="text-text-primary text-xl font-semibold">
              Which assets do you watch?
            </h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COMMODITIES.map((c) => {
                const selected = assets.includes(c.symbol);
                const p = prices[c.symbol];
                const pct = p?.changePct24h ?? 0;
                const isUp = pct >= 0;
                return (
                  <button
                    key={c.symbol}
                    onClick={() => toggleAsset(c.symbol)}
                    className={[
                      "text-left bg-surface-secondary border border-border rounded-lg p-4 cursor-pointer",
                      selected ? "border-accent bg-[color:var(--accent-subtle)]" : "hover:bg-surface-elevated",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-xs text-text-muted">{c.symbol}</div>
                        <div className="text-text-primary font-medium">{c.label}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm text-text-primary">
                          {loadingPrices && !p ? "—" : p ? p.price.toFixed(2) : "—"}
                        </div>
                        <Badge
                          className={[
                            "mt-1",
                            isUp ? "bg-success-subtle text-price-up" : "bg-danger-subtle text-price-down",
                          ].join(" ")}
                        >
                          {pct >= 0 ? "+" : ""}
                          {pct.toFixed(2)}%
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6">
              <Button
                disabled={assets.length < 1}
                onClick={() => setStep(3)}
                className="w-full h-10 bg-accent hover:bg-accent-hover text-white font-medium"
              >
                Continue <ChevronRight size={16} />
              </Button>
            </div>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card className="mt-8 bg-surface border border-border rounded-xl p-6 shadow-none">
            <h2 className="text-text-primary text-[20px] font-semibold">
              Never miss a signal
            </h2>
            <p className="text-text-secondary text-sm mt-1">
              Get real-time alerts the moment a high-impact event fires
            </p>

            <div className="mt-6 space-y-3">
              <Card className="bg-surface-secondary border border-border rounded-lg p-4 shadow-none">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-[#229ED9] flex items-center justify-center text-white">
                      <Send size={18} />
                    </div>
                    <div>
                      <div className="text-text-primary font-medium">
                        Telegram (Recommended)
                      </div>
                      <div className="text-text-muted text-xs">
                        Fastest delivery — alerts in under 2 minutes
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={telegramConnected ? "text-success text-sm" : "text-text-muted text-sm"}>
                      {telegramConnected ? "Connected" : "Not connected"}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setTelegramConnected(true);
                        toast("Telegram connect code: 8F4K2");
                      }}
                      className="mt-2 h-9 bg-transparent border-border text-text-primary hover:bg-surface-elevated"
                    >
                      Connect Telegram
                    </Button>
                  </div>
                </div>
                <div className="mt-3 text-text-muted text-xs">
                  1. Open Telegram and search <span className="text-text-secondary">@GeoSignalBot</span> 2. Press Start 3. Send{" "}
                  <span className="font-mono text-text-secondary">/connect 8F4K2</span>
                </div>
              </Card>

              <Card className="bg-surface-secondary border border-border rounded-lg p-4 shadow-none">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-accent-subtle flex items-center justify-center text-accent">
                      <Mail size={18} />
                    </div>
                    <div>
                      <div className="text-text-primary font-medium">Email</div>
                      <div className="text-text-muted text-xs">
                        Daily digest or real-time — your choice
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-success text-sm">Connected ✓</div>
                    <div className="mt-2">
                      <Select
                        value={emailFrequency}
                        onValueChange={(v) => setEmailFrequency(v ?? "immediate")}
                      >
                        <SelectTrigger className="h-9 w-[180px] bg-surface border-border">
                          <SelectValue placeholder="Frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">Real-time</SelectItem>
                          <SelectItem value="hourly">Hourly digest</SelectItem>
                          <SelectItem value="daily">Daily 06:00 UTC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="bg-surface-secondary border border-border rounded-lg p-4 shadow-none">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-[#4A154B] flex items-center justify-center text-white">
                      <Slack size={18} />
                    </div>
                    <div>
                      <div className="text-text-primary font-medium">Slack</div>
                      <div className="text-text-muted text-xs">
                        Alert your trading channel directly
                      </div>
                    </div>
                  </div>
                  <div className="w-[240px]">
                    <Input
                      value={slackWebhook}
                      onChange={(e) => setSlackWebhook(e.target.value)}
                      placeholder="Slack webhook URL"
                      className="h-9 bg-surface border-border text-text-primary placeholder:text-text-muted"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => toast.success("Test payload sent (stub)")}
                        className="h-9 bg-transparent border-border text-text-primary hover:bg-surface-elevated"
                      >
                        Test
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div className="mt-6 space-y-3">
              <Button
                onClick={() => complete(false)}
                className="w-full h-10 bg-accent hover:bg-accent-hover text-white font-medium"
              >
                Complete setup <ChevronRight size={16} />
              </Button>
              <button
                onClick={() => complete(true)}
                className="w-full text-center text-text-muted text-sm hover:text-text-secondary"
              >
                Set up alerts later
              </button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

