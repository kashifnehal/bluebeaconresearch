import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart2, Bell, BrainCircuit, Code2, Map, Radar, Shield, Zap, Globe, Radio, Target, ChevronRight, Check } from "lucide-react";
import { createClient } from "./../lib/supabase-server";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "GeoSignal — Tactical conflict intelligence for high-frequency trading.",
  description:
    "Real-time AI-powered signal feed: conflict events → physical asset impact. Sub-second latency. No noise. Pure intelligence.",
  openGraph: {
    title: "GeoSignal — Tactical conflict intelligence for high-frequency trading.",
    description:
      "Real-time AI-powered signal feed: conflict events → physical asset impact. Sub-second latency. No noise. Pure intelligence.",
    type: "website",
  },
};

type LandingSignalPreview = {
  id: string;
  title: string;
  summary: string;
  severity: number;
  confidence: number;
  country: string;
  region: string | null;
  sources_count: number | null;
  is_breaking: boolean | null;
  created_at: string;
  commodity_impacts: Array<{ asset: string; direction: string; confidence: number }> | null;
};

function formatPct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function severityLabel(score: number) {
  if (score >= 10) return "CRITICAL";
  if (score >= 9) return "EXTREME";
  if (score >= 8) return "HIGH";
  if (score >= 7) return "ELEVATED";
  return "MONITORING";
}

async function getLatestSignal(): Promise<LandingSignalPreview | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("signals")
      .select(
        "id,title,summary,severity,confidence,country,region,sources_count,is_breaking,created_at,commodity_impacts",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return (data as LandingSignalPreview) ?? null;
  } catch {
    return null;
  }
}

export default async function Home() {
  const latestSignal = await getLatestSignal();

  return (
    <div className="min-h-screen bg-black text-text-primary selection:bg-accent selection:text-bg-app overflow-x-hidden">
      {/* ── Tactical Overlay ────────────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20">
         <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />
         <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black" />
      </div>

      <header className="fixed top-0 z-50 w-full border-b border-white/5 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
             <Logo size="sm" />
          </Link>

          <nav className="hidden items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted md:flex" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <a href="#features" className="hover:text-accent transition-colors">Tactical Modules</a>
            <a href="#pricing" className="hover:text-accent transition-colors">Access Tiers</a>
            <a href="#api" className="hover:text-accent transition-colors">Interface (API)</a>
            <Link href="/docs" className="hover:text-accent transition-colors">Intel Docs</Link>
          </nav>

          <div className="flex items-center gap-6">
            <Link href="/login" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:text-text-primary transition-colors" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Auth
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-10 items-center bg-accent px-6 text-[10px] font-black uppercase tracking-[0.2em] text-bg-app hover:scale-[1.05] transition-all rounded-sm"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Request Clearance
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* ── Hero Section ────────────────────────────────────────── */}
        <section className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-6 pt-24 text-center">
          <div className="inline-flex items-center gap-3 border border-accent/20 bg-accent/5 px-4 py-1.5 rounded-sm mb-12 animate-pulse">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
               Global Monitoring Active: 147 Nodes Online
            </span>
          </div>

          <h1 className="text-balance text-6xl font-black leading-[0.85] tracking-tighter md:text-9xl uppercase italic mb-8" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Conflict signals. <br />
            <span className="text-transparent" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.2)' }}>Market Alpha.</span>
          </h1>
          
          <p className="max-w-xl text-[11px] font-black uppercase tracking-[0.2em] text-muted leading-relaxed mb-12">
             Real-time AI synthesis of geopolitical unrest mapped to commodity volatility. <br />
             Cheaper than Bloomberg Professional. Faster than Stratfor intelligence.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="group inline-flex h-14 items-center gap-4 bg-accent px-10 text-[11px] font-black uppercase tracking-[0.2em] text-bg-app hover:scale-[1.02] transition-all rounded-sm shadow-[0_0_30px_rgba(78,222,163,0.15)]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Establish Intelligence Link <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          
          <div className="mt-20 w-full max-w-4xl opacity-50 flex items-center justify-between text-[8px] font-mono text-muted uppercase tracking-[0.5em] border-t border-white/5 pt-4">
             <span>SECURE TRANSMISSION</span>
             <span>GEO-SPATIAL LAYER ALPHA</span>
             <span>LATENCY: 42MS</span>
          </div>
        </section>

        {/* ── Live Signal Preview ─────────────────────────────────── */}
        <section id="live" className="mx-auto max-w-7xl px-6 py-32 border-t border-white/5">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
              <div>
                 <span className="text-accent text-[10px] font-black uppercase tracking-[0.3em] mb-4 block" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Live Feed Snapshot</span>
                 <h2 className="text-5xl font-black text-text-primary tracking-tighter leading-none mb-8 uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>The Speed of Intelligence</h2>
                 <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted leading-loose mb-8">
                    Our neural network processes thousands of OND (Open Network Data) strings per minute to synthesize actionable signals before they hit mainstream volatility indexes.
                 </p>
                 <Link href="/signup" className="text-[10px] font-black uppercase tracking-[0.3em] text-text-primary flex items-center gap-2 hover:text-accent transition-colors" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    View Full Mainframe <ChevronRight size={14} />
                 </Link>
              </div>

              <div className="relative group">
                 {/* Decorative elements */}
                 <div className="absolute -inset-4 bg-accent/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                 
                 <div className={cn(
                    "relative overflow-hidden border border-white/10 bg-[#131313]/50 backdrop-blur-2xl p-8 rounded-sm",
                    "transition-all duration-700 hover:border-accent/40"
                 )}>
                    {latestSignal ? (
                      <>
                        <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                           <div className="flex items-center gap-4">
                              <Badge className={cn("rounded-none font-black tracking-widest text-[9px]", latestSignal.severity >= 8 ? "bg-danger text-white" : "bg-accent/20 text-accent")}>
                                {severityLabel(latestSignal.severity)} — LVL 0{latestSignal.severity}
                              </Badge>
                              <span className="font-mono text-[9px] text-muted uppercase tracking-widest">{latestSignal.region}</span>
                           </div>
                           <span className="font-mono text-[9px] text-accent tracking-widest">{formatPct(latestSignal.confidence)} CONFIDENCE</span>
                        </div>

                        <h3 className="text-2xl font-black text-text-primary leading-tight mb-4 uppercase tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{latestSignal.title}</h3>
                        <p className="text-[10px] font-bold text-muted uppercase leading-relaxed mb-8 tracking-wide italic">"{latestSignal.summary}"</p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {(latestSignal.commodity_impacts ?? []).slice(0, 4).map((c) => (
                            <div key={c.asset} className="bg-black/40 border border-white/5 p-4 rounded-sm">
                               <div className="font-mono text-[10px] text-text-primary mb-1">{c.asset}</div>
                               <div className="text-[8px] font-black text-muted uppercase tracking-widest transition-colors group-hover:text-accent">DETECTION: {formatPct(c.confidence)}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="h-64 flex items-center justify-center text-[9px] font-black uppercase tracking-[0.3em] text-muted animate-pulse">
                         SYNCING WITH MAIN DATAFLOW...
                      </div>
                    )}
                    
                    {/* Scanning Line */}
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-accent/20 animate-scan pointer-events-none" />
                 </div>
              </div>
           </div>
        </section>

        {/* ── Features Matrix ─────────────────────────────────────── */}
        <section id="features" className="mx-auto max-w-7xl px-6 py-32 bg-[#131313]/30">
          <div className="text-center mb-24">
             <span className="text-accent text-[10px] font-black uppercase tracking-[0.3em] mb-4 block" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Tactical Deployment</span>
             <h2 className="text-6xl font-black text-text-primary tracking-tighter leading-none mb-4 uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Operational Parameters</h2>
          </div>

          <div className="grid gap-px bg-white/5 border border-white/5 md:grid-cols-3">
             {[
               { icon: Radar, title: "Threat Detection", desc: "Autonomous scanning of ACLED, GNews, and proprietary military datasets with sub-second analysis." },
               { icon: BrainCircuit, title: "Neural Synthesis", desc: "Multi-modal AI models correlate civil unrest vectors with physical asset volatility signatures." },
               { icon: Target, title: "Precision Mapping", desc: "Interactive intelligence layers covering chokepoints, pipelines, and extraction zones worldwide." },
               { icon: Shield, title: "Risk Mitigation", desc: "Real-time sanctions tracking and counterparty scanning for institutional compliance." },
               { icon: Code2, title: "Low Latency API", desc: "Structured binary and JSON payloads delivered via global edge clusters for algo-systems." },
               { icon: Radio, title: "Uplink Alerts", desc: "Synchronized tactical delivery across encrypted channels including Telegram and dedicated Slacks." }
             ].map((f, i) => (
                <div key={f.title} className="bg-black p-12 transition-all group hover:bg-accent/[0.02]">
                   <f.icon className="h-8 w-8 text-white/20 mb-8 transition-colors group-hover:text-accent" />
                   <h3 className="text-[11px] font-black text-text-primary uppercase tracking-[0.2em] mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{f.title}</h3>
                   <p className="text-[10px] font-bold text-muted uppercase leading-loose tracking-widest">{f.desc}</p>
                </div>
             ))}
          </div>
        </section>

        {/* ── Pricing Matrix ──────────────────────────────────────── */}
        <section id="pricing" className="mx-auto max-w-7xl px-6 py-32">
           <div className="text-center mb-24">
             <span className="text-accent text-[10px] font-black uppercase tracking-[0.3em] mb-4 block" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Authorization Tiers</span>
             <h2 className="text-6xl font-black text-text-primary tracking-tighter leading-none mb-4 uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Clearance Levels</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { name: "Level 1: Monitor", price: "$0", desc: "Basic Signal Feed", features: ["1 Hour Latency", "Global Regions", "Email Alerts"] },
              { name: "Level 2: Analyst", price: "$49", desc: "Real-time Intelligence", features: ["Real-time Feed", "Asset Correlation", "Telegram Uplink"] },
              { name: "Level 3: Pro", price: "$199", desc: "Full Tactical Suite", features: ["Sub-second API", "Backtesting Lab", "Priority Buffers"] },
            ].map((p, i) => (
              <div key={p.name} className={cn(
                 "p-12 border border-white/5 rounded-sm transition-all flex flex-col",
                 i === 2 ? "bg-accent/[0.03] border-accent/20" : "bg-[#131313]/30"
              )}>
                <div className="text-[10px] font-black text-text-primary uppercase tracking-[0.3em] mb-8" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{p.name}</div>
                <div className="mb-8">
                  <span className="font-mono text-5xl font-black">{p.price}</span>
                  <span className="ml-2 font-black text-[9px] text-muted uppercase tracking-widest">/ Month</span>
                </div>
                
                <ul className="mb-12 space-y-6 flex-1">
                   {p.features.map(f => (
                      <li key={f} className="flex items-center gap-3 text-[9px] font-black text-muted uppercase tracking-[0.2em]">
                         <Check size={12} className="text-accent" /> {f}
                      </li>
                   ))}
                </ul>

                <Link
                  href="/signup"
                  className={cn(
                    "inline-flex h-14 w-full items-center justify-center text-[10px] font-black uppercase tracking-[0.3em] transition-all rounded-sm",
                    i === 2 ? "bg-accent text-bg-app hover:scale-[1.02]" : "border border-white/10 hover:border-white/20 text-text-primary"
                  )}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {i === 0 ? "Request Base Access" : "Initiate Protocol"}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── API Section ─────────────────────────────────────────── */}
        <section id="api" className="mx-auto max-w-7xl px-6 py-32 border-t border-white/5">
           <div className="bg-[#131313]/50 border border-white/5 p-16 rounded-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <Code2 size={120} className="text-accent" />
              </div>
              
              <div className="max-w-2xl relative z-10">
                <h2 className="text-4xl font-black text-text-primary tracking-tighter uppercase mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Machine Interoperability</h2>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted leading-loose mb-12">
                   Direct binary interface for algorithmic trading systems. Stream high-fidelity event signatures directly into your execution pods via global WebSocket clusters.
                </p>
                <div className="flex items-center gap-6">
                   <Link href="/signup" className="h-14 bg-white text-bg-app px-10 text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center rounded-sm hover:bg-white/90 transition-colors" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      Get API Token
                   </Link>
                   <code className="text-[10px] font-mono text-muted group-hover:text-accent transition-colors">GET /v1/signals?severity=high</code>
                </div>
              </div>
           </div>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-black py-24 relative z-10">
        <div className="mx-auto grid max-w-7xl gap-16 px-6 md:grid-cols-4">
          <div>
            <Logo size="sm" className="mb-8" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted leading-relaxed">
               Tactical intelligence for commodity and physical asset risk.
            </p>
            <p className="mt-8 text-[8px] font-mono text-muted/50 uppercase tracking-[0.2em]">
              © {new Date().getFullYear()} GEOSIGNAL INTEL. ALL RIGHTS RESERVED.
            </p>
          </div>
          
          {[
            { title: "Grid", links: ["Features", "Pricing", "Live Feed", "API Status"] },
            { title: "Protocol", links: ["Clearance", "Terms", "Privacy", "Status"] },
            { title: "Resources", links: ["Intelligence Docs", "System Logs", "Whitepapers"] }
          ].map(c => (
             <div key={c.title}>
                <h4 className="text-[10px] font-black text-text-primary uppercase tracking-[0.3em] mb-8" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{c.title}</h4>
                <ul className="space-y-4">
                   {c.links.map(l => (
                      <li key={l}>
                         <a href="#" className="text-[9px] font-black text-muted uppercase tracking-[0.2em] hover:text-accent transition-colors">{l}</a>
                      </li>
                   ))}
                </ul>
             </div>
          ))}
        </div>
      </footer>

    </div>
  );
}
