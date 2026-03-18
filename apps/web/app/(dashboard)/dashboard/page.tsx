"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Siren } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { SignalCard } from "@/components/signals/SignalCard";
import type { Signal } from "@geosignal/shared";
import { useSignalFeed } from "@/hooks/useSignalFeed";
import { useAuthStore } from "@/store/useAuthStore";

export default function DashboardPage() {
  const planTier = useAuthStore((s) => s.planTier);
  const sseEnabled = planTier === "analyst" || planTier === "pro" || planTier === "api";
  const pollingInterval = planTier === "free" ? 6 * 60 * 60 * 1000 : 30_000;

  const [dismissed, setDismissed] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(sessionStorage.getItem("dismissed_breaking") ?? "[]");
    } catch {
      return [];
    }
  });

  const { data } = useQuery({
    queryKey: ["signals", "feed"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      return (await res.json()) as { signals: Signal[] };
    },
    refetchInterval: pollingInterval,
  });

  const { liveSignals } = useSignalFeed({ enabled: sseEnabled });

  const merged = useMemo(() => {
    const map = new Map<string, Signal>();
    for (const s of liveSignals) map.set(s.id, s);
    for (const s of data?.signals ?? []) if (!map.has(s.id)) map.set(s.id, s);
    return Array.from(map.values()).slice(0, 50);
  }, [data?.signals, liveSignals]);

  const breaking = merged.find((s) => s.severity >= 9 && !dismissed.includes(s.id));

  function dismiss(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      sessionStorage.setItem("dismissed_breaking", JSON.stringify(next));
    } catch {}
  }

  return (
    <div className="text-text-primary">
      {breaking ? (
        <div className="bg-danger text-white rounded-lg p-4 mb-6 flex items-center gap-3">
          <Siren className="animate-pulse" />
          <div className="flex-1">
            <span className="font-bold">BREAKING: </span>
            <Link href={`/events/${breaking.id}`} className="underline underline-offset-2">
              {breaking.title}
            </Link>
          </div>
          <button className="text-white/70 hover:text-white" onClick={() => dismiss(breaking.id)}>
            ×
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Signals today", value: "—", sub: "last 24h" },
          { label: "High severity (8+)", value: "—", sub: "last 24h" },
          { label: "Your alert accuracy", value: "—", sub: "last 30d" },
          { label: "Active conflicts", value: "—", sub: "last 7d" },
        ].map((c) => (
          <div key={c.label} className="bg-surface-secondary rounded-lg p-4">
            <div className="text-text-muted text-xs uppercase tracking-wider">{c.label}</div>
            <div className="mt-2 text-text-primary text-2xl font-semibold font-mono">
              {c.value}
            </div>
            <div className="text-text-muted text-xs">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {merged.map((s) => (
          <SignalCard key={s.id} signal={s} onClick={() => (window.location.href = `/events/${s.id}`)} />
        ))}
      </div>
    </div>
  );
}

