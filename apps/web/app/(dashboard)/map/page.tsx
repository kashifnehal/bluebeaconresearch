"use client";
import { useQuery } from "@tanstack/react-query";
import type { Signal } from "@geosignal/shared";
import { formatDistanceToNowStrict } from "date-fns";

export default function MapPage() {
  const { data } = useQuery({
    queryKey: ["signals", "feed"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      return (await res.json()) as { signals: Signal[] };
    },
    refetchInterval: 30_000,
  });

  const signals = data?.signals ?? [];
  const liveItems = signals.slice(0, 6);

  return (
    <div className="flex flex-col bg-surface-container-lowest" style={{ height: "calc(100vh - 64px)", overflow: "hidden", position: "relative" }}>
      {/* Background Tactical Map */}
      <div className="absolute inset-0 z-0">
        <div
          className="w-full h-full opacity-40 bg-cover bg-center grayscale contrast-125"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=2000')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-surface/80 via-transparent to-surface/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-transparent to-surface/40" />
      </div>

      {/* Hotspot: Signal Omega (Europe) */}
      <div className="absolute top-1/4 left-1/3 z-10">
        <div className="relative">
          <div className="w-4 h-4 rounded-full bg-primary" style={{
            boxShadow: "0 0 0 0 rgba(78, 222, 163, 0.7)",
            animation: "pulse-emerald 2s infinite",
          }} />
          <div className="absolute top-6 left-6 border border-primary/20 p-2 rounded-lg min-w-[120px]" style={{ background: "rgba(38,38,38,0.6)", backdropFilter: "blur(20px)" }}>
            <p className="text-[9px] uppercase tracking-widest text-primary font-bold">Signal: Omega-7</p>
            <p className="text-xs text-white">Kyiv Displacement</p>
            <p className="text-[10px] text-on-surface-variant">Conf: 98.4%</p>
          </div>
        </div>
      </div>

      {/* Hotspot: Alert High Tension (Asia) */}
      <div className="absolute bottom-1/3 right-1/4 z-10">
        <div className="relative">
          <div className="w-3 h-3 rounded-full bg-error animate-pulse" />
          <div className="absolute top-5 -left-24 border border-error/20 p-2 rounded-lg min-w-[120px] text-right" style={{ background: "rgba(38,38,38,0.6)", backdropFilter: "blur(20px)" }}>
            <p className="text-[9px] uppercase tracking-widest text-error font-bold">Alert: High Tension</p>
            <p className="text-xs text-white">Taiwan Strait</p>
            <p className="text-[10px] text-on-surface-variant">Vessel Movement detected</p>
          </div>
        </div>
      </div>

      {/* Global Tension Index (Top Left) */}
      <div className="absolute top-6 left-6 z-20 w-80 space-y-4">
        <div className="p-5 rounded-xl border border-outline-variant/10" style={{ background: "rgba(38,38,38,0.6)", backdropFilter: "blur(20px)" }}>
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bold">Global Tension Index</p>
              <h2 className="text-3xl font-extrabold tracking-tighter text-white">74.8<span className="text-sm text-error ml-1">▲ 2.4</span></h2>
            </div>
            <span className="material-symbols-outlined text-primary text-3xl" style={{ fontFamily: "Material Symbols Outlined", fontVariationSettings: "'FILL' 1" }}>insights</span>
          </div>
          <div className="space-y-3">
            {[
              { label: "Cyber Warfare", value: 88 },
              { label: "Kinetic Conflict", value: 42 },
              { label: "Diplomatic Friction", value: 65 },
            ].map(r => (
              <div key={r.label}>
                <div className="flex justify-between text-[10px] uppercase tracking-widest mb-1">
                  <span className="text-on-surface-variant">{r.label}</span>
                  <span className="text-primary font-bold">{r.value}%</span>
                </div>
                <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${r.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-outline-variant/10" style={{ background: "rgba(38,38,38,0.6)", backdropFilter: "blur(20px)" }}>
          <p className="text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bold mb-3">Active Sentiment</p>
          <div className="flex gap-2">
            {[
              { label: "Bullish", val: "24.5%", color: "text-primary" },
              { label: "Neutral", val: "52.1%", color: "text-primary", active: true },
              { label: "Bearish", val: "23.4%", color: "text-error" },
            ].map(s => (
              <div key={s.label} className={`flex-1 bg-surface-container-lowest/50 p-2 rounded flex flex-col items-center ${s.active ? "border-b-2 border-primary" : ""}`}>
                <span className="text-xs font-bold text-white">{s.label}</span>
                <span className={`text-[9px] ${s.color}`}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Intelligence Feed (Right Side) */}
      <div className="absolute top-6 right-6 bottom-6 z-20 w-80 rounded-xl border border-outline-variant/10 flex flex-col overflow-hidden" style={{ background: "rgba(38,38,38,0.6)", backdropFilter: "blur(20px)" }}>
        <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <h3 className="text-[11px] uppercase tracking-[0.15em] font-bold text-white">Live Intelligence</h3>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {liveItems.map((signal, i) => {
            const timeAgo = formatDistanceToNowStrict(new Date(signal.createdAt), { addSuffix: true });
            const isUrgent = signal.severity >= 9;
            return (
              <div key={signal.id}>
                <div className="space-y-2 group cursor-pointer" onClick={() => { window.location.href = `/events/${signal.id}`; }}>
                  <div className="flex justify-between items-start">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border ${isUrgent ? "bg-error-container/30 text-error border-error/20" : "bg-primary-container/30 text-primary border-primary/20"}`}>
                      {isUrgent ? "Urgent" : "Satellite"}
                    </span>
                    <span className="text-[9px] text-on-surface-variant">{timeAgo}</span>
                  </div>
                  <p className="text-xs text-on-surface leading-relaxed group-hover:text-white transition-colors line-clamp-2">{signal.title}</p>
                  <div className="flex gap-2 items-center text-[9px] text-on-surface-variant">
                    <span className="material-symbols-outlined text-[10px]" style={{ fontFamily: "Material Symbols Outlined" }}>share</span>
                    <span>Forward to Command</span>
                  </div>
                </div>
                {i < liveItems.length - 1 && <div className="h-px bg-outline-variant/10 mt-4" />}
              </div>
            );
          })}
          {liveItems.length === 0 && (
            <p className="text-[10px] text-on-surface-variant text-center pt-8">Awaiting intelligence stream...</p>
          )}
        </div>
        <div className="p-3 bg-surface-container-lowest/80 border-t border-outline-variant/10">
          <button onClick={() => { window.location.href = "/dashboard"; }} className="w-full py-2 bg-primary text-on-primary rounded text-[10px] font-bold uppercase tracking-[0.1em] hover:brightness-110 transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined", fontVariationSettings: "'FILL' 1" }}>terminal</span>
            Open Full Terminal
          </button>
        </div>
      </div>

      {/* Map Controls (Bottom Left) */}
      <div className="absolute bottom-6 left-6 z-20 flex flex-col gap-2">
        <div className="p-2 rounded-lg border border-outline-variant/10 flex flex-col gap-1" style={{ background: "rgba(38,38,38,0.6)", backdropFilter: "blur(20px)" }}>
          <button className="w-8 h-8 rounded bg-surface-container hover:bg-surface-bright flex items-center justify-center text-on-surface transition-colors">
            <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined" }}>add</span>
          </button>
          <button className="w-8 h-8 rounded bg-surface-container hover:bg-surface-bright flex items-center justify-center text-on-surface transition-colors">
            <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined" }}>remove</span>
          </button>
        </div>
        <button className="w-10 h-10 rounded-lg border border-outline-variant/10 flex items-center justify-center text-primary hover:text-white transition-colors" style={{ background: "rgba(38,38,38,0.6)", backdropFilter: "blur(20px)" }}>
          <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined" }}>layers</span>
        </button>
      </div>

      {/* Ticker (Bottom Center) */}
      <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 px-6 py-2 rounded-full border border-outline-variant/10 flex items-center gap-8 overflow-hidden" style={{ width: "calc(100% - 800px)", minWidth: "300px", background: "rgba(38,38,38,0.6)", backdropFilter: "blur(20px)" }}>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] font-bold uppercase text-on-surface-variant tracking-widest">Global Ticker:</span>
        </div>
        <div className="flex items-center gap-10 whitespace-nowrap overflow-hidden">
          {[
            { label: "BTC/USD", val: "64,281.40 (+1.2%)", up: true },
            { label: "BRENT", val: "82.14 (-0.4%)", up: false },
            { label: "GOLD", val: "2,154.20 (+0.8%)", up: true },
            { label: "EUR/USD", val: "1.08 (-0.1%)", up: null },
          ].map(t => (
            <div key={t.label} className="flex items-center gap-2">
              <span className="text-[10px] text-white font-medium">{t.label}</span>
              <span className={`text-[10px] ${t.up === true ? "text-primary" : t.up === false ? "text-error" : "text-on-surface-variant"}`}>{t.val}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse-emerald {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(78,222,163,0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(78,222,163,0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(78,222,163,0); }
        }
      `}</style>
    </div>
  );
}
