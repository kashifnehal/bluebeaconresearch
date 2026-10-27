"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { COMMODITIES, FOREX_PAIRS, NEWS_ONLY_COMMODITIES } from "@blue-beacon-research/shared";
import { SELECT_CLASSES, formatDataAsOf, safeFormatDistanceToNow } from "@/lib/utils";
import { useMyPreferences } from "@/hooks/useMyPreferences";
import { logUsageEvent } from "@/lib/funnel-events";
import { Skeleton } from "@/components/ui/skeleton";
import { SlowDataNotice } from "@/components/SlowDataNotice";
import { DATA_SLOW_MESSAGE, fetchJsonWithTimeout } from "@/lib/fetch-with-timeout";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageShell } from "@/components/layout/PageShell";
import { Toolbar, SortSelect } from "@/components/layout/Toolbar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  NEWS_ONLY_FEED_LABEL,
  fetchNewsOnlyCardSignals,
  isNewsOnlySymbol,
  newsOnlyMarketLabel,
  signalCountLabel,
} from "@/lib/news-only-assets";

// Priced commodities, forex pairs, and the seven news-only commodities share
// one watchlist. News-only entries use the same {symbol,label,unit,category}
// shape. The default seed stays the priced commodity list — news-only assets
// are added with the existing Add control.
const NEWS_ONLY_WATCHLIST_ASSETS = NEWS_ONLY_COMMODITIES.map((c) => ({
  symbol: c.symbol,
  label: c.label,
  unit: c.unit,
  category: c.category,
}));
export const WATCHLIST_ASSETS = [
  ...COMMODITIES,
  ...FOREX_PAIRS,
  ...NEWS_ONLY_WATCHLIST_ASSETS,
];

// First-paint / no-selection seed: the priced commodity list, so the page is
// never an empty dropdown while prefs/localStorage hydrate. A later remove is
// persisted and not silently re-added. Prefs (commodities ∪ forex) still win
// once they load. Forex and news-only assets stay addable via the dropdown.
export const DEFAULT_WATCHLIST = COMMODITIES.map((c) => c.symbol);

const WATCHLIST_STORAGE_KEY = "bbr.watchlist.v1";

type StoredWatchlist = {
  symbols: string[];
  seeded: boolean;
  suggested?: boolean;
};

function readStoredWatchlist(): StoredWatchlist | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWatchlist;
    if (!parsed || !Array.isArray(parsed.symbols)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredWatchlist(value: StoredWatchlist) {
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Quota / private mode — watchlist still works for this session.
  }
}

type Price = {
  symbol: string;
  price: number;
  change_pct_24h?: number;
  changePct24h?: number;
};

export type PriceHistoryResponseBody = {
  points: { price: number; fetchedAt: string }[];
  error?: { code: string; message: string };
};

// Shared by every /api/prices/history caller (the sparkline here, and the
// drill-down chart in watchlist/[symbol]/page.tsx): a rate-limit/db/auth
// failure comes back as a 200-shaped `{ points: [] }` body is no longer
// treated the same as "no history yet" — it must surface as a query error so
// the UI can tell the two apart instead of silently showing an empty chart.
export function parsePriceHistoryPoints(ok: boolean, json: PriceHistoryResponseBody) {
  if (!ok || json.error) {
    throw new Error(json.error?.code ?? "price_history_failed");
  }
  return json.points ?? [];
}

export type SparklineDisplay = "loading" | "error" | "insufficient" | "flat" | "chart";

export function sparklineDisplayState(
  isLoading: boolean,
  isError: boolean,
  pointsLength: number,
  prices?: readonly number[],
): SparklineDisplay {
  if (isLoading) return "loading";
  if (isError) return "error";
  if (pointsLength < 2) return "insufficient";
  if (prices && prices.length >= 2) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return "flat";
  }
  return "chart";
}

/**
 * Real recent-price sparkline (replaces a previous Math.random() placeholder that
 * presented fabricated bars as a "LIVE VOLATILITY INDEX" — same pattern already
 * removed elsewhere in this product; not okay to leave in a paying trader's view).
 */
function PriceSparkline({ symbol, isUp }: { symbol: string; isUp: boolean }) {
  // The 7-day window and 14 bars are a UI choice, not a researched value.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["price-history", symbol, "spark7d"],
    queryFn: async () => {
      const json = await fetchJsonWithTimeout<PriceHistoryResponseBody>(
        `/api/prices/history?symbol=${encodeURIComponent(symbol)}&days=7&points=14`,
      );
      return parsePriceHistoryPoints(true, json);
    },
    staleTime: 60_000,
  });

  const points = (data ?? []).map((p) => p.price);
  const display = sparklineDisplayState(isLoading, isError, points.length, points);

  if (display === "loading") {
    return (
      <div
        className="absolute inset-x-6 top-6 bottom-12 flex items-end gap-1"
        data-testid="sparkline-skeleton"
      >
        {[40, 65, 50, 80, 55, 90, 60].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    );
  }

  if (display === "error") {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant uppercase tracking-[0.2em] text-center leading-relaxed">
          {DATA_SLOW_MESSAGE}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="pointer-events-auto text-primary hover:text-primary-container font-label text-[11px] uppercase tracking-widest font-bold transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (display === "insufficient") {
    return (
      <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant uppercase tracking-[0.2em] text-center leading-relaxed">
        Not enough price history yet for a trend view
      </p>
    );
  }

  if (display === "flat") {
    return (
      <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant uppercase tracking-[0.2em] text-center leading-relaxed">
        No price change in the last 7 days
      </p>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return (
    <>
      <div className="absolute inset-x-6 top-6 bottom-12 flex items-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
        {points.map((price, i) => {
          const h = 15 + ((price - min) / range) * 85;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-sm transition-all duration-500 ${isUp ? "bg-primary/20" : "bg-error/20"}`}
              style={{ height: `${h}%` }}
            >
              <div
                className={`w-full h-full rounded-t-sm transition-all duration-700 ${isUp ? "bg-primary/40 group-hover:bg-primary" : "bg-error/40 group-hover:bg-error"}`}
                style={{ opacity: 0.3 + (i / points.length) * 0.7 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant uppercase tracking-[0.2em] text-center mt-4 font-bold border-t border-outline-variant/10 pt-4">
        Recent price trend
      </p>
    </>
  );
}

export function NewsOnlyCardSummary({
  label,
  count,
  headline,
  headlineAge,
}: {
  label: string;
  count: number | null;
  headline: string | null;
  headlineAge: string | null;
}) {
  return (
    <div data-testid="news-only-card-summary">
      <h2 className="text-xl font-headline font-bold text-on-surface">{label}</h2>
      <p
        data-testid="news-only-feed-label"
        className="mt-2 text-[12px] md:text-[11px] font-mono text-on-surface-variant uppercase tracking-widest"
      >
        {NEWS_ONLY_FEED_LABEL}
      </p>
      {count == null ? (
        <p className="mt-4 text-sm text-on-surface-variant">7-day signal count unavailable</p>
      ) : (
        <p className="mt-4 text-sm text-on-surface">{signalCountLabel(count)}</p>
      )}
      {headline ? (
        <p className="mt-2 text-sm text-on-surface leading-snug">
          {headline}
          {headlineAge ? (
            <span className="text-on-surface-variant"> · {headlineAge}</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-sm text-on-surface-variant">No signal in the last 7 days</p>
      )}
    </div>
  );
}

function NewsOnlyWatchlistCard({
  symbol,
  label,
  category,
  onRemove,
}: {
  symbol: string;
  label: string;
  category: string;
  onRemove: () => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["news-only-card-signals", symbol],
    queryFn: () => fetchNewsOnlyCardSignals(symbol),
    staleTime: 60_000,
  });
  const headlineAge = data?.headlineAt
    ? safeFormatDistanceToNow(data.headlineAt, { addSuffix: true })
    : null;

  return (
    <div
      data-testid="news-only-watchlist-card"
      className="relative bg-surface-container/40 border border-outline-variant/30 rounded-xl overflow-hidden group hover:border-primary/50 transition-colors"
    >
      <Link
        href={`/watchlist/${encodeURIComponent(symbol)}`}
        aria-label={`Open ${label} drill-down`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} from watchlist`}
        className="absolute right-4 top-4 z-20 text-on-surface-variant hover:text-error transition-colors p-[13px] md:p-1"
      >
        <span className="material-symbols-outlined text-lg">close</span>
      </button>
      <div className="p-6 bg-black/40 relative z-10 pointer-events-none min-h-[220px]">
        <span className="bg-surface-container-high px-2 py-0.5 rounded-sm font-label text-[12px] md:text-[9px] text-on-surface-variant tracking-widest mb-2 inline-block uppercase">
          {category}
        </span>
        {isLoading ? (
          <div data-testid="news-only-card-loading">
            <h2 className="text-xl font-headline font-bold text-on-surface">{label}</h2>
            <p className="mt-2 text-[12px] md:text-[11px] font-mono text-on-surface-variant uppercase tracking-widest">
              {NEWS_ONLY_FEED_LABEL}
            </p>
            <p className="mt-4 text-sm text-on-surface-variant">Loading signals from the last 7 days</p>
          </div>
        ) : isError ? (
          <div data-testid="news-only-card-error">
            <h2 className="text-xl font-headline font-bold text-on-surface">{label}</h2>
            <p className="mt-2 text-[12px] md:text-[11px] font-mono text-on-surface-variant uppercase tracking-widest">
              {NEWS_ONLY_FEED_LABEL}
            </p>
            <SlowDataNotice onRetry={() => void refetch()} />
          </div>
        ) : (
          <NewsOnlyCardSummary
            label={label}
            count={data?.count ?? null}
            headline={data?.headline ?? null}
            headlineAge={headlineAge}
          />
        )}
      </div>
    </div>
  );
}

export function withPreselect(symbols: string[], preselect: string | null): string[] {
  if (!preselect || symbols.includes(preselect)) return symbols;
  return [...symbols, preselect];
}

export type WatchlistSort = "added" | "name" | "change";
export const WATCHLIST_SORT_STORAGE_KEY = "bbr.watchlist.sort";
export const WATCHLIST_SORT_OPTIONS: { value: WatchlistSort; label: string }[] = [
  { value: "added", label: "Added order" },
  { value: "name", label: "Name A to Z" },
  { value: "change", label: "24h change (high to low)" },
];

/** Pure so it can be unit-tested without the surrounding query/localStorage plumbing. */
export function sortWatchlistSymbols(
  symbols: string[],
  sort: WatchlistSort,
  getLabel: (symbol: string) => string,
  getChangePct: (symbol: string) => number | null,
): string[] {
  if (sort === "added") return symbols;
  if (sort === "name") {
    return [...symbols].sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
  }
  return [...symbols].sort((a, b) => {
    const pa = getChangePct(a);
    const pb = getChangePct(b);
    if (pa == null && pb == null) return 0;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pb - pa;
  });
}

export function WatchlistClient() {
  const params = useSearchParams();
  const preselect = params.get("symbol");
  // Deterministic initial values — must match server-rendered HTML exactly, so
  // localStorage (only available client-side) cannot be read here (React error
  // #418 hydration mismatch). The real list is read inside the hydration effect
  // below instead, and the card grid stays hidden behind a skeleton until then.
  const [watch, setWatch] = useState<string[]>([]);
  const [isSuggested, setIsSuggested] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Preference-aware default (#89, extended for forex in #87): when the user has
  // told us which commodities and/or currency pairs they follow, those remain
  // one click away via "My Commodities". First-visit seed uses those prefs when
  // present, otherwise the generic 8 — labeled as a suggestion, not a silent
  // overwrite. Server watchlist on user_preferences is the source of truth;
  // localStorage is only a fast cache.
  const { data: myPrefs, isFetched, persistWatchlist } = useMyPreferences();
  const prefSymbols = useMemo(
    () =>
      [...(myPrefs?.commodities ?? []), ...(myPrefs?.forexPairs ?? [])].filter(
        (s) => WATCHLIST_ASSETS.some((a) => a.symbol === s),
      ),
    [myPrefs?.commodities, myPrefs?.forexPairs],
  );
  const touchedRef = useRef(false);

  useEffect(() => {
    if (hydrated || !isFetched) return;
    // Chip / dropdown edits during the prefs fetch must not be overwritten.
    if (touchedRef.current) {
      setHydrated(true);
      return;
    }

    const stored = readStoredWatchlist();
    const serverSymbols = myPrefs?.watchlistSymbols ?? null;

    if (serverSymbols !== null) {
      const next = withPreselect(serverSymbols, preselect);
      const suggested =
        Boolean(myPrefs?.watchlistSuggested) && next.length > 0 && !preselect;
      setWatch(next);
      setIsSuggested(suggested);
      writeStoredWatchlist({ symbols: next, seeded: true, suggested });
      setHydrated(true);
      return;
    }

    // No server list yet. Promote a user-edited local cache so #107 removals
    // survive the first login after this persist landed. A suggested-only
    // cache (the old generic-8 seed) is ignored when real prefs exist.
    if (stored && stored.seeded && stored.suggested === false) {
      const next = withPreselect(stored.symbols, preselect);
      setWatch(next);
      setIsSuggested(false);
      writeStoredWatchlist({ symbols: next, seeded: true, suggested: false });
      void persistWatchlist(next, false);
      setHydrated(true);
      return;
    }

    const seed =
      prefSymbols.length > 0 ? [...prefSymbols] : [...DEFAULT_WATCHLIST];
    const next = withPreselect(seed, preselect);
    const suggested = !preselect;
    setWatch(next);
    setIsSuggested(suggested);
    writeStoredWatchlist({ symbols: next, seeded: true, suggested });
    void persistWatchlist(next, suggested);
    setHydrated(true);
  }, [
    hydrated,
    isFetched,
    myPrefs,
    persistWatchlist,
    prefSymbols,
    preselect,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredWatchlist({
      symbols: watch,
      seeded: true,
      suggested: isSuggested,
    });
    void persistWatchlist(watch, isSuggested);
  }, [watch, hydrated, isSuggested, persistWatchlist]);

  const showingSuggested =
    isSuggested ||
    (watch.length === DEFAULT_WATCHLIST.length &&
      DEFAULT_WATCHLIST.every((s) => watch.includes(s)));

  // watchlist_viewed — recurring usage event (once per page-session), feeds
  // DAU/WAU and 7-day usage counts on /admin/metrics.
  useEffect(() => {
    logUsageEvent("watchlist_viewed");
  }, []);

  const hasPricedSymbol = watch.some((sym) => !isNewsOnlySymbol(sym));
  const { data, refetch, dataUpdatedAt, isError: pricesError } = useQuery({
    queryKey: ["prices"],
    queryFn: () => fetchJsonWithTimeout<{ prices: Price[] }>("/api/prices"),
    enabled: hydrated && hasPricedSymbol,
    refetchInterval: 15_000,
  });

  const lastFetchAt = dataUpdatedAt || null;

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, Price>();
    for (const p of data?.prices ?? []) map.set(p.symbol, p);
    return map;
  }, [data?.prices]);

  const [sort, setSort] = useState<WatchlistSort>(() => {
    if (typeof window === "undefined") return "added";
    try {
      const stored = window.localStorage.getItem(WATCHLIST_SORT_STORAGE_KEY);
      return stored === "name" || stored === "change" ? stored : "added";
    } catch {
      return "added";
    }
  });
  const setSortPersisted = (next: WatchlistSort) => {
    setSort(next);
    try {
      window.localStorage.setItem(WATCHLIST_SORT_STORAGE_KEY, next);
    } catch {
      // Quota / private mode — sort still works for this session.
    }
  };

  const getWatchlistLabel = (sym: string) =>
    WATCHLIST_ASSETS.find((c) => c.symbol === sym)?.label || sym;
  const getWatchlistChangePct = (sym: string): number | null => {
    const p = priceBySymbol.get(sym);
    if (!p) return null;
    return p.change_pct_24h ?? p.changePct24h ?? null;
  };
  const sortedWatch = useMemo(
    () => sortWatchlistSymbols(watch, sort, getWatchlistLabel, getWatchlistChangePct),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watch, sort, priceBySymbol],
  );

  const available = WATCHLIST_ASSETS.filter((c) => !watch.includes(c.symbol));

  const handleRemove = (sym: string) => {
    touchedRef.current = true;
    setIsSuggested(false);
    setWatch((w) => w.filter((x) => x !== sym));
  };

  // Shared by the header "+ Add Asset" button and the desktop FAB — both
  // open the one add mechanism, now a dialog (the old select's
  // scrollIntoView+focus had no real target once the picker stopped being a
  // plain <select>, so it's replaced rather than kept pointing at nothing).
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelected, setAddSelected] = useState<string[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const openAddCommodityPicker = () => {
    setAddSearch("");
    setAddSelected([]);
    setAddError(null);
    setAddDialogOpen(true);
  };

  const addSearchLower = addSearch.trim().toLowerCase();
  const shownAvailable = addSearchLower
    ? available.filter((c) => c.label.toLowerCase().includes(addSearchLower))
    : available;

  const toggleAddSelected = (symbol: string) => {
    setAddSelected((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol],
    );
  };

  const allShownSelected =
    shownAvailable.length > 0 && shownAvailable.every((c) => addSelected.includes(c.symbol));
  const toggleSelectAllShown = (checked: boolean) => {
    const shownSymbols: string[] = shownAvailable.map((c) => c.symbol);
    setAddSelected((prev) =>
      checked
        ? [...prev, ...shownSymbols.filter((s) => !prev.includes(s))]
        : prev.filter((s) => !shownSymbols.includes(s)),
    );
  };

  // Same add logic the old select's onChange used (its single-symbol
  // branch), once per symbol, in the order checked — same de-duplication
  // (functional setWatch, skips symbols already in watch).
  const handleAddSelected = () => {
    if (addSelected.length === 0) return;
    setAddError(null);
    try {
      touchedRef.current = true;
      setIsSuggested(false);
      for (const sym of addSelected) {
        setWatch((p) => (p.includes(sym) ? p : [...p, sym]));
      }
      setAddDialogOpen(false);
      setAddSelected([]);
      setAddSearch("");
    } catch {
      setAddError("Could not add the selected assets. Try again.");
    }
  };

  return (
    <PageShell width="wide">
        <Breadcrumbs
          items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Watchlist" }]}
          className="mb-4"
        />
        {/* Header + ADD COMMODITY (#145 / #186 mobile-overlap fix): one
            first-time Driver.js hint anchored to the header area. */}
        <div id="bbr-hint-watchlist-chips" data-hint="watchlist_chips">
        {/* Page Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1 h-6 bg-primary"></div>
              <p className="font-label text-xs text-primary tracking-[0.3em] uppercase">
                Asset Monitoring
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface">
                Commodity Watchlist
              </h1>
              <button
                type="button"
                onClick={openAddCommodityPicker}
                aria-label="Add asset to watchlist"
                className="inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-sm bg-primary text-[#003824] font-label text-[12px] md:text-[11px] font-bold tracking-widest uppercase cursor-pointer transition-transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(111,251,190,0.3)]"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                Add Asset
              </button>
            </div>
            {formatDataAsOf(lastFetchAt) ? (
              <p
                data-testid="data-as-of"
                className="mt-2 text-[12px] text-on-surface-variant font-mono"
                suppressHydrationWarning
              >
                {formatDataAsOf(lastFetchAt)}
              </p>
            ) : null}
            {showingSuggested && (
              <p
                data-testid="watchlist-suggested-banner"
                className="mt-3 text-sm text-on-surface-variant max-w-xl"
              >
                Suggested for you — remove anything you don&apos;t need.
              </p>
            )}
          </div>
        </div>

        </div>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="max-w-md translate-y-0 gap-0 rounded-lg border border-[var(--border)] bg-[#0e0e0e] p-0 text-[#e5e2e1] ring-0 sm:max-w-md">
            <div className="p-4 border-b border-[var(--border)]">
              <DialogTitle className="text-sm font-bold text-[#e5e2e1]">Add assets</DialogTitle>
              <DialogDescription className="text-[12px] md:text-[11px] text-on-surface-variant">
                {available.length} remaining to add.
              </DialogDescription>
              <input
                type="search"
                autoFocus
                placeholder="Search commodities, forex, news-only…"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                aria-label="Search assets to add"
                data-testid="watchlist-add-search"
                className={`mt-3 w-full font-sans normal-case tracking-normal ${SELECT_CLASSES}`}
              />
            </div>

            {shownAvailable.length > 0 && (
              <div className="px-4 py-2 border-b border-[var(--border)]">
                <Checkbox
                  label="Select all shown"
                  data-testid="watchlist-add-select-all"
                  checked={allShownSelected}
                  onChange={toggleSelectAllShown}
                />
              </div>
            )}

            <div className="max-h-[320px] overflow-y-auto px-4 py-2 flex flex-col gap-1">
              {shownAvailable.length === 0 ? (
                <p className="py-6 text-center text-[12px] md:text-[11px] text-on-surface-variant">
                  No matching assets.
                </p>
              ) : (
                shownAvailable.map((c) => (
                  <Checkbox
                    key={c.symbol}
                    label={isNewsOnlySymbol(c.symbol) ? newsOnlyMarketLabel(c.label) : c.label}
                    data-testid="watchlist-add-option"
                    checked={addSelected.includes(c.symbol)}
                    onChange={() => toggleAddSelected(c.symbol)}
                  />
                ))
              )}
            </div>

            {addError && (
              <p className="px-4 pb-2 text-[12px] md:text-[11px] text-[#ee7d77]">{addError}</p>
            )}

            <div className="p-4 border-t border-[var(--border)]">
              <button
                type="button"
                data-testid="watchlist-add-submit"
                disabled={addSelected.length === 0}
                onClick={handleAddSelected}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-sm bg-primary text-[#003824] font-label text-[12px] md:text-[11px] font-bold tracking-widest uppercase cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-transform hover:scale-105 active:scale-95"
              >
                Add selected ({addSelected.length})
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {hydrated && watch.length > 0 && (
          <Toolbar>
            <SortSelect
              label="Sort"
              ariaLabel="Sort watchlist"
              value={sort}
              options={WATCHLIST_SORT_OPTIONS}
              onChange={(v) => setSortPersisted(v as WatchlistSort)}
            />
          </Toolbar>
        )}

        {/* Commodity Cards Grid */}
        {!hydrated ? (
          <div
            className="grid grid-cols-1 xl:grid-cols-3 gap-6"
            data-testid="watchlist-grid-skeleton"
          >
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="rounded-xl h-[280px]" />
            ))}
          </div>
        ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {sortedWatch.map((sym) => {
            const meta = WATCHLIST_ASSETS.find((c) => c.symbol === sym);
            const label = meta?.label || sym;
            if (isNewsOnlySymbol(sym)) {
              return (
                <NewsOnlyWatchlistCard
                  key={sym}
                  symbol={sym}
                  label={label}
                  category={meta?.category ?? "MARKET"}
                  onRemove={() => handleRemove(sym)}
                />
              );
            }
            const p = priceBySymbol.get(sym);
            const pct = p ? (p.change_pct_24h ?? p.changePct24h ?? 0) : 0;
            const isUp = pct >= 0;

            return (
              // No interactive wrapper: a full-bleed <Link> is the navigation
              // target and the remove <button> is a CSS-positioned sibling, not a
              // child — so no interactive element is nested in another (axe
              // `nested-interactive`). stopPropagation is deliberately not used.
              <div
                key={sym}
                className="relative bg-surface-container/40 border border-outline-variant/30 rounded-xl overflow-hidden group hover:border-primary/50 transition-colors"
              >
                <Link
                  href={`/watchlist/${encodeURIComponent(sym)}`}
                  aria-label={`Open ${label} drill-down`}
                  className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"
                />
                <button
                  type="button"
                  onClick={() => handleRemove(sym)}
                  aria-label={`Remove ${label} from watchlist`}
                  className="absolute right-4 top-4 z-20 text-on-surface-variant hover:text-error transition-colors p-[13px] md:p-1"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
                {/* Top section (darker). pointer-events-none lets clicks fall
                    through to the full-card <Link> underneath. */}
                <div className="p-6 bg-black/40 relative z-10 pointer-events-none">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="bg-surface-container-high px-2 py-0.5 rounded-sm font-label text-[12px] md:text-[9px] text-on-surface-variant tracking-widest mb-2 inline-block uppercase">
                        {meta?.category ?? "MARKET"}
                      </span>
                      <h2 className="text-xl font-headline font-bold text-on-surface">
                        {label}
                      </h2>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-3xl font-bold text-on-surface tracking-tighter">
                      {p
                        ? Number(p.price).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </span>
                    <span
                      className={`font-mono text-sm flex items-center font-bold ${isUp ? "text-primary" : "text-error"}`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isUp ? "arrow_drop_up" : "arrow_drop_down"}
                      </span>
                      {Math.abs(pct).toFixed(2)}%
                    </span>
                  </div>
                </div>
                {/* Bottom section (Sparkline) */}
                <div className="p-6 bg-surface-container/20 relative z-10 pointer-events-none min-h-[140px] flex flex-col justify-end">
                  <PriceSparkline symbol={sym} isUp={isUp} />
                </div>
              </div>
            );
          })}
        </div>
        )}

        {/* Dashboard Analytics Section */}
        <div className="grid grid-cols-12 gap-6 mt-12 mb-12">
          {/* Secondary Data Insights */}
          <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex-1 bg-surface-container rounded-xl p-6 border border-outline-variant/10 shadow-xl group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded bg-surface-variant/50 flex items-center justify-center border border-outline-variant/20">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">
                    insights
                  </span>
                </div>
                <h3 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase">
                  Market Signal Forecast
                </h3>
              </div>
              <p className="text-sm font-body leading-relaxed text-on-surface/80 mb-6 italic border-l-2 border-outline-variant/20 pl-4 font-medium">
                Predictions have been removed from this view. To avoid
                displaying unauthenticated or fabricated model outputs, this
                feature will be restored once a validated prediction pipeline is
                available.
              </p>
            </div>

            <div className="flex-1 bg-surface-container rounded-xl p-6 border border-outline-variant/10 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded bg-surface-variant/50 flex items-center justify-center border border-outline-variant/20">
                  <span
                    className="material-symbols-outlined text-on-surface-variant text-lg"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    update
                  </span>
                </div>
                <h3 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase">
                  Watchlist Sync
                </h3>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  {pricesError ? <SlowDataNotice onRetry={() => void refetch()} /> : null}
                  <p className="font-mono text-3xl text-on-surface font-bold tracking-tighter">
                    {lastFetchAt
                      ? `${Math.floor((Date.now() - lastFetchAt) / 1000)}s`
                      : "--"}
                  </p>
                  <p className="font-label text-[12px] md:text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">
                    Time since last update
                  </p>
                </div>
                <button
                  onClick={() => refetch()}
                  className="text-primary hover:text-primary-container font-label text-[12px] md:text-[10px] uppercase tracking-widest font-bold transition-colors cursor-pointer inline-flex items-center min-h-[44px] md:min-h-0"
                >
                  Force Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Desktop-only floating action — the mobile FAB was removed (#186):
          it sat position:fixed over scrolling card content. The header
          "+ Add Asset" button now covers this action on mobile. */}
      <button
        onClick={openAddCommodityPicker}
        aria-label="Add asset to watchlist"
        className="hidden md:flex fixed md:bottom-10 md:right-10 w-14 h-14 bg-primary text-black rounded-full shadow-[0_0_30px_rgba(111,251,190,0.4)] items-center justify-center group z-50 transition-all hover:scale-110 active:scale-95 shadow-lg cursor-pointer"
      >
        <span className="material-symbols-outlined text-3xl group-hover:rotate-90 transition-transform duration-500">
          add
        </span>
        <div className="absolute right-full mr-4 px-4 py-2 bg-surface-container border border-outline-variant/30 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap backdrop-blur-md">
          <span className="label text-[12px] md:text-[10px] tracking-[0.2em] text-on-surface font-black uppercase">
            Initialize New Monitor
          </span>
        </div>
      </button>
    </PageShell>
  );
}
