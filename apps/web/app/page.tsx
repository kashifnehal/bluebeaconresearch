import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart2, Bell, BrainCircuit, Code2, Map, Radar, Shield } from "lucide-react";
import { createClient } from "./../lib/supabase-server";

export const metadata: Metadata = {
  title: "GeoSignal — Conflict Intelligence for Traders",
  description:
    "Real-time AI-powered signal feed: conflict events → commodity market impact. Cheaper than Bloomberg. Faster than Stratfor.",
  openGraph: {
    title: "GeoSignal — Conflict Intelligence for Traders",
    description:
      "Real-time AI-powered signal feed: conflict events → commodity market impact. Cheaper than Bloomberg. Faster than Stratfor.",
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
  if (score >= 10) return "Critical";
  if (score >= 9) return "Extreme";
  if (score >= 8) return "High";
  if (score >= 7) return "Elevated";
  return "Monitoring";
}

function severityClasses(score: number) {
  if (score >= 9) return "bg-danger text-white";
  if (score >= 8) return "bg-warning text-black";
  if (score >= 7) return "bg-warning/30 text-warning";
  return "bg-surface-secondary text-text-muted";
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
  // ─── DEV SHORTCUT ──────────────────────────────────────────────────────────
  // In local development, jump straight to the dashboard so you can preview
  // the Stitch-matching UI without an auth session. Remove before deploying.
  if (process.env.NODE_ENV === "development") {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }
  // ──────────────────────────────────────────────────────────────────────────
  const latestSignal = await getLatestSignal();

  return (
    <div className="min-h-screen bg-surface-app text-text-primary">
      <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="text-accent">●</span>
            <span className="text-[20px]">GeoSignal</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-text-secondary md:flex">
            <a href="#features" className="hover:text-text-primary">
              Features
            </a>
            <a href="#pricing" className="hover:text-text-primary">
              Pricing
            </a>
            <a href="#api" className="hover:text-text-primary">
              API
            </a>
            <Link href="/docs" className="hover:text-text-primary">
              Docs
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-text-secondary hover:text-text-primary">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-6xl flex-col items-center justify-center px-4 py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent-subtle px-3 py-1 text-xs text-accent">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Live — monitoring active conflicts
          </div>

          <h1 className="mt-6 text-balance text-4xl font-bold leading-tight md:text-6xl">
            Conflict signals. Market intelligence.
            <br />
            <span className="text-accent">Before the news hits.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg text-text-secondary">
            Real-time AI analysis of global conflict events — mapped to commodity and market impact. Cheaper than
            Bloomberg. Faster than Stratfor. No sales call required.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-medium text-white hover:bg-accent-hover"
            >
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#live" className="text-sm text-text-secondary hover:text-text-primary">
              See live signals ↓
            </a>
          </div>

          <p className="mt-3 text-sm text-text-muted">Trusted by traders and analysts worldwide</p>
        </section>

        <section id="live" className="mx-auto max-w-6xl px-4 pb-24">
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 text-center text-xs uppercase tracking-wider text-text-muted">
              Live — most recent signal from our feed
            </div>

            <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-5">
              {latestSignal ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
                          severityClasses(latestSignal.severity),
                        ].join(" ")}
                      >
                        {latestSignal.severity} — {severityLabel(latestSignal.severity)}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-text-muted">
                        {latestSignal.region ?? "Global"}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted">{formatPct(latestSignal.confidence)} confidence</div>
                  </div>

                  <div className="mt-3 text-base font-medium leading-snug">{latestSignal.title}</div>
                  <div className="mt-1 text-sm text-text-secondary">{latestSignal.summary}</div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(latestSignal.commodity_impacts ?? []).slice(0, 4).map((c) => (
                      <span
                        key={`${latestSignal.id}-${c.asset}`}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-text-secondary"
                      >
                        <span className="font-mono text-text-muted">{c.asset}</span>
                        <span className="text-text-muted">·</span>
                        <span className="text-text-secondary">{formatPct(c.confidence)}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm text-text-secondary">
                  Live preview will appear once Supabase is connected and signals are available.
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface to-transparent" />
              <div className="absolute inset-x-0 bottom-4 flex items-center justify-center">
                <Link
                  href="/signup"
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  Sign up to see full analysis <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="mt-3 text-center text-sm text-text-muted">
              Tracking events across multiple regions today
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-24">
          <h2 className="text-center text-2xl font-semibold">From conflict to signal in minutes</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-6">
              <Radar className="h-8 w-8 text-accent" />
              <div className="mt-4 text-base font-semibold">Event detected</div>
              <p className="mt-2 text-sm text-text-secondary">
                Continuous monitoring across news and open datasets. Updates on a tight cadence to avoid missing
                market-moving events.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-6">
              <BrainCircuit className="h-8 w-8 text-accent" />
              <div className="mt-4 text-base font-semibold">AI analysis</div>
              <p className="mt-2 text-sm text-text-secondary">
                Models classify severity, identify affected commodities, and generate concise trader-ready briefings.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-6">
              <Bell className="h-8 w-8 text-accent" />
              <div className="mt-4 text-base font-semibold">You get alerted</div>
              <p className="mt-2 text-sm text-text-secondary">
                Real-time delivery to Telegram, email, or Slack. Quant tier gets structured JSON webhooks.
              </p>
            </div>
          </div>
        </section>

        <section id="features" className="bg-surface-secondary/50 py-24">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-2xl font-semibold">Everything you need, nothing you don&apos;t</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: <BarChart2 className="h-8 w-8 text-accent" />,
                  title: "Real-time signal feed",
                  desc: "AI-scored signal cards with filtering by region, commodity, and severity.",
                },
                {
                  icon: <BarChart2 className="h-8 w-8 text-accent" />,
                  title: "Historical backtesting",
                  desc: "Quantify how markets moved after similar events with accuracy stats.",
                },
                {
                  icon: <Bell className="h-8 w-8 text-accent" />,
                  title: "Instant alerts",
                  desc: "Telegram, email, and Slack alerts with custom rules and quiet hours.",
                },
                {
                  icon: <Map className="h-8 w-8 text-accent" />,
                  title: "Geographic context",
                  desc: "Interactive maps with proximity awareness for critical infrastructure and chokepoints.",
                },
                {
                  icon: <Code2 className="h-8 w-8 text-accent" />,
                  title: "Quant API",
                  desc: "Structured JSON endpoints and webhooks built for algo trading systems.",
                },
                {
                  icon: <Shield className="h-8 w-8 text-accent" />,
                  title: "Sanctions monitoring",
                  desc: "Cross-reference against sanctions lists to surface high-risk counterparties.",
                },
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-border bg-surface p-6 hover:border-accent/50">
                  {f.icon}
                  <div className="mt-4 text-base font-semibold">{f.title}</div>
                  <p className="mt-2 text-sm text-text-secondary">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="api" className="mx-auto max-w-6xl px-4 py-24">
          <div className="rounded-xl border border-border bg-surface p-8">
            <h2 className="text-xl font-semibold">API-first for quant teams</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Get structured JSON webhooks delivered fast, with filtering by region/commodity/severity.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Start API plan
              </Link>
              <Link href="/login" className="text-sm text-text-secondary hover:text-text-primary">
                View in-app API Console →
              </Link>
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 py-24">
          <h2 className="text-center text-2xl font-semibold">Simple, transparent pricing</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { name: "Free", price: "$0", desc: "Get started", cta: "Get started", href: "/signup" },
              { name: "Analyst", price: "$49", desc: "Real-time feed + alerts", cta: "Start Analyst", href: "/signup" },
              { name: "Pro", price: "$199", desc: "Backtesting + advanced alerts", cta: "Start Pro", href: "/signup" },
            ].map((p) => (
              <div key={p.name} className="rounded-xl border border-border bg-surface p-6">
                <div className="text-base font-semibold">{p.name}</div>
                <div className="mt-2 font-mono text-3xl font-semibold">
                  {p.price}
                  <span className="ml-1 font-sans text-sm font-normal text-text-muted">/mo</span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">{p.desc}</p>
                <Link
                  href={p.href}
                  className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-12">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <span className="text-accent">●</span>
              GeoSignal
            </div>
            <p className="mt-2 text-sm text-text-secondary">Conflict intelligence → actionable trading signals.</p>
            <p className="mt-4 text-xs text-text-muted">
              © {new Date().getFullYear()} GeoSignal. Signals are informational only; not financial advice.
            </p>
          </div>
          <div className="text-sm">
            <div className="font-medium text-text-primary">Product</div>
            <div className="mt-3 space-y-2 text-text-secondary">
              <a href="#features" className="block hover:text-text-primary">
                Features
              </a>
              <a href="#pricing" className="block hover:text-text-primary">
                Pricing
              </a>
              <a href="#api" className="block hover:text-text-primary">
                API
              </a>
            </div>
          </div>
          <div className="text-sm">
            <div className="font-medium text-text-primary">Company</div>
            <div className="mt-3 space-y-2 text-text-secondary">
              <Link href="/login" className="block hover:text-text-primary">
                Sign in
              </Link>
              <Link href="/signup" className="block hover:text-text-primary">
                Sign up
              </Link>
            </div>
          </div>
          <div className="text-sm">
            <div className="font-medium text-text-primary">Legal</div>
            <div className="mt-3 space-y-2 text-text-secondary">
              <Link href="/privacy" className="block hover:text-text-primary">
                Privacy
              </Link>
              <Link href="/terms" className="block hover:text-text-primary">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
