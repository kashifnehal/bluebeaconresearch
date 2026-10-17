"use client";

import Link from "next/link";
import { formatDataAsOf } from "@/lib/utils";
import { priceChangeColor, priceChangeParts } from "@/lib/price-change";
import { barWidthPct, maxPulseCount, type LedgerRow } from "@/lib/desk-ledger";

function formatPrice(symbol: string, price: number | null): string {
  if (price == null) return "—";
  const decimals = /^[A-Z]{6}$/.test(symbol) && !symbol.startsWith("XA") ? 4 : 2;
  return price.toFixed(decimals);
}

function Change({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const c = priceChangeParts(pct);
  return (
    <span style={{ color: priceChangeColor(c.direction) }} data-testid="ledger-change">
      {c.text}
    </span>
  );
}

/**
 * The two-bar pair: signals in the last 24 hours (solid) beside the 24 hours
 * before (outline). Counts are written out so the bars are never the only cue.
 */
function PulseBars({ row, max }: { row: LedgerRow; max: number }) {
  if (!row.pulse) {
    return (
      <span style={{ color: "var(--text-muted)" }} aria-label="Signal counts unavailable">
        —
      </span>
    );
  }
  const { last24h, prior24h } = row.pulse;
  return (
    <div
      className="flex gap-2"
      role="img"
      aria-label={`${last24h} signals in the last 24 hours, ${prior24h} in the 24 hours before`}
    >
      {[
        { n: last24h, solid: true },
        { n: prior24h, solid: false },
      ].map((b, i) => (
        <div key={i} className="min-w-[28px] flex-1">
          <div className="h-2" style={{ backgroundColor: "var(--bg-container)" }}>
            <div
              className="h-2"
              style={{
                width: `${barWidthPct(b.n, max)}%`,
                backgroundColor: b.solid ? "var(--interactive)" : "transparent",
                border: b.solid ? "none" : "1px solid var(--text-muted)",
                boxSizing: "border-box",
              }}
            />
          </div>
          <span className="block text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {b.n}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MarketsLedger({
  rows,
  asOf,
  loading,
}: {
  rows: LedgerRow[];
  asOf: number | null | undefined;
  loading: boolean;
}) {
  const max = maxPulseCount(rows);
  const stamp = formatDataAsOf(asOf);
  return (
    <section
      aria-label="Markets ledger"
      data-testid="markets-ledger"
      className="border"
      style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Markets ledger
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Signals in the last 24 hours (solid) and the 24 hours before (outline)
        </p>
      </div>

      {/* Mobile: one horizontal strip, ledger first. */}
      <ul className="flex gap-4 overflow-x-auto px-4 py-3 md:hidden" aria-label="Markets">
        {rows.map((r) => (
          <li key={r.symbol} className="shrink-0 text-[12px]">
            <Link href={`/watchlist/${encodeURIComponent(r.symbol)}`} className="block">
              <span className="block font-medium" style={{ color: "var(--text-primary)" }}>
                {r.label}
              </span>
              <span style={{ color: "var(--text-secondary)" }}>{formatPrice(r.symbol, r.price)} </span>
              <Change pct={r.changePct} />
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th scope="col" className="px-3 py-2 text-left font-medium">Asset</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">Last</th>
              <th scope="col" className="px-1 py-2 text-right font-medium">Change</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Signals, 24h and prior</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="border-t" style={{ borderColor: "var(--border)" }}>
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  <Link
                    href={`/watchlist/${encodeURIComponent(r.symbol)}`}
                    style={{ color: "var(--text-primary)" }}
                    className="hover:underline"
                  >
                    {r.label}
                  </Link>
                </th>
                <td className="px-1 py-2 text-right" style={{ color: "var(--text-primary)" }}>
                  {formatPrice(r.symbol, r.price)}
                </td>
                <td className="px-1 py-2 text-right">
                  <Change pct={r.changePct} />
                </td>
                <td className="px-3 py-2 min-w-[96px]">
                  <PulseBars row={r} max={max} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {loading ? "Loading prices…" : "No tracked assets yet. Add some on the watchlist."}
        </p>
      ) : null}
      {stamp ? (
        <p
          className="px-4 py-2 text-[11px] border-t"
          style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}
          suppressHydrationWarning
          data-testid="ledger-data-as-of"
        >
          {stamp}
        </p>
      ) : null}
    </section>
  );
}
