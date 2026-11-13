import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { LegalDisclaimerFooter } from "@/components/layout/LegalDisclaimerFooter";
import { ACCURACY_LOAD_ERROR } from "@/lib/user-error-copy";

// Public accuracy page. Reads the pre-computed aggregates from GET /v1/accuracy.
// Every figure on the page comes from that response. Real numbers per request.
//
// 2026-11-09 rewrite (honest, checkable accuracy data): no hit-rate headline
// and no confidence-band figure anywhere on this page. The horizon table
// shows the scored count, the flat share, right/wrong counts for up and down
// calls separately (not a hit-rate percentage), and the plain baseline share
// of windows where the market rose, next to those counts. A horizon with
// fewer scored calls than min_sample_size is left out of the table entirely
// rather than shown with a placeholder row.
export const dynamic = "force-dynamic";

const ACCURACY_HEADLINE =
  "Every assessment is dated, sourced and scored against what the market did next. The misses are shown.";

export const metadata = {
  title: "Accuracy | Blue Beacon Research",
  description: ACCURACY_HEADLINE,
};

const ACCURACY_HISTORICAL_NOTE =
  "This is a historical statistic, not a forecast. A move after an assessment does not show the assessment caused it. Informational research, not investment advice.";

export function flatThresholdCaption(flatThresholdPct: unknown): string | null {
  if (typeof flatThresholdPct !== "number" || !Number.isFinite(flatThresholdPct)) return null;
  return `A call counts as right only when the price moved at least ${flatThresholdPct}% in the called direction. A smaller move is flat and counts as a miss either way.`;
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
  flat_share?: number | null;
  market_rose_share?: number | null;
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

function fmtShare(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
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

function countText(total: number | null | undefined): string {
  return typeof total === "number" ? String(total) : "—";
}

function wrongCount(total: number | null | undefined, correct: number): number | null {
  return typeof total === "number" ? total - correct : null;
}

function NotEnoughHistory() {
  return (
    <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
      There are not enough checked assessments yet to show a result for this group.
    </span>
  );
}

function AssetRow({
  asset,
  summary,
}: {
  asset: string;
  summary: AssetSummary;
}) {
  const wrong = wrongCount(summary.total_scored, summary.correct);
  return (
    <tr className="border-t border-[#2a2a2a]">
      <td className="px-4 py-3 font-mono text-sm text-[#e5e2e1]">{asset}</td>
      <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">
        {summary.sample_size_note}
      </td>
      {summary.not_enough_history ? (
        <td colSpan={3} className="px-4 py-3 text-right">
          <NotEnoughHistory />
        </td>
      ) : (
        <>
          <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{summary.correct}</td>
          <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{wrong}</td>
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
}: {
  asset: string;
  summary: AssetSummary;
}) {
  const wrong = wrongCount(summary.total_scored, summary.correct);
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="font-mono text-sm text-[#e5e2e1]">{asset}</span>
      {summary.not_enough_history ? (
        <NotEnoughHistory />
      ) : (
        <div className="text-right">
          <div className="font-mono text-sm text-[#e5e2e1]">
            Right {summary.correct} · Wrong {wrong}{" "}
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

function HorizonCards({ checkpoints }: { checkpoints: CheckpointSummary[] }) {
  return (
    <div className="md:hidden rounded-lg border border-[var(--border)] divide-y divide-[#2a2a2a] px-4" data-testid="horizon-cards">
      {checkpoints.map((checkpoint) => {
        const upWrong = wrongCount(checkpoint.up.total, checkpoint.up.correct);
        const downWrong = wrongCount(checkpoint.down.total, checkpoint.down.correct);
        return (
          <div key={checkpoint.checkpoint_hours} className="py-3" data-testid={`horizon-${checkpoint.checkpoint_hours}`}>
            <p className="font-mono text-sm text-[#e5e2e1]">{horizonLabel(checkpoint.checkpoint_hours)}</p>
            <p className="mt-1 font-mono text-[11px] text-[#6b7a72]">
              Scored {checkpoint.total_scored}. Flat share: {fmtShare(checkpoint.flat_share)}.
            </p>
            <p className="font-mono text-[11px] text-[#6b7a72]">
              Up calls — right {countText(checkpoint.up.correct)}, wrong {countText(upWrong)}.
            </p>
            <p className="font-mono text-[11px] text-[#6b7a72]">
              Down calls — right {countText(checkpoint.down.correct)}, wrong {countText(downWrong)}.
            </p>
            <p className="font-mono text-[11px] text-[#6b7a72]">
              Market rose (baseline): {fmtShare(checkpoint.market_rose_share)}.
            </p>
          </div>
        );
      })}
    </div>
  );
}

function HorizonTable({ checkpoints }: { checkpoints: CheckpointSummary[] }) {
  return (
    <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full min-w-[820px] font-mono text-[13px]" data-testid="horizon-table">
        <thead>
          <tr className="bg-[var(--bg-primary)] text-left text-[12px] md:text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            <th className="px-4 py-2 font-medium">Horizon</th>
            <th className="px-4 py-2 text-right font-medium">Scored</th>
            <th className="px-4 py-2 text-right font-medium">Flat share</th>
            <th className="px-4 py-2 text-right font-medium">Up right</th>
            <th className="px-4 py-2 text-right font-medium">Up wrong</th>
            <th className="px-4 py-2 text-right font-medium">Down right</th>
            <th className="px-4 py-2 text-right font-medium">Down wrong</th>
            <th className="px-4 py-2 text-right font-medium">Market rose (baseline)</th>
          </tr>
        </thead>
        <tbody>
          {checkpoints.map((checkpoint) => {
            const upWrong = wrongCount(checkpoint.up.total, checkpoint.up.correct);
            const downWrong = wrongCount(checkpoint.down.total, checkpoint.down.correct);
            return (
              <tr key={checkpoint.checkpoint_hours} className="border-t border-[#2a2a2a]" data-testid={`horizon-${checkpoint.checkpoint_hours}`}>
                <td className="px-4 py-3 font-mono text-sm text-[#e5e2e1]">{horizonLabel(checkpoint.checkpoint_hours)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{checkpoint.total_scored}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{fmtShare(checkpoint.flat_share)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{countText(checkpoint.up.correct)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{countText(upWrong)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{countText(checkpoint.down.correct)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{countText(downWrong)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-[#e5e2e1]">{fmtShare(checkpoint.market_rose_share)}</td>
              </tr>
            );
          })}
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
  const allCheckpoints = ready ? checkpointsFor(ready) : [];
  const minSampleSize = ready?.min_sample_size ?? 0;
  // Hide any horizon with fewer scored rows than the sample floor — it is
  // left out of the table entirely, not shown with a placeholder row.
  const checkpoints = allCheckpoints.filter((c) => c.total_scored >= minSampleSize);
  const assetHorizonHours = ready?.by_asset_checkpoint_hours ?? OVERALL_HORIZON_HOURS;
  const assets = ready?.by_asset ?? {};
  const flatCaption = ready ? flatThresholdCaption(ready.flat_threshold_pct) : null;

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge="ACCURACY" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-8 py-16">
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Signal Accuracy
        </h1>

        <div className="p-5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg mb-10">
          <p className="text-sm text-[#e5e2e1] leading-relaxed" data-testid="accuracy-headline">
            {ACCURACY_HEADLINE}
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
              {checkpoints.length > 0 ? (
                <>
                  <HorizonCards checkpoints={checkpoints} />
                  <HorizonTable checkpoints={checkpoints} />
                  <p
                    className="text-[12px] md:text-[11px] font-mono text-[#6b7a72]"
                    data-testid="accuracy-baseline-rows-caption"
                  >
                    Up right and Market rose (baseline) do not count the same rows: Up right is
                    scored only against the windows this page called up; Market rose (baseline)
                    is the share of every scored window at this horizon — including down,
                    volatile, and neutral calls — where the price actually rose.
                  </p>
                </>
              ) : (
                <p
                  className="font-mono text-[12px] text-[var(--text-muted)]"
                  data-testid="horizon-below-floor"
                >
                  Not enough history yet at any horizon (min {minSampleSize} scored calls).
                </p>
              )}
              {flatCaption ? (
                <p className="text-[12px] md:text-[11px] font-mono text-[#6b7a72]" data-testid="accuracy-flat-caption">
                  {flatCaption}
                </p>
              ) : null}
              <p className="text-[12px] md:text-[11px] font-mono text-[#6b7a72]" data-testid="accuracy-caption">
                {ACCURACY_HISTORICAL_NOTE}
              </p>
            </section>

            <section className="mb-10 p-5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg">
              <p className="text-[12px] md:text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">
                Volatile / neutral calls (not scored right or wrong)
              </p>
              {checkpoints.map((checkpoint) =>
                checkpoint.volatile_neutral_summary ? (
                  <p key={checkpoint.checkpoint_hours} className="text-sm text-[#e5e2e1] font-mono mb-2">
                    {checkpoint.volatile_neutral_summary.total} calls labeled volatile or neutral at the{" "}
                    {horizonAdjective(checkpoint.checkpoint_hours)} horizon —{" "}
                    {fmtShare(checkpoint.volatile_neutral_summary.fraction_above_threshold)} of those saw an actual move of{" "}
                    {checkpoint.volatile_neutral_summary.threshold_pct}% or more in either direction.
                  </p>
                ) : null,
              )}
              <p className="mt-2 text-[12px] md:text-[11px] font-mono text-[#6b7a72]">
                These calls have no single correct direction, so they are not scored right or wrong at any horizon above.
              </p>
            </section>

            <section className="space-y-3 mb-10">
              <h2 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {horizonAdjective(assetHorizonHours)} results by asset
              </h2>
              <div className="md:hidden rounded-lg border border-[var(--border)] divide-y divide-[#2a2a2a] px-4">
                {Object.entries(assets).map(([asset, summary]) => (
                  <AssetCard key={asset} asset={asset} summary={summary} />
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full min-w-[560px] font-mono text-[13px]" data-testid="asset-table">
                  <thead>
                    <tr className="bg-[var(--bg-primary)] text-left text-[12px] md:text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      <th className="px-4 py-2 font-medium">Asset</th>
                      <th className="px-4 py-2 text-right font-medium">Scored</th>
                      <th className="px-4 py-2 text-right font-medium">Right</th>
                      <th className="px-4 py-2 text-right font-medium">Wrong</th>
                      <th className="px-4 py-2 text-right font-medium">Avg move when right</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(assets).map(([asset, summary]) => (
                      <AssetRow key={asset} asset={asset} summary={summary} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p
                className="text-[12px] md:text-[11px] font-mono text-[#6b7a72]"
                data-testid="accuracy-by-asset-footnote"
              >
                Assets with too few scored calls at the 48-hour horizon show a short note instead of counts.
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
