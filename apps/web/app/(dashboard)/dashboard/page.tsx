"use client";
import { useState } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface FeedItem {
  id: string;
  badge: string;
  badgeColor: "critical" | "geo" | "market";
  title: string;
  summary: string;
  timeAgo: string;
  impact?: { label: string; value: string };
  volatility?: string;
  imageUrl?: string;
  tags?: string[];
  featured?: boolean;
}

interface ListItem {
  id: string;
  time: string;
  title: string;
  confidence: number;
}

/* ─── Static placeholder data (matches Stitch screenshot) ────────────────── */
const FEED_ITEMS: FeedItem[] = [
  {
    id: "1",
    featured: true,
    badge: "PRIORITY: CRITICAL",
    badgeColor: "critical",
    title: "Emergency Sanction Policy: East Asian Tech Corridors",
    summary:
      "Intelligence indicates an immediate shift in trade compliance for semiconductors and rare earth minerals. Expected supply chain disruption index: 8.4/10.",
    timeAgo: "2 MINS AGO",
    impact: { label: "Impact Radius", value: "Global Supply" },
    volatility: "+14.2%",
  },
  {
    id: "2",
    badge: "GEOPOLITICAL STATUS",
    badgeColor: "geo",
    title: "Escalating Tensions: East Africa Transit Routes",
    summary:
      "Navigational risks identified in key maritime channels. Insurance premiums for freight expected to rise within 24 hours.",
    timeAgo: "14 MINS AGO",
    imageUrl: "https://images.unsplash.com/photo-1578496479914-7ef3b0af6a4d?auto=format&fit=crop&w=800&q=80",
    tags: ["Maritime", "Logistics"],
  },
  {
    id: "3",
    badge: "MARKET DRIFT",
    badgeColor: "market",
    title: "Automated Execution: Energy Futures Divergence",
    summary:
      "Algorithmic trading patterns detected in European gas markets. Liquidity is shifting toward mid-term contracts.",
    timeAgo: "42 MINS AGO",
    tags: ["Energy", "Automated"],
  },
];

const LIST_ITEMS: ListItem[] = [
  { id: "a", time: "11:04 AM", title: "Central Bank Digital Currency (CBDC) – Phase 2 Pilot Expansion", confidence: 94 },
  { id: "b", time: "10:31 AM", title: "Rare Earth Supply Shock: Myanmar Border Closures", confidence: 88 },
  { id: "c", time: "09:57 AM", title: "Black Sea Grain Corridor: Transit Suspended for 72h", confidence: 97 },
];

/* ─── Market Volatility Data ─────────────────────────────────────────────── */
const MARKETS = [
  { label: "Crude Oil (WTI)", risk: "High Risk", riskColor: "#4edea3", vol: "8.8", trend: "BULLISH", pct: 88 },
  { label: "Freight (Baltic Dry)", risk: "Moderate", riskColor: "#f4fed3", vol: "4.2", trend: "NEUTRAL", pct: 42 },
  { label: "Tech Commodities", risk: "Extreme", riskColor: "#ee7d77", vol: "9.4", trend: "BEARISH", pct: 94 },
];

/* ─── Chart bars (Signal Velocity) ──────────────────────────────────────── */
const BARS = [25, 45, 35, 60, 50, 80, 65, 90, 75, 100, 85, 95];

export default function DashboardPage() {
  const [filter, setFilter] = useState<"all" | "high">("all");
  const featured = FEED_ITEMS[0];
  const secondary = FEED_ITEMS.slice(1);

  return (
    <div className="flex h-full" style={{ height: "calc(100vh - 64px)" }}>
      {/* ── Center: Intelligence Feed ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-8 flex flex-col gap-6" style={{ backgroundColor: "#0e0e0e" }}>
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#e7e5e4" }}>Intelligence Feed</h1>
            <p className="text-sm mt-1" style={{ color: "#acabaa" }}>Real-time global signal monitoring</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all"
              style={{
                backgroundColor: filter === "all" ? "#4edea3" : "#131313",
                color: filter === "all" ? "#004a31" : "#acabaa",
                border: "1px solid",
                borderColor: filter === "all" ? "#4edea3" : "#484848",
              }}
            >All Signals</button>
            <button
              onClick={() => setFilter("high")}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all"
              style={{
                backgroundColor: filter === "high" ? "#4edea3" : "#131313",
                color: filter === "high" ? "#004a31" : "#acabaa",
                border: "1px solid",
                borderColor: filter === "high" ? "#4edea3" : "#4edea3",
              }}
            >High Risk</button>
          </div>
        </div>

        {/* ── Featured Critical Card ────────────────────────────────── */}
        <div
          className="rounded-xl overflow-hidden relative"
          style={{ backgroundColor: "#1a1919", border: "1px solid #484848" }}
        >
          {/* Red top bar */}
          <div className="h-1 w-full" style={{ backgroundColor: "#ee7d77" }} />
          <div className="p-6">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: "#7f2927", color: "#ff9993" }}>
                  {featured.badge}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "#acabaa" }}>ID: SIG-8829-X</span>
              </div>
              <span className="text-[10px] font-mono shrink-0" style={{ color: "#acabaa" }}>{featured.timeAgo}</span>
            </div>
            <h2 className="text-2xl font-bold mb-3 leading-tight" style={{ color: "#e7e5e4" }}>{featured.title}</h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "#acabaa" }}>{featured.summary}</p>
            <div className="flex items-end justify-between">
              <div className="flex gap-8">
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#acabaa" }}>Impact Radius</div>
                  <div className="text-sm font-bold" style={{ color: "#4edea3" }}>Global Supply</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#acabaa" }}>Volatility</div>
                  <div className="text-sm font-bold" style={{ color: "#4edea3" }}>+14.2%</div>
                </div>
              </div>
              <button
                className="px-6 py-2.5 rounded text-sm font-bold uppercase tracking-widest hover:brightness-110 transition-all"
                style={{ backgroundColor: "#4edea3", color: "#004a31" }}
              >
                Analyze Impact
              </button>
            </div>
          </div>
        </div>

        {/* ── Two-column secondary cards ────────────────────────────── */}
        <div className="grid grid-cols-2 gap-6">
          {/* Geopolitical Status card */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#131313", border: "1px solid #484848" }}>
            <div className="relative h-48 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1578496479914-7ef3b0af6a4d?auto=format&fit=crop&w=700&q=80"
                alt="Maritime"
                className="w-full h-full object-cover"
                style={{ filter: "grayscale(30%)" }}
              />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 30%, #131313)" }} />
              <div className="absolute top-3 left-3">
                <span className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest" style={{ backgroundColor: "rgba(0,0,0,0.6)", border: "1px solid rgba(78,222,163,0.3)", color: "#4edea3" }}>
                  Geopolitical Status
                </span>
              </div>
            </div>
            <div className="p-5">
              <div className="text-[10px] mb-2 font-mono uppercase tracking-widest" style={{ color: "#acabaa" }}>{secondary[0].timeAgo}</div>
              <h3 className="text-lg font-bold mb-2 leading-tight" style={{ color: "#e7e5e4" }}>{secondary[0].title}</h3>
              <p className="text-sm mb-4" style={{ color: "#acabaa" }}>{secondary[0].summary}</p>
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex gap-2">
                  {secondary[0].tags?.map(t => (
                    <span key={t} className="px-2 py-1 rounded text-[10px]" style={{ backgroundColor: "#262626", color: "#acabaa" }}>{t}</span>
                  ))}
                </div>
                <span className="text-sm" style={{ color: "#4edea3" }}>↗</span>
              </div>
            </div>
          </div>

          {/* Market Drift card */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#131313", border: "1px solid #484848" }}>
            {/* Mini bar chart */}
            <div className="relative h-48 flex items-end justify-between gap-1 px-4 py-4" style={{ background: "linear-gradient(to bottom, #0e0e0e, #131313)" }}>
              <div className="absolute top-3 left-3">
                <span className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest" style={{ backgroundColor: "rgba(0,0,0,0.6)", border: "1px solid rgba(78,222,163,0.3)", color: "#4edea3" }}>
                  Market Drift
                </span>
              </div>
              {BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${h}%`,
                    backgroundColor: "#4edea3",
                    opacity: 0.15 + (i / BARS.length) * 0.85,
                  }}
                />
              ))}
            </div>
            <div className="p-5">
              <div className="text-[10px] mb-2 font-mono uppercase tracking-widest" style={{ color: "#acabaa" }}>{secondary[1].timeAgo}</div>
              <h3 className="text-lg font-bold mb-2 leading-tight" style={{ color: "#e7e5e4" }}>{secondary[1].title}</h3>
              <p className="text-sm mb-4" style={{ color: "#acabaa" }}>{secondary[1].summary}</p>
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex gap-2">
                  {secondary[1].tags?.map(t => (
                    <span key={t} className="px-2 py-1 rounded text-[10px]" style={{ backgroundColor: "#262626", color: "#acabaa" }}>{t}</span>
                  ))}
                </div>
                <span className="text-sm" style={{ color: "#4edea3" }}>⚡</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── List Items ────────────────────────────────────────────── */}
        <div className="flex flex-col" style={{ borderTop: "1px solid rgba(72,72,72,0.2)" }}>
          {LIST_ITEMS.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-4 px-2 py-4 cursor-pointer hover:bg-white/5 transition-colors"
              style={{ borderBottom: "1px solid rgba(72,72,72,0.1)" }}
            >
              <span className="w-2 h-2 rounded-full shrink-0 bg-primary" style={{ backgroundColor: "#4edea3" }} />
              <span className="text-[10px] font-mono w-16 shrink-0" style={{ color: "#acabaa" }}>{item.time}</span>
              <span className="text-sm flex-1 truncate" style={{ color: "#e7e5e4" }}>{item.title}</span>
              <span className="text-[10px] font-mono shrink-0" style={{ color: "#acabaa" }}>Confidence: {item.confidence}%</span>
              <span style={{ color: "#acabaa" }}>›</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Sidebar ─────────────────────────────────────────────── */}
      <aside
        className="shrink-0 flex flex-col overflow-hidden hidden xl:flex"
        style={{
          width: "260px",
          height: "calc(100vh - 64px)",
          backgroundColor: "#0e0e0e",
          borderLeft: "1px solid rgba(72,72,72,0.15)",
        }}
      >
        {/* Ticker */}
        <div className="flex items-center gap-6 px-4 py-2 overflow-hidden text-[10px] font-mono uppercase tracking-widest shrink-0" style={{ backgroundColor: "#000", borderBottom: "1px solid rgba(72,72,72,0.15)", whiteSpace: "nowrap" }}>
          <span style={{ color: "#acabaa" }}>Crude Oil</span>
          <span style={{ color: "#4edea3" }}>74.21 (+0.4%)</span>
          <span style={{ color: "#acabaa" }}>WTI</span>
          <span style={{ color: "#ee7d77" }}>70.12 (-1.2%)</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          {/* Market Volatility Index */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#acabaa" }}>Market Volatility Index</h4>
              <span style={{ color: "#acabaa", fontSize: "16px" }}>↗</span>
            </div>
            <div className="flex flex-col gap-3">
              {MARKETS.map(m => (
                <div key={m.label} className="p-3 rounded-lg" style={{ backgroundColor: "#0e0e0e", border: "1px solid rgba(72,72,72,0.15)" }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold" style={{ color: "#e7e5e4" }}>{m.label}</span>
                    <span className="text-xs font-bold" style={{ color: m.riskColor }}>{m.risk}</span>
                  </div>
                  <div className="w-full rounded-full overflow-hidden mb-1" style={{ height: "2px", backgroundColor: "#262626" }}>
                    <div className="h-full rounded-full" style={{ width: `${m.pct}%`, backgroundColor: m.riskColor }} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[9px]" style={{ color: "#acabaa" }}>VOLATILITY: {m.vol}</span>
                    <span className="text-[9px]" style={{ color: "#acabaa" }}>TREND: {m.trend}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sentinel AI Synthesis */}
          <div className="p-4 rounded-xl relative overflow-hidden" style={{ backgroundColor: "#0e0e0e", border: "1px solid rgba(78,222,163,0.2)" }}>
            <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full" style={{ backgroundColor: "rgba(78,222,163,0.05)", filter: "blur(20px)" }} />
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#4edea3" }} />
              <h4 className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "#4edea3" }}>Sentinel AI Synthesis</h4>
            </div>
            <p className="text-[11px] leading-relaxed mb-4 relative z-10" style={{ color: "#acabaa" }}>
              &quot;Convergence detected between sanctions in East Asia and energy pricing in Europe. Probability of regional market correction within 72 hours is{" "}
              <span className="font-bold" style={{ color: "#4edea3" }}>67%</span>. Immediate focus: Diversify logistics corridors.&quot;
            </p>
            <button
              className="w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest relative z-10 hover:brightness-110 transition-all"
              style={{ backgroundColor: "#131313", border: "1px solid rgba(72,72,72,0.3)", color: "#acabaa" }}
            >
              Generate Full Report
            </button>
          </div>

          {/* Active Hotzones mini-map */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#acabaa" }}>Active Hotzones</h4>
              <span style={{ color: "#acabaa", fontSize: "14px" }}>⊟</span>
            </div>
            <div className="rounded-xl overflow-hidden relative" style={{ height: "120px", backgroundColor: "#000" }}>
              <img
                src="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=500&q=60"
                alt="World map"
                className="w-full h-full object-cover"
                style={{ filter: "grayscale(100%) brightness(0.4)" }}
              />
              {/* Pulse dots */}
              <div className="absolute" style={{ top: "30%", left: "55%", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#4edea3", animation: "pulse 2s infinite" }} />
              <div className="absolute" style={{ top: "45%", left: "75%", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#ee7d77", animation: "pulse 2s infinite 0.5s" }} />
            </div>
          </div>
        </div>

        {/* Footer stats */}
        <div className="px-5 py-3 shrink-0 flex justify-between text-[9px]" style={{ backgroundColor: "#000", borderTop: "1px solid rgba(72,72,72,0.15)", color: "#acabaa" }}>
          <div>SYSTEM LATENCY: <span style={{ color: "#4edea3" }}>12ms</span></div>
          <div>UPTIME: <span style={{ color: "#e7e5e4" }}>99.98%</span></div>
        </div>

        {/* Execute Strategy FAB */}
        <div className="px-3 py-3 shrink-0" style={{ backgroundColor: "#000" }}>
          <button
            className="w-full py-3 rounded-full text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:brightness-110 transition-all"
            style={{ background: "linear-gradient(to right, #4edea3, #005236)", color: "#004a31" }}
          >
            <span>⚡</span> Execute Strategy
          </button>
        </div>
      </aside>
    </div>
  );
}
