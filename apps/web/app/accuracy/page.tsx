import Link from "next/link";
import { Logo } from "@/components/Logo";

// #121 frontend half — public track-record page. Reads only the pre-computed
// `signal_outcomes` aggregates from GET /v1/accuracy (backend never live-
// recomputes against commodity_prices, which only retains 90 days). Real numbers
// per request — not statically prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Accuracy | Blue Beacon Research",
  description:
    "Blue Beacon Research's historical signal accuracy, computed automatically from real market price data.",
};

type AssetSummary = {
  total_scored: number;
  correct: number;
  hit_rate: number | null;
  not_enough_history: boolean;
  avg_move_when_correct: number | null;
  sample_size_note: number;
  volatile_neutral_summary: {
    total: number;
    fraction_above_threshold: number;
    threshold_pct: number;
  } | null;
  date_range: { earliest: string; latest: string } | null;
};

type AccuracyPayload = {
  overall: AssetSummary;
  by_asset: Record<string, AssetSummary>;
  min_sample_size: number;
  volatility_threshold_pct: number;
  generated_at: string;
};

async function loadAccuracy(): Promise<AccuracyPayload | { error: string }> {
  const apiBase = process.env.API_URL?.replace(/\/$/, "");
  if (!apiBase) return { error: "Missing API_URL env var" };
  try {
    const res = await fetch(`${apiBase}/v1/accuracy`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as AccuracyPayload | null;
    if (!res.ok || !json) return { error: `Upstream ${res.status}` };
    return json;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Request failed" };
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtPct(v: number | null, digits = 1): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtMove(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(2)}%`;
}

function HeadlineStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[#3c4a42] bg-[#131313] p-5">
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86948a]">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold text-[#e5e2e1]">{value}</p>
      {hint ? <p className="mt-1 text-[11px] font-mono text-[#6b7a72]">{hint}</p> : null}
    </div>
  );
}

function AssetRow({
  asset,
  summary,
  minSampleSize,
}: {
  asset: string;
  summary: AssetSummary;
  minSampleSize: number;
}) {
  return (
    <tr className="border-t border-[#2a2a2a]">
      <td className="px-4 py-3 font-mono text-sm text-[#e5e2e1]">{asset}</td>
      <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">
        {summary.sample_size_note}
      </td>
      {summary.not_enough_history ? (
        <td colSpan={2} className="px-4 py-3 text-right font-mono text-xs uppercase tracking-wider text-[#86948a]">
          Not enough history yet (min {minSampleSize})
        </td>
      ) : (
        <>
          <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">
            {fmtPct(summary.hit_rate)}
          </td>
          <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">
            {fmtMove(summary.avg_move_when_correct)}
          </td>
        </>
      )}
    </tr>
  );
}

export default async function AccuracyPage() {
  const data = await loadAccuracy();

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header — same public-page chrome as /status */}
      <header className="h-16 border-b border-[#2a2a2a] px-8 flex items-center justify-between bg-[#000000]">
        <div className="flex items-center gap-3">
          <Logo className="h-6" />
          <Link href="/" className="font-extrabold text-sm tracking-tight text-white uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Blue Beacon Research
          </Link>
          <span className="text-[10px] text-[#4edea3] font-mono px-2 py-0.5 border border-[#3c4a42] bg-[#131313]">
            TRACK RECORD
          </span>
        </div>
        <Link
          href="/dashboard"
          className="text-xs font-bold text-[#4edea3] hover:underline uppercase tracking-wider flex items-center gap-1"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Terminal <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>arrow_forward</span>
        </Link>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-8 py-16">
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Signal Accuracy
        </h1>
        <p className="text-xs text-[#86948a] mb-8 font-mono">
          Computed automatically from real commodity/forex price data, checked 48 hours after each signal.
        </p>

        {/* Permanent, non-dismissible past-performance disclaimer */}
        <div className="p-5 bg-[#131313] border border-[#3c4a42] rounded-lg mb-10">
          <p className="text-xs text-[#e5e2e1] leading-relaxed">
            Historical accuracy of BBR&apos;s signals, computed automatically from real price data.
            Past results do not predict future performance. This is not investment advice.
          </p>
        </div>

        {"error" in data ? (
          <div className="rounded-lg border border-[#7a3c3c] bg-[#1a1010] px-4 py-3 font-mono text-[12px] text-[#e0a0a0]">
            Failed to load accuracy data: {data.error}
          </div>
        ) : (
          <>
            {/* Date range — plainly stated */}
            <p className="text-xs font-mono text-[#86948a] mb-6">
              {data.overall.date_range
                ? `Based on ${data.overall.sample_size_note} signals scored between ${fmtDate(
                    data.overall.date_range.earliest,
                  )} and ${fmtDate(data.overall.date_range.latest)} (UTC).`
                : `Based on ${data.overall.sample_size_note} signals scored — date range unavailable.`}
            </p>

            {/* Overall: hit rate + avg move + sample size, always together */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
              <HeadlineStat
                label="Overall hit rate"
                value={data.overall.not_enough_history ? "—" : fmtPct(data.overall.hit_rate)}
                hint={
                  data.overall.not_enough_history
                    ? `Not enough history yet (min ${data.min_sample_size})`
                    : `${data.overall.correct} / ${data.overall.total_scored} scored up/down calls`
                }
              />
              <HeadlineStat
                label="Avg move when correct"
                value={fmtMove(data.overall.avg_move_when_correct)}
                hint="Average |% change| on correctly-called signals"
              />
              <HeadlineStat
                label="Sample size"
                value={String(data.overall.sample_size_note)}
                hint="Scored up/down predictions (excludes volatile/neutral)"
              />
            </section>

            {/* Volatile/neutral — kept separate, never blended into hit rate */}
            {data.overall.volatile_neutral_summary ? (
              <section className="mb-10 p-5 bg-[#131313] border border-[#3c4a42] rounded-lg">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#86948a] mb-2">
                  Volatile / neutral predictions (not scored as correct/incorrect)
                </p>
                <p className="text-sm text-[#e5e2e1] font-mono">
                  {data.overall.volatile_neutral_summary.total} predictions called &ldquo;volatile&rdquo; or &ldquo;neutral&rdquo; — {fmtPct(data.overall.volatile_neutral_summary.fraction_above_threshold)} of those saw an actual move of {data.overall.volatile_neutral_summary.threshold_pct}% or more in either direction within 48h.
                </p>
                <p className="mt-2 text-[11px] font-mono text-[#6b7a72]">
                  These predictions have no single &ldquo;correct&rdquo; direction, so they are never counted
                  toward the hit rate above.
                </p>
              </section>
            ) : null}

            {/* Per-asset breakdown table */}
            <section className="space-y-3 mb-10">
              <h2 className="text-xs font-bold text-[#86948a] uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                By asset
              </h2>
              <div className="overflow-hidden rounded-lg border border-[#3c4a42]">
                <table className="w-full font-mono text-[13px]">
                  <thead>
                    <tr className="bg-[#131313] text-left text-[10px] uppercase tracking-[0.2em] text-[#86948a]">
                      <th className="px-4 py-2 font-medium">Asset</th>
                      <th className="px-4 py-2 text-right font-medium">Sample size</th>
                      <th className="px-4 py-2 text-right font-medium">Hit rate</th>
                      <th className="px-4 py-2 text-right font-medium">Avg move when correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.by_asset).map(([asset, summary]) => (
                      <AssetRow key={asset} asset={asset} summary={summary} minSampleSize={data.min_sample_size} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] font-mono text-[#6b7a72]">
                Assets with fewer than {data.min_sample_size}
                {" "}
                scored predictions show &ldquo;not enough history yet&rdquo; instead of a headline percentage, to
                avoid a misleadingly small sample.
              </p>
            </section>

            <p className="text-[10px] font-mono text-[#6b7a72]">
              Generated {new Date(data.generated_at).toISOString()} (UTC)
            </p>
          </>
        )}
      </main>

      <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[#86948a] font-mono">
        Blue Beacon Research — Not investment advice.
      </footer>
    </div>
  );
}
