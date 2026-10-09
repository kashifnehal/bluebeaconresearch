import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { LegalDisclaimerFooter } from "@/components/layout/LegalDisclaimerFooter";
import { createClient, getRouteSupabaseClients } from "@/lib/supabase-server";
import { formatStatNumber, TOTAL_COLLECTOR_COUNT } from "@/lib/how-it-works-stats";

// Research integrity is the point of this page: every number below is either
// computed live from the database at request time, or a direct pointer into
// the code/product surface a visitor can go check for themselves. Nothing
// here is a static or invented figure.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How It Works | Blue Beacon Research",
  description:
    "What Blue Beacon Research does and how you can check it: source links on every signal, disclosed classification method, and a published track record.",
};

// signals RLS is `signals_select_authenticated` only — the cookie/anon client
// returns 0 rows for a logged-out visitor. Prefer the service-role client
// (same pattern as getHomepageStats() in app/page.tsx).
async function getStatsClient() {
  const clients = await getRouteSupabaseClients();
  if (clients?.supabase) return clients.supabase;
  return createClient();
}

type Stat = { value: string; label: string; caption: string };

async function getStats(): Promise<Stat[]> {
  const stats: Stat[] = [];

  try {
    const supabase = await getStatsClient();
    const { count, error } = await supabase.from("signals").select("id", { count: "exact" });
    // 0 from the anon fallback is RLS hiding every row, not an empty table —
    // hide the number rather than claim zero signals exist.
    if (!error && count != null && count > 0) {
      stats.push({
        value: formatStatNumber(count),
        label: "Signals tracked",
        caption: "Every signal in the system, counted live from the database.",
      });
    } else if (error) {
      console.error("[how-it-works] total signals query failed:", error);
    }
  } catch (err) {
    console.error("[how-it-works] total signals query threw:", err);
  }

  try {
    const supabase = await getStatsClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("signals")
      .select("id", { count: "exact" })
      .gte("created_at", sevenDaysAgo);
    if (!error && count != null) {
      stats.push({
        value: formatStatNumber(count),
        label: "Signals, last 7 days",
        caption: "Rolling count of signals created in the past week.",
      });
    } else if (error) {
      console.error("[how-it-works] 7-day signals query failed:", error);
    }
  } catch (err) {
    console.error("[how-it-works] 7-day signals query threw:", err);
  }

  // Not a DB query — counted from ingestion code constants. See
  // apps/web/lib/how-it-works-stats.ts for the exact file references.
  stats.push({
    value: formatStatNumber(TOTAL_COLLECTOR_COUNT),
    label: "Sources monitored",
    caption: "RSS feeds plus other data collectors configured in the ingestion pipeline.",
  });

  return stats;
}

type ClaimRow = {
  claim: string;
  proof: string;
};

const CLAIM_ROWS: ClaimRow[] = [
  {
    claim: "Every signal has a Sources tab listing the reports it was built from, linking out to the original article where the publisher's URL is available.",
    proof: "Open any signal and check its Sources tab.",
  },
  {
    claim: "When the AI model is unavailable or the daily budget is reached, we pause classification instead of guessing. Older signals from the keyword period stay marked as auto-classified.",
    proof:
      "An auto-classified signal shows a note on its page: \"This signal was auto-classified — Claude analysis is temporarily unavailable.\"",
  },
  {
    claim: "We do not add a severity bonus for a story running as the headline versus being buried in the body.",
    proof: "The headline-placement severity bonus in our scoring code is set to zero.",
  },
  {
    claim: "Confidence reflects the model's certainty in its own read of the event — not how many reports we have.",
    proof: "Stated directly in the product's own onboarding tour, next to the confidence score.",
  },
  {
    claim: "When multiple reports describe the same event, we count them as merged reports — not as distinct outlets.",
    proof: "The reports count increments on every merged report, regardless of whether the outlet repeats.",
  },
  {
    claim: "We publish our track record.",
    proof: "See the Accuracy page — including when the number is not flattering.",
  },
  {
    claim: "Claude classifies an event for market impact, including a possible up, down, or volatile move in a listed commodity or currency pair, and does not recommend a position, a size, or an entry or exit.",
    proof: "The briefing and research-chat instructions state that limit. A direction on a signal is an impact reading, not an instruction to act.",
  },
];

const LIMITS = [
  "Severity and confidence are model outputs, not guarantees.",
  "Older signals were classified by a keyword fallback — those are marked, not hidden. New signals wait for the model.",
  "ACLED conflict data: ACLED is configured but returning no data (access pending), so no ACLED events are ingested yet.",
  "A merged \"reports\" count can include more than one article from the same outlet — it is not a count of distinct sources.",
];

export default async function HowItWorksPage() {
  const stats = await getStats();

  return (
    <div
      className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <PublicHeader badge="HOW IT WORKS" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
        <h1
          className="text-2xl font-bold text-white mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          How It Works
        </h1>
        <p className="text-xs text-[#86948a] mb-8 font-mono leading-relaxed">
          Blue Beacon Research is a research platform, not a prediction machine. Research integrity is the
          whole point of this page — what we claim, and exactly how you can check it yourself.
        </p>

        {stats.length > 0 ? (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-[#3c4a42] bg-[#131313] p-5">
                <p className="font-mono text-3xl font-semibold text-[#e5e2e1]">{s.value}</p>
                <p className="mt-2 text-[12px] md:text-[10px] font-mono uppercase tracking-[0.2em] text-[#86948a]">
                  {s.label}
                </p>
                <p className="mt-1 text-[12px] md:text-[11px] font-mono text-[#6b7a72]">{s.caption}</p>
              </div>
            ))}
          </section>
        ) : null}

        <section className="space-y-3 mb-10">
          <h2
            className="text-xs font-bold text-[#86948a] uppercase tracking-widest"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            What we claim, and how you can check it
          </h2>
          <div className="divide-y divide-[#2a2a2a] rounded-lg border border-[#3c4a42]">
            {CLAIM_ROWS.map((row) => (
              <div key={row.claim} className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 p-4 md:p-5">
                <div>
                  <p className="text-[12px] md:text-[10px] font-mono uppercase tracking-[0.2em] text-[#86948a] mb-1">
                    Claim
                  </p>
                  <p className="text-sm text-[#e5e2e1] leading-relaxed">{row.claim}</p>
                </div>
                <div>
                  <p className="text-[12px] md:text-[10px] font-mono uppercase tracking-[0.2em] text-[#86948a] mb-1">
                    How you can check it
                  </p>
                  <p className="text-sm text-[#bbcac0] leading-relaxed">{row.proof}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 mb-10">
          <h2
            className="text-xs font-bold text-[#86948a] uppercase tracking-widest"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Limits — what we don&apos;t do yet
          </h2>
          <ul className="space-y-2 rounded-lg border border-[#3c4a42] bg-[#131313] p-5">
            {LIMITS.map((item) => (
              <li key={item} className="text-sm text-[#bbcac0] leading-relaxed flex gap-2">
                <span className="text-[#6b7a72]" aria-hidden="true">
                  —
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-sm text-[#e5e2e1]">
          See the full history on the{" "}
          <Link href="/accuracy" className="text-[#4edea3] hover:underline">
            Accuracy
          </Link>{" "}
          page.
        </p>
      </main>

      <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[#86948a] font-mono">
        Blue Beacon Research — Not investment advice.
      </footer>
      <LegalDisclaimerFooter />
    </div>
  );
}
