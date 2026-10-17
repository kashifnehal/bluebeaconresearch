"use client";

import { useQuery } from "@tanstack/react-query";
import type { PulseCounts } from "@/lib/pulse";
import { formatDataAsOf } from "@/lib/utils";

type PulseResponse = PulseCounts & { error?: string };

const TILES = [
  { key: "last24h", label: "Signals last 24h", testId: "pulse-tile-last24h" },
  { key: "prior24h", label: "Prior 24h", testId: "pulse-tile-prior24h" },
  { key: "change", label: "Change vs prior", testId: "pulse-tile-change" },
  { key: "peak", label: "Peak hour", testId: "pulse-tile-peak" },
  { key: "direction", label: "Up / Down", testId: "pulse-tile-direction" },
] as const;

function formatChangePct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const rounded = Math.round(pct * 10) / 10;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded > 0 ? `+${body}%` : `${body}%`;
}

function formatPeakHourLocal(peakHourUtc: number | null): string {
  if (peakHourUtc == null) return "—";
  const stamp = new Date();
  stamp.setUTCHours(peakHourUtc, 0, 0, 0);
  return stamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function tileValue(pulse: PulseCounts | null, key: (typeof TILES)[number]["key"]): string {
  if (!pulse) return "—";
  if (key === "last24h") return String(pulse.last24h);
  if (key === "prior24h") return String(pulse.prior24h);
  if (key === "change") return formatChangePct(pulse.changePct);
  if (key === "peak") return formatPeakHourLocal(pulse.peakHourUtc);
  return `${pulse.up} / ${pulse.down}`;
}

export function PulseTiles({ symbol }: { symbol: string }) {
  const { data, isSuccess, isError, dataUpdatedAt } = useQuery({
    queryKey: ["signal-pulse", symbol],
    enabled: Boolean(symbol),
    queryFn: async () => {
      const res = await fetch(`/api/signals/pulse?symbol=${encodeURIComponent(symbol)}`);
      const json = (await res.json()) as PulseResponse;
      if (!res.ok || json.error) throw new Error(json.error ?? "pulse_failed");
      return json;
    },
    retry: 2,
  });

  const pulse = isSuccess ? data : null;
  const asOf = isSuccess ? formatDataAsOf(dataUpdatedAt) : null;

  return (
    <section className="mb-8" aria-label="Signal pulse" data-testid="pulse-tiles">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {TILES.map((tile) => (
          <div
            key={tile.key}
            data-testid={tile.testId}
            title={tile.key === "last24h" ? "Counts signals BBR published in the last 24 hours." : undefined}
            className="bg-surface-container/40 border border-outline-variant/30 rounded-xl p-4"
          >
            <p className="font-label text-[11px] md:text-[9px] font-bold text-on-surface-variant ">
              {tile.label}
            </p>
            <p className="font-mono text-2xl font-bold text-on-surface mt-2">{tileValue(pulse, tile.key)}</p>
          </div>
        ))}
      </div>
      {isError ? (
        <p className="mt-3 text-[12px] md:text-[10px] font-mono text-on-surface-variant/70 ">
          Couldn&apos;t load signal counts.
        </p>
      ) : null}
      {asOf ? (
        <p className="mt-3 text-[12px] md:text-[10px] font-mono text-on-surface-variant/70 ">
          {asOf}
        </p>
      ) : null}
    </section>
  );
}
