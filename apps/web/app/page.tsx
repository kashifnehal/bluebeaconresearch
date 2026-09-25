import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getRouteSupabaseClients } from "./../lib/supabase-server";
import { Logo } from "./../components/Logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blue Beacon Research | Geopolitical Market Intelligence",
  description:
    "Source-first geopolitical research, structured as market signals. Evidence, uncertainty, and a published track record — not a generic news feed.",
  openGraph: {
    title: "Blue Beacon Research | Geopolitical Market Intelligence",
    description:
      "Source-first geopolitical research, structured as market signals. Evidence, uncertainty, and a published track record — not a generic news feed.",
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

// signals RLS is `signals_select_authenticated` only — the cookie/anon client
// returns 0 rows for a logged-out visitor. Prefer the service-role client from
// getRouteSupabaseClients() (same helper API routes already use).
async function getHomepageDataClient() {
  const clients = await getRouteSupabaseClients();
  if (clients?.supabase) return clients.supabase;
  return createClient();
}

async function getLatestSignal(): Promise<LandingSignalPreview | null> {
  try {
    const supabase = await getHomepageDataClient();
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

async function getHomepageStats(): Promise<{ totalSignals: number | null }> {
  try {
    const supabase = await getHomepageDataClient();
    const { count, error } = await supabase
      .from("signals")
      .select("id", { count: "exact" });

    // 0 from the anon fallback is RLS hiding every row, not an empty table.
    if (error || count == null || count === 0) {
      console.error("[getHomepageStats] count query returned no usable count:", { error, count });
      return { totalSignals: null };
    }
    return { totalSignals: count };
  } catch (err) {
    console.error("[getHomepageStats] count query threw:", err);
    return { totalSignals: null };
  }
}

function formatSignalsTracked(count: number): string {
  return `${count.toLocaleString("en-US")} signals tracked`;
}

export default async function Home(props: {
  searchParams?: Promise<{ error?: string; error_description?: string }>;
}) {
  const searchParams = await props.searchParams;
  if (searchParams?.error || searchParams?.error_description) {
    const msg = encodeURIComponent(searchParams.error_description ?? searchParams.error ?? "Authentication failed");
    redirect(`/login?error=${msg}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [latestSignal, homepageStats] = await Promise.all([getLatestSignal(), getHomepageStats()]);

  return (
    <div className="bg-background text-on-surface selection:bg-primary-container selection:text-on-primary-container min-h-screen">
      {/* Sticky Header */}
      <header className="fixed top-0 left-0 right-0 h-16 glass z-50 px-8 flex items-center justify-between border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <Logo className="h-8" />
        </div>
        <nav className="hidden md:flex items-center gap-10">
          <Link className="font-label text-[12px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface/60 hover:text-primary transition-colors" href="#features">How it works</Link>
          <Link className="font-label text-[12px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface/60 hover:text-primary transition-colors" href="#pricing">Pricing</Link>
          <Link className="font-label text-[12px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface/60 hover:text-primary transition-colors" href="/accuracy">Accuracy</Link>
        </nav>
        <div className="flex items-center gap-8">
          {user ? (
            <Link
              href="/dashboard"
              className="bg-primary hover:bg-primary-container text-black px-6 py-2 rounded-lg font-label text-[12px] md:text-[10px] font-extrabold uppercase tracking-widest transition-all active:scale-95"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link className="font-label text-[12px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface/60 hover:text-white transition-colors" href="/login">Sign in</Link>
              <Link
                href="/signup"
                className="bg-primary hover:bg-primary-container text-black px-6 py-2 rounded-lg font-label text-[12px] md:text-[10px] font-extrabold uppercase tracking-widest transition-all active:scale-95"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative min-h-0 md:min-h-screen flex flex-col items-center justify-center px-5 py-14 md:px-6 md:py-24 overflow-hidden">
          {/* Background Map Visual */}
          <div className="absolute inset-0 z-0 opacity-15 pointer-events-none">
            <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center grayscale contrast-125"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background"></div>
          </div>

          <div className="relative z-10 text-center max-w-5xl mx-auto">
            <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-surface-container-high/60 rounded-full border border-primary/20 mb-6 md:mb-10 backdrop-blur-sm">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              <span className="font-label text-[12px] md:text-[9px] font-black uppercase tracking-[0.2em] text-primary">Monitoring active global conflicts — updates roughly every 30 minutes</span>
            </div>
            <h1 className="text-4xl leading-[1.05] mb-6 md:text-8xl md:leading-[0.85] md:mb-10 lg:text-[120px] font-extrabold tracking-tighter text-white animate-in fade-in slide-in-from-bottom-4 duration-700">
              Geopolitical intelligence for markets that matter.
            </h1>
            <p className="text-on-surface/60 text-base mb-8 md:text-xl max-w-2xl mx-auto md:mb-12 leading-relaxed font-medium">
              Blue Beacon Research — Geopolitical Intelligence for Commodity Traders
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
              <Link 
                href="/signup"
                className="w-full md:w-auto px-10 py-5 bg-primary text-black font-label font-extrabold uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20"
              >
                Sign up
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </Link>
              <a className="font-label text-[12px] md:text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/40 hover:text-on-surface flex items-center gap-2 transition-colors group" href="#live">
                View recent signals
                <span className="material-symbols-outlined text-sm group-hover:translate-y-1 transition-transform">south</span>
              </a>
            </div>
          </div>
        </section>

        {/* Live Signal Preview */}
        <section className="px-5 py-16 md:px-10 md:py-32 bg-surface-container-lowest" id="live">
          <div className="max-w-[1440px] mx-auto">
            <div className="mb-8 md:mb-14 flex items-end justify-between">
              <div>
                <p className="font-label text-[12px] md:text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-3">Latest signal</p>
                <h3 className="text-2xl md:text-4xl font-headline font-extrabold tracking-tight text-white mb-2">Recent research feed</h3>
                <p className="text-on-surface-variant max-w-lg font-medium text-sm md:text-base">The most recent signal from the collector pipeline. New events are ingested on a regular schedule, typically every 15–30 minutes — not in real time.</p>
              </div>
              {homepageStats.totalSignals != null ? (
                <div className="text-right hidden md:block">
                  <span className="font-mono text-[12px] md:text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-widest">{formatSignalsTracked(homepageStats.totalSignals)}</span>
                </div>
              ) : null}
            </div>

            <div className="relative group">
              <div className="border border-outline-variant/10 rounded-2xl overflow-hidden bg-surface-container shadow-3xl hover:border-primary/30 transition-all duration-500">
                <div className="h-2 bg-primary w-full shadow-[0_0_15px_rgba(111,251,190,0.3)]"></div>
                
                <div className="p-6 md:p-16">
                  {latestSignal ? (
                    <>
                      <div className="flex flex-wrap items-center gap-3 mb-6 md:gap-6 md:mb-10">
                        <span className={`px-4 py-1.5 font-label text-[12px] md:text-[9px] font-extrabold uppercase tracking-widest rounded-md ${latestSignal.severity >= 8 ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-container'}`}>
                          {latestSignal.severity >= 8 ? 'Critical Alert' : 'Active Signal'}
                        </span>
                        <span className="font-mono text-[12px] md:text-[10px] text-on-surface-variant/40 font-medium uppercase tracking-widest">{new Date(latestSignal.created_at).toUTCString()}</span>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-16 items-center">
                        <div className="lg:col-span-7">
                          <h4 className="text-2xl mb-4 md:text-5xl font-headline font-extrabold text-white md:mb-6 tracking-tight leading-tight">{latestSignal.title}</h4>
                          {/* Summary often closely echoes the title for a given signal — clamped on mobile only so the card doesn't read as repeating itself; full text still renders (and still reads distinctly when it differs) at md+ and for screen readers. */}
                          <p className="text-on-surface/70 leading-relaxed mb-6 font-medium text-sm italic line-clamp-2 md:text-lg md:mb-10 md:line-clamp-none">
                            &ldquo;{latestSignal.summary}&rdquo;
                          </p>
                          <div className="flex flex-wrap gap-2 md:gap-4">
                            {latestSignal.commodity_impacts?.map((impact, idx) => (
                              <div key={idx} className="bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 md:px-4 md:py-3 rounded-lg group/pill hover:border-primary/40 transition-colors">
                                <p className="font-mono text-[12px] md:text-[10px] text-white font-bold uppercase tracking-widest mb-1">{impact.asset}</p>
                                <p className="font-label text-[12px] md:text-[8px] text-primary font-black uppercase tracking-widest">{impact.direction}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="lg:col-span-5 bg-surface-container-lowest rounded-2xl border border-outline-variant/10 p-6 md:p-10 flex flex-col justify-center relative overflow-hidden h-full min-h-[220px] md:min-h-[300px]">
                          <img
                            className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale blur-[2px]"
                            alt=""
                            src={`https://images.unsplash.com/photo-1544077960-604201fe74bc?auto=format&fit=crop&q=80&w=800`}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/80 to-transparent"></div>

                          <div className="relative z-10 text-center">
                            <div className="flex items-center justify-center gap-2 mb-4">
                              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                              <span className="font-label text-[12px] md:text-[10px] uppercase tracking-[0.2em] font-black text-on-surface">Classification confidence</span>
                            </div>
                            <div className="text-4xl md:text-6xl font-mono text-primary font-extrabold tracking-tighter">
                              {Math.round(latestSignal.confidence * 100)}%
                            </div>
                            <p className="mt-3 font-label text-[12px] md:text-[8px] text-on-surface-variant uppercase tracking-widest font-bold">Uncertainty for this assessment — not a hit rate</p>
                            <div className="w-full bg-surface-container-high h-2 mt-6 rounded-full overflow-hidden max-w-[240px] mx-auto">
                              <div className="bg-primary h-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(111,251,190,0.5)]" style={{ width: `${latestSignal.confidence * 100}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-20 text-center">
                      <p className="font-mono text-xs text-on-surface-variant tracking-widest uppercase font-bold">Loading the latest signal…</p>
                    </div>
                  )}
                </div>

                {/* CTA — in-flow on mobile (a fixed-percentage overlay band collides with real content once the card is short); unchanged absolute fade-overlay on desktop */}
                <div className="px-6 pt-4 pb-6 flex items-center justify-center md:absolute md:inset-x-0 md:bottom-0 md:top-[60%] md:px-0 md:pt-20 md:pb-0 md:bg-gradient-to-t md:from-surface-container md:via-surface-container/90 md:to-transparent">
                  <Link
                    href="/signup"
                    className="px-8 py-4 text-xs md:px-12 md:py-5 md:mb-12 md:text-sm bg-primary text-black font-label font-extrabold uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
                  >
                    Sign up to read the full assessment
                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="px-5 py-16 md:px-10 md:py-32 bg-background border-y border-outline-variant/10" id="features">
          <div className="max-w-[1440px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-16">
              {[
                { icon: "radar", title: "01. Event Detection", desc: "Public sources such as GNews are scanned on a regular collector schedule and turned into structured events." },
                { icon: "psychology", title: "02. Research Assessment", desc: "Each event is classified for market relevance and mapped to the commodities and currency pairs it may affect — with uncertainty stated." },
                { icon: "notifications_active", title: "03. Alerts", desc: "Optional notifications when a new signal matches the markets and regions you follow." }
              ].map((f, i) => (
                <div key={i} className="group">
                  <div className="w-12 h-12 mb-4 md:w-14 md:h-14 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 md:mb-8 group-hover:bg-primary transition-all duration-300">
                    <span className="material-symbols-outlined text-primary group-hover:text-black transition-colors">{f.icon}</span>
                  </div>
                  <h4 className="text-lg mb-2 md:text-xl font-headline font-extrabold text-white md:mb-4 tracking-tight uppercase">{f.title}</h4>
                  <p className="text-on-surface/40 leading-relaxed font-bold text-xs uppercase tracking-widest">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Published track record — link only, no homepage hit-rate number */}
        <section className="px-5 py-12 md:px-10 md:py-24 bg-surface-container-lowest border-b border-outline-variant/10" id="track-record">
          <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-12 items-center">
            <div className="lg:col-span-8">
              <p className="font-label text-[12px] md:text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-3">Source Verification</p>
              <h2 className="text-2xl md:text-4xl font-headline font-extrabold tracking-tight text-white mb-4">We publish the track record</h2>
              <p className="text-on-surface/60 leading-relaxed font-medium max-w-2xl text-sm md:text-base">
                Directional outcomes are scored from real price data after a 48-hour checkpoint, with methodology and sample size on a public page. That page is the proof point — not a homepage accuracy percentage.
              </p>
            </div>
            <div className="lg:col-span-4 flex lg:justify-end">
              <Link
                href="/accuracy"
                className="px-8 py-4 bg-primary text-black font-label font-extrabold uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all"
              >
                View the live track record
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="px-5 py-16 md:px-10 md:py-32 bg-surface-container-low" id="pricing">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-10 md:mb-20">
              <h2 className="text-3xl md:text-5xl font-headline font-extrabold tracking-tight text-white mb-6">Pricing</h2>
              <p className="text-on-surface-variant font-medium max-w-xl mx-auto text-sm">Three plans. Same research feed; more access as you go up.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              {[
                { title: "Monitor", price: "$0", features: ["Delayed Feed (4h)", "Limited Map Access", "Base Analytics"] },
                { title: "Analyst", price: "$49", features: ["Live signal feed", "Full Map Layers", "Alerts", "Market Impact Assessment"], featured: true },
                { title: "Pro", price: "$199", features: ["Full REST/WS API", "5-year price history", "Backtesting Lab", "Multi-user access"] }
              ].map((tier, i) => (
                <div key={i} className={`p-6 md:p-10 rounded-3xl border ${tier.featured ? 'bg-surface-container border-primary/40 shadow-2xl shadow-primary/10' : 'bg-surface-container-high border-outline-variant/10'}`}>
                  <p className="font-label text-[12px] md:text-[10px] font-black uppercase tracking-[0.3em] text-on-surface/40 mb-4">{tier.title}</p>
                  <div className="text-3xl mb-4 md:text-4xl font-mono text-white md:mb-8 font-extrabold">{tier.price}<span className="text-sm font-label text-on-surface/40 lowercase">/mo</span></div>
                  <ul className="space-y-3 mb-6 md:space-y-4 md:mb-10">
                    {tier.features.map((f, idx) => (
                      <li key={idx} className="flex items-center gap-3 text-[12px] md:text-[10px] font-bold text-on-surface/60 uppercase tracking-widest">
                        <span className="material-symbols-outlined text-primary text-xs">check</span> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className={`w-full block py-4 text-center rounded-xl font-label text-[12px] md:text-[10px] font-black uppercase tracking-widest transition-all ${tier.featured ? 'bg-primary text-black' : 'border border-outline-variant/30 text-white'}`}>
                    Get started
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface-container-lowest border-t border-outline-variant/10 px-5 py-12 md:px-10 md:py-24">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-20">
          <div className="col-span-1">
            <div className="flex items-center gap-2 mb-4 md:mb-8">
              <Logo className="h-6" />
              <span className="text-lg font-extrabold tracking-tighter uppercase font-headline text-white">Blue Beacon</span>
            </div>
            <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant/40 leading-relaxed uppercase font-bold tracking-[0.2em]">
              © {new Date().getFullYear()} Blue Beacon Research.
            </p>
          </div>
          <div className="space-y-4 md:space-y-8">
            <h6 className="font-label text-[12px] md:text-[10px] uppercase font-black tracking-widest text-on-surface/40">Product</h6>
            <ul className="space-y-2 md:space-y-4">
              <li><Link className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] inline-flex items-center" href="/dashboard">Dashboard</Link></li>
              <li><Link className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] inline-flex items-center" href="/map">Global Map</Link></li>
              <li><Link className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] inline-flex items-center" href="/alerts">Signals</Link></li>
            </ul>
          </div>
          <div className="space-y-4 md:space-y-8">
            <h6 className="font-label text-[12px] md:text-[10px] uppercase font-black tracking-widest text-on-surface/40">Research</h6>
            <ul className="space-y-2 md:space-y-4">
              <li><Link className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] inline-flex items-center" href="/accuracy">Accuracy</Link></li>
              <li><Link className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] inline-flex items-center" href="/backtesting">Backtesting Lab</Link></li>
              <li>
                <Link className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] flex items-center gap-1" href="/terms">
                  Terms <span className="text-[12px] md:text-[8px] text-primary lowercase font-mono">(full docs coming soon)</span>
                </Link>
              </li>
              <li><Link className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] inline-flex items-center" href="/privacy">Privacy</Link></li>
            </ul>
          </div>
          <div className="space-y-4 md:space-y-8">
            <h6 className="font-label text-[12px] md:text-[10px] uppercase font-black tracking-widest text-on-surface/40">Account</h6>
            <ul className="space-y-2 md:space-y-4">
              <li><Link className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] inline-flex items-center" href="/login">Sign in</Link></li>
              <li><Link className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] inline-flex items-center" href="/status">System Status</Link></li>
              <li><a className="text-[12px] md:text-[11px] font-bold text-on-surface/60 hover:text-primary transition-colors uppercase min-h-[44px] inline-flex items-center" href="mailto:support@bluebeaconresearch.com">Support</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
