import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
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

const ACCURACY_HISTORICAL_NOTE =
  "This is a historical statistic, not a forecast, and a move after an assessment does not show the assessment caused it. Informational research, not investment advice.";

export function accuracyHorizonCaption(flatThresholdPct: unknown): string {
  if (typeof flatThresholdPct !== "number" || !Number.isFinite(flatThresholdPct)) {
    return ACCURACY_HISTORICAL_NOTE;
  }
  return `A call counts as correct only when the price moves at least ${flatThresholdPct}% in the called direction. A smaller move counts as flat and is scored as a miss, so short horizons show lower hit rates partly because prices rarely move that far in an hour. ${ACCURACY_HISTORICAL_NOTE}`;
}

type DirectionScore = {
  total: number | null;
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
  by_asset?: Record<string, AssetSummary>;
  by_asset_checkpoint_hours?: number;
  checkpoints?: CheckpointSummary[];
  date_range: { earliest: string; latest: string } | null;
  min_sample_size: number;
  volatility_threshold_pct: number;
  flat_threshold_pct?: number;
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
    const hasCheckpoints = !!json && Array.isArray(json.checkpoints);
    const hasOverall = !!json && json.overall != null && typeof json.overall.total_scored === "number";
    if (!res.ok || !json || (!hasCheckpoints && !hasOverall)) {
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

function countText(total: number | null): string {
  return total === null ? "—" : String(total);
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
            Up calls {countText(checkpoint.up.total)}. Up hit rate for this horizon:{" "}
            {rateText(checkpoint.up.hit_rate, checkpoint.up.not_enough_history, minSampleSize)}
          </p>
          <p className="font-mono text-[11px] text-[#6b7a72]">
            Down calls {countText(checkpoint.down.total)}. Down hit rate for this horizon:{" "}
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
              <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{countText(checkpoint.up.total)}</td>
              <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">
                {rateText(checkpoint.up.hit_rate, checkpoint.up.not_enough_history, minSampleSize)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{countText(checkpoint.down.total)}</td>
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

const OVERALL_HORIZON_HOURS = 48;

function directionUnavailable(): DirectionScore {
  return { total: null, correct: 0, hit_rate: null, not_enough_history: true };
}

function checkpointsFor(data: AccuracyPayload): CheckpointSummary[] {
  if (Array.isArray(data.checkpoints)) {
    return [...data.checkpoints].sort((a, b) => a.checkpoint_hours - b.checkpoint_hours);
  }
  const hours =
    typeof data.by_asset_checkpoint_hours === "number" ? data.by_asset_checkpoint_hours : OVERALL_HORIZON_HOURS;
  return [
    {
      checkpoint_hours: hours,
      ...data.overall,
      up: directionUnavailable(),
      down: directionUnavailable(),
    },
  ];
}

export function AccuracyReport({ data }: { data: AccuracyPayload | { error: string } }) {
  const ready = !("error" in data) && (Array.isArray(data.checkpoints) || data.overall != null) ? data : null;
  const checkpoints = ready ? checkpointsFor(ready) : [];
  const assetHorizonHours = ready?.by_asset_checkpoint_hours ?? OVERALL_HORIZON_HOURS;
  const assets = ready?.by_asset ?? {};

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
                {accuracyHorizonCaption(ready.flat_threshold_pct)}
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
                {horizonAdjective(assetHorizonHours)} results by asset
              </h2>
              <div className="md:hidden rounded-lg border border-[var(--border)] divide-y divide-[#2a2a2a] px-4">
                {Object.entries(assets).map(([asset, summary]) => (
                  <AssetCard key={asset} asset={asset} summary={summary} minSampleSize={ready.min_sample_size} />
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full min-w-[520px] font-mono text-[13px]">
                  <thead>
                    <tr className="bg-[var(--bg-primary)] text-left text-[12px] md:text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      <th className="px-4 py-2 font-medium">Asset</th>
                      <th className="px-4 py-2 text-right font-medium">Sample size</th>
                      <th className="px-4 py-2 text-right font-medium">{horizonAdjective(assetHorizonHours)} hit rate</th>
                      <th className="px-4 py-2 text-right font-medium">Avg move when correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(assets).map(([asset, summary]) => (
                      <AssetRow key={asset} asset={asset} summary={summary} minSampleSize={ready.min_sample_size} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[12px] md:text-[11px] font-mono text-[#6b7a72]">
                Assets with fewer than {ready.min_sample_size} scored calls at the{" "}
                {horizonAdjective(assetHorizonHours)} horizon show &ldquo;not enough history yet&rdquo; instead of a percentage.
              </p>
            </section>

            <p className="text-[12px] md:text-[11px] font-mono text-[#6b7a72]">
              Generated {new Date(ready.generated_at).toISOString()} (UTC)
            </p>
          </>
        )}
      </main>

      <PublicFooter />
      <LegalDisclaimerFooter />
    </div>
  );
}

export default async function AccuracyPage() {
  const data = await loadAccuracy();
  return <AccuracyReport data={data} />;
}
