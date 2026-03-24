"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Signal } from "@geosignal/shared";
import { formatDistanceToNowStrict, format } from "date-fns";
import { useSignalFeed } from "@/hooks/useSignalFeed";
import { useAuthStore } from "@/store/useAuthStore";

export default function AlertsPage() {
  const planTier = useAuthStore((s) => s.planTier);
  const sseEnabled = planTier === "analyst" || planTier === "pro" || planTier === "api";
  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const { data } = useQuery({
    queryKey: ["signals", "list"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      return (await res.json()) as { signals: Signal[] };
    },
    refetchInterval: 30_000,
  });
  const { liveSignals } = useSignalFeed({ enabled: sseEnabled });
  const merged = useMemo(() => {
    const map = new Map<string, Signal>();
    for (const s of liveSignals) map.set(s.id, s);
    for (const s of data?.signals ?? []) if (!map.has(s.id)) map.set(s.id, s);
    return Array.from(map.values()).slice(0, 100);
  }, [data?.signals, liveSignals]);

  const filtered = merged.filter(s => {
    if (severityFilter === "high") return s.severity >= 7;
    if (severityFilter === "medium") return s.severity >= 4 && s.severity < 7;
    if (severityFilter === "low") return s.severity < 4;
    return true;
  });

  return (
    <div className="overflow-y-auto flex-1 px-8 py-6" style={{ height: "calc(100vh - 64px)" }}>

      {/* Feed Controls */}
      <div className="flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-on-surface">Intelligence Feed</h1>
            <p className="text-on-surface-variant text-sm mt-1">Real-time global signal monitoring and risk assessment.</p>
          </div>
          <div className="flex bg-surface-container-low p-1 rounded-lg">
            <button
              onClick={() => setSeverityFilter("all")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${severityFilter === "all" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}
            >All Signals</button>
            <button
              onClick={() => setSeverityFilter("high")}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${severityFilter === "high" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}
            >Watchlist</button>
            <button
              onClick={() => setSeverityFilter("low")}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${severityFilter === "low" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}
            >Archives</button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant mr-2">Severity:</span>
            <button onClick={() => setSeverityFilter("high")} className="px-3 py-1 rounded bg-error-container/20 text-error text-[11px] font-bold uppercase border border-error/20 hover:bg-error-container/40 transition-colors">High</button>
            <button onClick={() => setSeverityFilter("medium")} className="px-3 py-1 rounded bg-tertiary-container/10 text-tertiary text-[11px] font-bold uppercase border border-tertiary/20 hover:bg-tertiary-container/20 transition-colors">Medium</button>
            <button onClick={() => setSeverityFilter("low")} className="px-3 py-1 rounded bg-primary-container/10 text-primary text-[11px] font-bold uppercase border border-primary/20 hover:bg-primary-container/20 transition-colors">Low</button>
            <button onClick={() => setSeverityFilter("all")} className="px-3 py-1 rounded bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase border border-outline-variant/30 hover:bg-surface-bright transition-colors">Global</button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined" }}>filter_list</span>
              <span>Filter by Sector</span>
            </div>
            <div className="w-[1px] h-4 bg-outline-variant/20" />
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined" }}>schedule</span>
              <span>Last 24 Hours</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Intelligence Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Featured Critical Card */}
        {filtered.filter(s => s.severity >= 9).slice(0, 1).map(signal => (
          <div key={signal.id} onClick={() => (window.location.href = `/events/${signal.id}`)} className="col-span-12 lg:col-span-8 group relative overflow-hidden rounded-xl bg-surface-container border border-outline-variant/20 hover:border-primary/40 transition-all duration-300 cursor-pointer">
            <div className="relative p-8 flex flex-col h-full">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-error/10 p-2 rounded-lg">
                    <span className="material-symbols-outlined text-error" style={{ fontFamily: "Material Symbols Outlined", fontVariationSettings: "'FILL' 1" }}>warning</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-error uppercase tracking-widest">Critical Disruption</span>
                    <h2 className="text-2xl font-bold text-on-surface leading-tight group-hover:text-primary transition-colors">{signal.title}</h2>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-on-surface font-mono font-bold text-lg">{format(new Date(signal.createdAt), "HH:mm 'UTC'")}</div>
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">Signal Detected</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/10">
                  <div className="text-[10px] text-on-surface-variant uppercase mb-1">Impact Level</div>
                  <div className="text-xl font-bold text-error">Extreme</div>
                </div>
                <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/10">
                  <div className="text-[10px] text-on-surface-variant uppercase mb-1">Sources</div>
                  <div className="text-xl font-bold text-on-surface">{signal.sourcesCount}</div>
                </div>
                <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/10">
                  <div className="text-[10px] text-on-surface-variant uppercase mb-1">Region</div>
                  <div className="text-xl font-bold text-on-surface">{signal.country}</div>
                </div>
              </div>
              <p className="text-on-surface-variant leading-relaxed mb-8 max-w-2xl line-clamp-3">{signal.summary}</p>
              <div className="mt-auto flex items-center justify-between pt-6 border-t border-outline-variant/10">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container-highest flex items-center justify-center text-[10px] font-bold">AI</div>
                  <div className="w-8 h-8 rounded-full border-2 border-surface bg-primary text-on-primary flex items-center justify-center text-[10px] font-bold">GS</div>
                </div>
                <button className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-2 rounded font-bold text-xs uppercase tracking-wider transition-transform hover:scale-105 active:scale-95">
                  Open Terminal Access
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Secondary Signal Card */}
        {filtered.filter(s => s.severity >= 7 && s.severity < 9).slice(0, 1).map(signal => (
          <div key={signal.id} onClick={() => (window.location.href = `/events/${signal.id}`)} className="col-span-12 lg:col-span-4 rounded-xl bg-surface-container-low border border-outline-variant/20 p-6 flex flex-col hover:border-primary/40 transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-widest border border-primary/20">Escalating</span>
              <span className="text-[10px] text-on-surface-variant">{formatDistanceToNowStrict(new Date(signal.createdAt), { addSuffix: true })}</span>
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-2 line-clamp-2">{signal.title}</h3>
            <p className="text-sm text-on-surface-variant mb-6 line-clamp-4">{signal.summary}</p>
            {/* Bar chart visual */}
            <div className="mb-6 rounded-lg overflow-hidden h-32 relative bg-surface-container-lowest border border-outline-variant/10">
              <div className="absolute inset-0 px-4 py-4 flex items-end justify-between gap-1">
                {[40, 60, 35, 75, 50, 100, 70].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-sm bg-primary" style={{ height: `${h}%`, opacity: 0.2 + i * 0.12 }} />
                ))}
              </div>
            </div>
            <div className="space-y-3 mt-auto">
              <div className="flex justify-between text-[11px]">
                <span className="text-on-surface-variant">Location</span>
                <span className="text-primary font-mono">{signal.country}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-on-surface-variant">Severity Score</span>
                <span className="text-error font-mono">{signal.severity}/10</span>
              </div>
            </div>
          </div>
        ))}

        {/* Signal Velocity Chart */}
        <div className="col-span-12 lg:col-span-4 rounded-xl border border-outline-variant/20 p-6" style={{ background: "rgba(38,38,38,0.6)", backdropFilter: "blur(20px)" }}>
          <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Signal Velocity</h4>
          <div className="h-40 flex items-end justify-between gap-1 px-2">
            {[40, 60, 55, 75, 90, 100, 85].map((h, i) => (
              <div key={i} className="w-full rounded-t-sm bg-primary" style={{ height: `${h}%`, opacity: 0.2 + i * 0.12 }} />
            ))}
          </div>
          <div className="mt-4 flex justify-between text-[9px] text-on-surface-variant font-bold uppercase tracking-tighter">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>NOW</span>
          </div>
        </div>

        {/* Intelligence List */}
        <div className="col-span-12 lg:col-span-8 rounded-xl bg-surface-container border border-outline-variant/20 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-outline-variant/10 bg-surface-container-high/30 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Geospatial Intelligence Stream</span>
            <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-outline-variant" />
            </div>
          </div>
          <div className="flex-1 divide-y divide-outline-variant/10">
            {filtered.slice(0, 8).map(signal => (
              <div key={signal.id} onClick={() => (window.location.href = `/events/${signal.id}`)} className="px-5 py-3.5 flex items-center gap-4 hover:bg-surface-container-high/30 cursor-pointer transition-colors group">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${signal.severity >= 9 ? "bg-error" : signal.severity >= 7 ? "bg-primary" : "bg-tertiary"}`} />
                <span className="text-[10px] font-mono text-on-surface-variant w-16 shrink-0">{format(new Date(signal.createdAt), "HH:mm")}</span>
                <span className="text-sm font-medium text-on-surface flex-1 truncate group-hover:text-primary transition-colors">{signal.title}</span>
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 border ${signal.severity >= 9 ? "text-error border-error/30 bg-error-container/20" : signal.severity >= 7 ? "text-primary border-primary/30 bg-primary-container/20" : "text-on-surface-variant border-outline-variant/30"}`}>
                  {signal.severity >= 9 ? "CRITICAL" : signal.severity >= 7 ? "HIGH" : "NOTICE"}
                </span>
                <span className="material-symbols-outlined text-on-surface-variant text-sm shrink-0" style={{ fontFamily: "Material Symbols Outlined" }}>chevron_right</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-5 py-12 text-center text-on-surface-variant text-sm font-mono opacity-50">Awaiting intelligence stream...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
