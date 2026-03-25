import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "./../lib/supabase-server";
import { Logo } from "./../components/Logo";

export const metadata: Metadata = {
  title: "Blue Beacon Research | Tactical Market Intelligence",
  description: "High-fidelity geopolitical intelligence → actionable trading signals.",
  openGraph: {
    title: "Blue Beacon Research | Tactical Market Intelligence",
    description: "High-fidelity geopolitical intelligence → actionable trading signals.",
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
    <div className="bg-background text-on-surface selection:bg-primary-container selection:text-on-primary-container min-h-screen">
      {/* Sticky Header */}
      <header className="fixed top-0 left-0 right-0 h-16 glass z-50 px-8 flex items-center justify-between border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <Logo className="h-8" />
          <span className="text-xl font-extrabold tracking-tighter uppercase font-headline text-white">Blue Beacon Research</span>
        </div>
        <nav className="hidden md:flex items-center gap-10">
          <Link className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface/60 hover:text-primary transition-colors" href="#features">Tactical Modules</Link>
          <Link className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface/60 hover:text-primary transition-colors" href="#pricing">Access Tiers</Link>
        </nav>
        <div className="flex items-center gap-8">
          <Link className="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface/60 hover:text-white transition-colors" href="/login">Sign in</Link>
          <Link 
            href="/signup"
            className="bg-primary hover:bg-primary-container text-black px-6 py-2 rounded-lg font-label text-[10px] font-extrabold uppercase tracking-widest transition-all active:scale-95"
          >
            Start Free
          </Link>
        </div>
      </header>

      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-24 overflow-hidden">
          {/* Background Map Visual */}
          <div className="absolute inset-0 z-0 opacity-15 pointer-events-none">
            <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5ce?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center grayscale contrast-125"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background"></div>
          </div>
          
          <div className="relative z-10 text-center max-w-5xl mx-auto">
            <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-surface-container-high/60 rounded-full border border-primary/20 mb-10 backdrop-blur-sm">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              <span className="font-label text-[9px] font-black uppercase tracking-[0.2em] text-primary">Live — monitoring active global conflicts</span>
            </div>
            <h1 className="text-6xl md:text-8xl lg:text-[120px] font-extrabold tracking-tighter leading-[0.85] mb-10 text-white animate-in fade-in slide-in-from-bottom-4 duration-700">
              High-fidelity geopolitical intelligence <br/>
              <span className="text-primary italic">→ actionable trading signals.</span>
            </h1>
            <p className="text-on-surface/60 text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed font-medium">
              Blue Beacon Research provides high-fidelity geopolitical intelligence, synthesized into actionable trading signals for commodity and financial markets.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <Link 
                href="/signup"
                className="w-full md:w-auto px-10 py-5 bg-primary text-black font-label font-extrabold uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20"
              >
                Establish Intel Link
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </Link>
              <a className="font-label text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/40 hover:text-on-surface flex items-center gap-2 transition-colors group" href="#live">
                View Live Feed 
                <span className="material-symbols-outlined text-sm group-hover:translate-y-1 transition-transform">south</span>
              </a>
            </div>
          </div>

          <div className="absolute bottom-12 w-full max-w-6xl px-10 opacity-30 flex items-center justify-between text-[8px] font-mono font-bold text-on-surface-variant uppercase tracking-[0.4em] pointer-events-none">
             <span>Protocol: BB-ENCRYPT-CH</span>
             <span>Spatial Layer: BEACON-V1</span>
             <span>Latency: 42ms</span>
          </div>
        </section>

        {/* Live Signal Preview */}
        <section className="px-10 py-32 bg-surface-container-lowest" id="live">
          <div className="max-w-[1440px] mx-auto">
            <div className="mb-14 flex items-end justify-between">
              <div>
                <p className="font-label text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-3">Beacon Stream</p>
                <h3 className="text-4xl font-headline font-extrabold tracking-tight text-white mb-2">Active Intelligence Log</h3>
                <p className="text-on-surface-variant max-w-lg font-medium">Sub-second synthesis of geopolitical volatility pulses.</p>
              </div>
              <div className="text-right hidden md:block">
                <span className="font-mono text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-widest">System Integrity: 100% Verified</span>
              </div>
            </div>

            <div className="relative group">
              <div className="border border-outline-variant/10 rounded-2xl overflow-hidden bg-surface-container shadow-3xl hover:border-primary/30 transition-all duration-500">
                <div className="h-2 bg-primary w-full shadow-[0_0_15px_rgba(111,251,190,0.3)]"></div>
                
                <div className="p-10 md:p-16">
                  {latestSignal ? (
                    <>
                      <div className="flex flex-wrap items-center gap-6 mb-10">
                        <span className={`px-4 py-1.5 font-label text-[9px] font-extrabold uppercase tracking-widest rounded-md ${latestSignal.severity >= 8 ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-container'}`}>
                          {latestSignal.severity >= 8 ? 'Critical Alert' : 'Active Signal'} — LVL 0{latestSignal.severity}
                        </span>
                        <span className="font-mono text-[10px] text-primary font-bold uppercase tracking-widest">ID: SIG-{latestSignal.id.slice(0, 8).toUpperCase()}</span>
                        <span className="font-mono text-[10px] text-on-surface-variant/40 font-medium uppercase tracking-widest">{new Date(latestSignal.created_at).toUTCString()}</span>
                      </div>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
                        <div className="lg:col-span-7">
                          <h4 className="text-4xl md:text-5xl font-headline font-extrabold text-white mb-6 tracking-tight leading-tight">{latestSignal.title}</h4>
                          <p className="text-on-surface/70 leading-relaxed mb-10 font-medium text-lg italic">
                            "{latestSignal.summary}"
                          </p>
                          <div className="flex flex-wrap gap-4">
                            {latestSignal.commodity_impacts?.map((impact, idx) => (
                              <div key={idx} className="bg-surface-container-lowest border border-outline-variant/20 px-4 py-3 rounded-lg group/pill hover:border-primary/40 transition-colors">
                                <p className="font-mono text-[10px] text-white font-bold uppercase tracking-widest mb-1">{impact.asset}</p>
                                <p className="font-label text-[8px] text-primary font-black uppercase tracking-widest group-hover/pill:animate-pulse">Detection Conf: {Math.round(impact.confidence * 100)}%</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="lg:col-span-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-10 flex flex-col justify-center relative overflow-hidden h-full min-h-[300px]">
                          <img 
                            className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale blur-[2px]" 
                            alt="Thermal Map"
                            src={`https://images.unsplash.com/photo-1544077960-604201fe74bc?auto=format&fit=crop&q=80&w=800`}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/80 to-transparent"></div>
                          
                          <div className="relative z-10 text-center">
                            <div className="flex items-center justify-center gap-2 mb-4">
                              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                              <span className="font-label text-[10px] uppercase tracking-[0.2em] font-black text-on-surface">Neural Confidence</span>
                            </div>
                            <div className="text-6xl font-mono text-primary font-extrabold tracking-tighter">
                              {Math.round(latestSignal.confidence * 100)}%
                            </div>
                            <div className="w-full bg-surface-container-high h-2 mt-6 rounded-full overflow-hidden max-w-[240px] mx-auto">
                              <div className="bg-primary h-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(111,251,190,0.5)]" style={{ width: `${latestSignal.confidence * 100}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-20 text-center">
                      <p className="font-mono text-xs text-on-surface-variant animate-pulse tracking-widest uppercase font-bold">Synchronizing with Beacon-Alpha Mainframe...</p>
                    </div>
                  )}
                </div>

                {/* CTA Overlay */}
                <div className="absolute inset-x-0 bottom-0 top-[60%] flex items-center justify-center bg-gradient-to-t from-surface-container via-surface-container/90 to-transparent pt-20">
                  <Link 
                    href="/signup"
                    className="px-12 py-5 bg-primary text-black font-label font-extrabold uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all text-sm mb-12"
                  >
                    Authorize Full Access
                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="px-10 py-32 bg-background border-y border-outline-variant/10">
          <div className="max-w-[1440px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
              {[
                { icon: "radar", title: "01. Event Detection", desc: "Autonomous scanning of ACLED, GNews, and proprietary military datasets with sub-second analysis." },
                { icon: "psychology", title: "02. AI Synthesis", desc: "Multi-modal AI models correlate civil unrest vectors with physical asset volatility signatures." },
                { icon: "notifications_active", title: "03. Tactical Uplink", desc: "Synchronized alert delivery across encrypted channels for immediate portfolio reaction." }
              ].map((f, i) => (
                <div key={i} className="group">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 mb-8 group-hover:bg-primary transition-all duration-300">
                    <span className="material-symbols-outlined text-primary group-hover:text-black transition-colors">{f.icon}</span>
                  </div>
                  <h4 className="text-xl font-headline font-extrabold text-white mb-4 tracking-tight uppercase">{f.title}</h4>
                  <p className="text-on-surface/40 leading-relaxed font-bold text-xs uppercase tracking-widest">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing/Capabilities Matrix */}
        <section className="px-10 py-32 bg-surface-container-low" id="pricing">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-headline font-extrabold tracking-tight text-white mb-6 uppercase italic">Access Tiers</h2>
              <p className="text-on-surface-variant font-medium max-w-xl mx-auto italic uppercase text-[10px] tracking-widest">Precision instruments for institutional volatility handlers.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { title: "Monitor", price: "$0", features: ["Delayed Feed (4h)", "Limited Map Access", "Base Analytics"] },
                { title: "Analyst", price: "$49", features: ["Real-time Signal Feed", "Full Map Layers", "Uplink Alerts", "Sentinel Synthesis"], featured: true },
                { title: "Pro", price: "$199", features: ["Full REST/WS API", "40yr Intel Archive", "Scenario Lab Access", "Multi-user Node"] }
              ].map((tier, i) => (
                <div key={i} className={`p-10 rounded-3xl border ${tier.featured ? 'bg-surface-container border-primary/40 shadow-2xl shadow-primary/10' : 'bg-surface-container-high border-outline-variant/10'}`}>
                  <p className="font-label text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/40 mb-4">Tier 0{i+1}: {tier.title}</p>
                  <div className="text-4xl font-mono text-white mb-8 font-extrabold">{tier.price}<span className="text-sm font-label text-on-surface/40 lowercase">/mo</span></div>
                  <ul className="space-y-4 mb-10">
                    {tier.features.map((f, idx) => (
                      <li key={idx} className="flex items-center gap-3 text-[10px] font-bold text-on-surface/60 uppercase tracking-widest">
                        <span className="material-symbols-outlined text-primary text-xs">check</span> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className={`w-full py-4 text-center rounded-xl font-label text-[10px] font-black uppercase tracking-widest transition-all ${tier.featured ? 'bg-primary text-black' : 'border border-outline-variant/30 text-white'}`}>
                    Select Tier
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-surface-container-lowest border-t border-outline-variant/10 px-10 py-24">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-20">
          <div className="col-span-1">
            <div className="flex items-center gap-2 mb-8">
              <Logo className="h-6" />
              <span className="text-lg font-extrabold tracking-tighter uppercase font-headline text-white">Blue Beacon</span>
            </div>
            <p className="text-[9px] font-mono text-on-surface-variant/40 leading-relaxed uppercase font-bold tracking-[0.2em]">
              Beacon OS v1.0.0<br/>
              © {new Date().getFullYear()} Blue Beacon Research.<br/>
              Verified Intel Architecture.
            </p>
          </div>
          <div className="space-y-8">
            <h6 className="font-label text-[10px] uppercase font-black tracking-widest text-on-surface/40">Mainframe</h6>
            <ul className="space-y-4">
              <li><Link className="text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase" href="/dashboard">Terminal</Link></li>
              <li><Link className="text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase" href="/map">Global Map</Link></li>
              <li><Link className="text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase" href="/alerts">Signals</Link></li>
            </ul>
          </div>
          <div className="space-y-8">
            <h6 className="font-label text-[10px] uppercase font-black tracking-widest text-on-surface/40">Protocol</h6>
            <ul className="space-y-4">
              <li><a className="text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase" href="#">Research</a></li>
              <li><a className="text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase" href="#">Documentation</a></li>
              <li><a className="text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase" href="#">Compliance</a></li>
            </ul>
          </div>
          <div className="space-y-8">
            <h6 className="font-label text-[10px] uppercase font-black tracking-widest text-on-surface/40">Secure Hub</h6>
            <ul className="space-y-4">
              <li><Link className="text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase" href="/login">Auth Center</Link></li>
              <li><a className="text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase" href="#">System Status</a></li>
              <li><a className="text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase" href="#">Encrypted Support</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
