import { PublicHeader } from "@/components/layout/PublicHeader";
import { LegalDisclaimerFooter } from "@/components/layout/LegalDisclaimerFooter";
import { ACCURACY_LOAD_ERROR } from "@/lib/user-error-copy";

// Public accuracy page. Reads the pre-computed aggregates from GET /v1/accuracy.
// Every figure on the page comes from that response. Real numbers per request.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Accuracy | Blue Beacon Research",
  description:
    "Blue Beacon Research's historical signal accuracy, computed automatically from recorded price changes.",
};

export const ACCURACY_HORIZON_CAPTION =
  "The longer the wait, the higher the hit rate. Short horizons are weak. This is a historical statistic, not a forecast, and a move after an assessment does not show the assessment caused it. Informational research, not investment advice.";

type DirectionScore = {
  total: number;
  correct: number;
  hit_rate: number | null;
  not_enough_history: boolean;
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

export type CheckpointSummary = AssetSummary & {
  checkpoint_hours: number;
  up: DirectionScore;
  down: DirectionScore;
};

export type AccuracyPayload = {
  overall: AssetSummary;
  by_asset: Record<string, AssetSummary>;
  by_asset_checkpoint_hours: number;
  checkpoints: CheckpointSummary[];
  date_range: { earliest: string; latest: string } | null;
  min_sample_size: number;
  volatility_threshold_pct: number;
  generated_at: string;
};

async function loadAccuracy(): Promise<AccuracyPayload | { error: string }> {
  const apiBase = process.env.API_URL?.replace(/\/$/, "");
  if (!apiBase) {
    console.error("[accuracy] load failed: Missing API_URL env var");
    return { error: "Missing API_URL env var" };
  }
  try {
    const res = await fetch(`${apiBase}/v1/accuracy`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as AccuracyPayload | null;
    if (!res.ok || !json || !Array.isArray(json.checkpoints)) {
      const detail = `Upstream ${res.status}`;
      console.error("[accuracy] load failed:", detail);
      return { error: detail };
    }
    return json;
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Request failed";
    console.error("[accuracy] load failed:", detail);
    return { error: detail };
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMove(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(2)}%`;
}

export function horizonLabel(hours: number): string {
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function horizonAdjective(hours: number): string {
  return `${hours}-hour`;
}

function rateText(
  hitRate: number | null,
  notEnoughHistory: boolean,
  minSampleSize: number,
): string {
  if (notEnoughHistory || hitRate === null) {
    return `Not enough history yet (min ${minSampleSize})`;
  }
  return fmtPct(hitRate);
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
      {summary.not_enough_history || summary.hit_rate === null ? (
        <td colSpan={2} className="px-4 py-3 text-right font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
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

function AssetCard({
  asset,
  summary,
  minSampleSize,
}: {
  asset: string;
  summary: AssetSummary;
  minSampleSize: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="font-mono text-sm text-[#e5e2e1]">{asset}</span>
      {summary.not_enough_history || summary.hit_rate === null ? (
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)] text-right">
          Not enough history yet (min {minSampleSize})
        </span>
      ) : (
        <div className="text-right">
          <div className="font-mono text-sm text-[#e5e2e1]">
            {fmtPct(summary.hit_rate)}{" "}
            <span className="text-[#6b7a72] text-xs">· {summary.sample_size_note} scored</span>
          </div>
          <div className="font-mono text-[11px] text-[#6b7a72]">
            avg move {fmtMove(summary.avg_move_when_correct)}
          </div>
        </div>
      )}
    </div>
  );
}

function HorizonCards({
  checkpoints,
  minSampleSize,
}: {
  checkpoints: CheckpointSummary[];
  minSampleSize: number;
}) {
  return (
    <div className="md:hidden rounded-lg border border-[var(--border)] divide-y divide-[#2a2a2a] px-4" data-testid="horizon-cards">
      {checkpoints.map((checkpoint) => (
        <div key={checkpoint.checkpoint_hours} className="py-3" data-testid={`horizon-${checkpoint.checkpoint_hours}`}>
          <p className="font-mono text-sm text-[#e5e2e1]">{horizonLabel(checkpoint.checkpoint_hours)}</p>
          <p className="mt-1 font-mono text-[11px] text-[#6b7a72]">
            Scored {checkpoint.total_scored}. Hit rate for this horizon:{" "}
            {rateText(checkpoint.hit_rate, checkpoint.not_enough_history, minSampleSize)}
          </p>
          <p className="font-mono text-[11px] text-[#6b7a72]">
            Up calls {checkpoint.up.total}. Up hit rate for this horizon:{" "}
            {rateText(checkpoint.up.hit_rate, checkpoint.up.not_enough_history, minSampleSize)}
          </p>
          <p className="font-mono text-[11px] text-[#6b7a72]">
            Down calls {checkpoint.down.total}. Down hit rate for this horizon:{" "}
            {rateText(checkpoint.down.hit_rate, checkpoint.down.not_enough_history, minSampleSize)}
          </p>
        </div>
      ))}
    </div>
  );
}

function HorizonTable({
  checkpoints,
  minSampleSize,
}: {
  checkpoints: CheckpointSummary[];
  minSampleSize: number;
}) {
  return (
    <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full min-w-[720px] font-mono text-[13px]" data-testid="horizon-table">
        <thead>
          <tr className="bg-[var(--bg-primary)] text-left text-[12px] md:text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            <th className="px-4 py-2 font-medium">Horizon</th>
            <th className="px-4 py-2 text-right font-medium">Scored</th>
            <th className="px-4 py-2 text-right font-medium">Hit rate for this horizon</th>
            <th className="px-4 py-2 text-right font-medium">Up calls</th>
            <th className="px-4 py-2 text-right font-medium">Up hit rate for this horizon</th>
            <th className="px-4 py-2 text-right font-medium">Down calls</th>
            <th className="px-4 py-2 text-right font-medium">Down hit rate for this horizon</th>
          </tr>
        </thead>
        <tbody>
          {checkpoints.map((checkpoint) => (
            <tr key={checkpoint.checkpoint_hours} className="border-t border-[#2a2a2a]" data-testid={`horizon-${checkpoint.checkpoint_hours}`}>
              <td className="px-4 py-3 font-mono text-sm text-[#e5e2e1]">{horizonLabel(checkpoint.checkpoint_hours)}</td>
              <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{checkpoint.total_scored}</td>
              <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">
                {rateText(checkpoint.hit_rate, checkpoint.not_enough_history, minSampleSize)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{checkpoint.up.total}</td>
              <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">
                {rateText(checkpoint.up.hit_rate, checkpoint.up.not_enough_history, minSampleSize)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{checkpoint.down.total}</td>
              <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">
                {rateText(checkpoint.down.hit_rate, checkpoint.down.not_enough_history, minSampleSize)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccuracyReport({ data }: { data: AccuracyPayload | { error: string } }) {
  const ready = !("error" in data) && Array.isArray(data.checkpoints) ? data : null;
  const checkpoints = ready
    ? [...ready.checkpoints].sort((a, b) => a.checkpoint_hours - b.checkpoint_hours)
    : [];

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge="ACCURACY" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-8 py-16">
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Signal Accuracy
        </h1>
        <p className="text-xs text-[var(--text-muted)] mb-8 font-mono">
          Computed automatically from recorded price changes at each checkpoint.
        </p>

        <div className="p-5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg mb-10">
          <p className="text-xs text-[#e5e2e1] leading-relaxed">
            Historical record of direction calls, computed automatically from recorded price changes.
          </p>
        </div>

        {ready === null ? (
          <div className="rounded-lg border border-[#7a3c3c] bg-[#1a1010] px-4 py-3 font-mono text-[12px] text-[#e0a0a0]">
            {ACCURACY_LOAD_ERROR}
          </div>
        ) : (
          <>
            <p className="text-xs font-mono text-[var(--text-muted)] mb-6">
              {ready.date_range
                ? `Recorded from ${fmtDate(ready.date_range.earliest)} to ${fmtDate(ready.date_range.latest)} (UTC).`
                : "Date range unavailable."}
            </p>

            <section className="space-y-3 mb-6">
              <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                By horizon
              </h2>
              <HorizonCards checkpoints={checkpoints} minSampleSize={ready.min_sample_size} />
              <HorizonTable checkpoints={checkpoints} minSampleSize={ready.min_sample_size} />
              <p className="text-[12px] md:text-[11px] font-mono text-[#6b7a72]" data-testid="accuracy-caption">
                {ACCURACY_HORIZON_CAPTION}
              </p>
            </section>

            <section className="mb-10 p-5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg">
              <p className="text-[12px] md:text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">
                Volatile / neutral calls (not scored as correct or incorrect)
              </p>
              {checkpoints.map((checkpoint) =>
                checkpoint.volatile_neutral_summary ? (
                  <p key={checkpoint.checkpoint_hours} className="text-sm text-[#e5e2e1] font-mono mb-2">
                    {checkpoint.volatile_neutral_summary.total} calls labeled volatile or neutral at the{" "}
                    {horizonAdjective(checkpoint.checkpoint_hours)} horizon —{" "}
                    {fmtPct(checkpoint.volatile_neutral_summary.fraction_above_threshold)} of those saw an actual move of{" "}
                    {checkpoint.volatile_neutral_summary.threshold_pct}% or more in either direction.
                  </p>
                ) : null,
              )}
              <p className="mt-2 text-[12px] md:text-[11px] font-mono text-[#6b7a72]">
                These calls have no single correct direction, so they are never counted toward the hit rate for any horizon in the table above.
              </p>
            </section>

            <section className="space-y-3 mb-10">
              <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {horizonAdjective(ready.by_asset_checkpoint_hours)} results by asset
              </h2>
              <div className="md:hidden rounded-lg border border-[var(--border)] divide-y divide-[#2a2a2a] px-4">
                {Object.entries(ready.by_asset).map(([asset, summary]) => (
                  <AssetCard key={asset} asset={asset} summary={summary} minSampleSize={ready.min_sample_size} />
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full min-w-[520px] font-mono text-[13px]">
                  <thead>
                    <tr className="bg-[var(--bg-primary)] text-left text-[12px] md:text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      <th className="px-4 py-2 font-medium">Asset</th>
                      <th className="px-4 py-2 text-right font-medium">Sample size</th>
                      <th className="px-4 py-2 text-right font-medium">{horizonAdjective(ready.by_asset_checkpoint_hours)} hit rate</th>
                      <th className="px-4 py-2 text-right font-medium">Avg move when correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ready.by_asset).map(([asset, summary]) => (
                      <AssetRow key={asset} asset={asset} summary={summary} minSampleSize={ready.min_sample_size} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[12px] md:text-[11px] font-mono text-[#6b7a72]">
                Assets with fewer than {ready.min_sample_size} scored calls at the{" "}
                {horizonAdjective(ready.by_asset_checkpoint_hours)} horizon show &ldquo;not enough history yet&rdquo; instead of a percentage.
              </p>
            </section>

            <p className="text-[12px] md:text-[11px] font-mono text-[#6b7a72]">
              Generated {new Date(ready.generated_at).toISOString()} (UTC)
            </p>
          </>
        )}
      </main>

      <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[var(--text-muted)] font-mono">
        Blue Beacon Research — Not investment advice.
      </footer>
      <LegalDisclaimerFooter />
    </div>
  );
}

export default async function AccuracyPage() {
  const data = await loadAccuracy();
  return <AccuracyReport data={data} />;
}
