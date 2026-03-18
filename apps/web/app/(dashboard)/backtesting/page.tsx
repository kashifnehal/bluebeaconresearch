"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { COMMODITIES, REGIONS } from "@geosignal/shared";

const POPULAR = [
  {
    title: "Houthi Red Sea attack → WTI Oil (24hr)",
    eventType: "Naval blockade",
    region: "middle-east",
    commodity: "USOIL",
    horizon: "24hr",
  },
  {
    title: "Russia sanctions announcement → EUR/USD (48hr)",
    eventType: "Sanctions announcement",
    region: "eastern-europe",
    commodity: "EURUSD",
    horizon: "48hr",
  },
  {
    title: "Black Sea grain corridor halt → Wheat (7d)",
    eventType: "Grain export halt",
    region: "eastern-europe",
    commodity: "WHEAT",
    horizon: "7d",
  },
  {
    title: "Iran vessel seizure → Brent Crude (24hr)",
    eventType: "Naval vessel seizure",
    region: "middle-east",
    commodity: "UKOIL",
    horizon: "24hr",
  },
  {
    title: "Ukraine escalation → Natural Gas (48hr)",
    eventType: "Ground offensive",
    region: "eastern-europe",
    commodity: "NGAS",
    horizon: "48hr",
  },
  {
    title: "Sudan coup → Gold (24hr)",
    eventType: "Coup/political seizure",
    region: "africa",
    commodity: "XAUUSD",
    horizon: "24hr",
  },
] as const;

export default function BacktestingPage() {
  const [eventType, setEventType] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [commodity, setCommodity] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<"4hr" | "24hr" | "48hr" | "7d">(
    "24hr",
  );
  const [from, setFrom] = useState("2015-01-01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/backtesting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, region, commodity, horizon, from, to }),
      });
      if (!res.ok) throw new Error("Backtest failed");
      return (await res.json()) as any;
    },
  });

  const canRun = Boolean(eventType && region && commodity && horizon);

  const results = run.data as
    | undefined
    | {
        totalEvents: number;
        accuracyPct: number;
        avgMovePct: number;
        maxMovePct: number;
        minMovePct: number;
        rows: Array<{
          date: string;
          country: string;
          summary: string;
          movePct: number;
          correct: boolean;
        }>;
      };

  const title = useMemo(() => {
    if (!results) return null;
    return `Results: ${eventType} in ${region} → ${commodity} at ${horizon}`;
  }, [results, eventType, region, commodity, horizon]);

  return (
    <div>
      <h1 className="text-text-primary text-2xl font-semibold">Backtesting Lab</h1>
      <p className="text-text-secondary text-sm mt-2 mb-8">
        See how markets have historically reacted to events like the ones our
        system detects.
      </p>

      <div className="mb-6">
        <div className="text-text-primary font-medium mb-3">Popular backtests</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {POPULAR.map((p) => (
            <Card
              key={p.title}
              className="bg-surface-secondary border border-border rounded-xl p-4 shadow-none cursor-pointer hover:border-accent/50"
              onClick={() => {
                setEventType(p.eventType);
                setRegion(p.region);
                setCommodity(p.commodity);
                setHorizon(p.horizon);
                setTimeout(() => run.mutate(), 0);
              }}
            >
              <div className="text-text-primary font-medium">{p.title}</div>
              <div className="text-text-muted text-sm mt-1">Click to run</div>
            </Card>
          ))}
        </div>
      </div>

      <Card className="bg-surface border border-border rounded-xl p-6 shadow-none">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[220px] flex-1">
            <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
              Event type
            </div>
            <Input
              value={eventType ?? ""}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="Select conflict event type"
              className="h-10 bg-surface-secondary border-border"
            />
          </div>

          <div className="min-w-[200px]">
            <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
              Region
            </div>
            <Select value={region} onValueChange={(v) => setRegion(v)}>
              <SelectTrigger className="h-10 bg-surface-secondary border-border">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
                <SelectItem value="global">Global</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[200px]">
            <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
              Commodity
            </div>
            <Select value={commodity} onValueChange={(v) => setCommodity(v)}>
              <SelectTrigger className="h-10 bg-surface-secondary border-border">
                <SelectValue placeholder="Commodity" />
              </SelectTrigger>
              <SelectContent>
                {COMMODITIES.map((c) => (
                  <SelectItem key={c.symbol} value={c.symbol}>
                    {c.label} ({c.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[160px]">
            <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
              Horizon
            </div>
            <div className="flex gap-2">
              {(["4hr", "24hr", "48hr", "7d"] as const).map((h) => (
                <button
                  key={h}
                  className={[
                    "h-10 px-3 rounded-md border text-sm font-medium",
                    horizon === h
                      ? "bg-accent text-white border-accent"
                      : "bg-surface-secondary text-text-secondary border-border hover:bg-surface-elevated",
                  ].join(" ")}
                  onClick={() => setHorizon(h)}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-[150px]">
            <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
              From
            </div>
            <Input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 bg-surface-secondary border-border"
            />
          </div>
          <div className="min-w-[150px]">
            <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
              To
            </div>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 bg-surface-secondary border-border"
            />
          </div>

          <Button
            disabled={!canRun || run.isPending}
            className="h-10 bg-accent hover:bg-accent-hover text-white px-6"
            onClick={() => run.mutate()}
          >
            {run.isPending ? "Running..." : "Run backtest"}
          </Button>
        </div>
      </Card>

      {results ? (
        <div className="mt-8">
          <div className="text-text-primary font-medium mb-3">{title}</div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: "Total events", value: results.totalEvents },
              { label: "Directional accuracy %", value: results.accuracyPct },
              { label: "Average move %", value: results.avgMovePct },
              { label: "Max move %", value: results.maxMovePct },
              { label: "Min move %", value: results.minMovePct },
            ].map((m) => (
              <Card
                key={m.label}
                className="bg-surface-secondary border border-border rounded-lg p-4 shadow-none"
              >
                <div className="text-text-muted text-xs uppercase tracking-wider">
                  {m.label}
                </div>
                <div className="mt-2 text-text-primary text-2xl font-semibold font-mono">
                  {m.value}
                </div>
              </Card>
            ))}
          </div>

          <Card className="bg-surface-secondary border border-border rounded-xl p-4 shadow-none">
            <div className="flex items-center justify-between mb-3">
              <div className="text-text-primary font-medium">Results table</div>
              <Button
                variant="outline"
                className="h-9 bg-transparent border-border hover:bg-surface-elevated"
              >
                <Download size={16} /> Download CSV
              </Button>
            </div>
            <div className="space-y-2">
              {results.rows.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated"
                >
                  <div className="text-text-muted text-xs font-mono w-24">
                    {r.date}
                  </div>
                  <div className="text-text-muted text-xs w-28">{r.country}</div>
                  <div className="flex-1 text-text-secondary text-sm">{r.summary}</div>
                  <div
                    className={`font-mono text-sm ${r.movePct >= 0 ? "text-price-up" : "text-price-down"}`}
                  >
                    {r.movePct >= 0 ? "+" : ""}
                    {r.movePct.toFixed(2)}%
                  </div>
                  <div className={r.correct ? "text-success" : "text-danger"}>
                    {r.correct ? "✓" : "✗"}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
