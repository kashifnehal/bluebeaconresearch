"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { COMMODITIES } from "@blue-beacon-research/shared";
import type { Signal } from "@blue-beacon-research/shared";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type AlertRuleLite = {
  id: string;
  name: string;
  regions: string[];
  commodities: string[];
};

type ResultGroup = "Pages" | "Signals" | "Watchlist" | "Alert Rules";

type ResultItem = {
  key: string;
  group: ResultGroup;
  label: string;
  sublabel?: string;
  icon: string;
  href: string;
};

const GROUP_ORDER: ResultGroup[] = ["Pages", "Signals", "Watchlist", "Alert Rules"];

const STATIC_PAGES: { label: string; href: string; icon: string }[] = [
  { label: "Intelligence Feed", href: "/dashboard", icon: "dashboard" },
  { label: "Map", href: "/map", icon: "public" },
  { label: "Watchlist", href: "/watchlist", icon: "visibility" },
  { label: "Alerts", href: "/alerts", icon: "notifications" },
  { label: "Backtesting Lab", href: "/backtesting", icon: "science" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Cmd+K / Ctrl+K toggle — mounted once, independent of the TopBar's own
  // inline current-page filter input (kept as-is; this is a separate, global,
  // cross-entity search, not a replacement for it).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // Reset local UI state right here (inside the event handler, not a
        // useEffect keyed on `open`) — only actually resets on the transition
        // into "open" since `next` is false on the toggle-closed branch.
        setOpen((prev) => {
          const next = !prev;
          if (next) {
            setQuery("");
            setDebouncedQuery("");
            setActiveIndex(0);
          }
          return next;
        });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  // Only the network-backed signals search needs debouncing — the other three
  // sources are filtered client-side against data already in memory/cache.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length >= 2;
  const hasDebouncedQuery = debouncedQuery.length >= 2;

  const { data: signalsData, isFetching: signalsFetching } = useQuery({
    queryKey: ["command-palette-signals", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/signals?search=${encodeURIComponent(debouncedQuery)}&limit=5&sort=severity`,
      );
      if (!res.ok) throw new Error("Failed to search signals");
      return (await res.json()) as { signals: Signal[] };
    },
    enabled: open && hasDebouncedQuery,
    staleTime: 15_000,
  });

  // Same queryKey the Alerts page uses for GET /api/alert-rules — deliberately
  // shares its react-query cache entry instead of refetching separately.
  const { data: rulesData } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: async () => {
      const res = await fetch("/api/alert-rules");
      if (!res.ok) throw new Error("Failed to load alert rules");
      return (await res.json()) as { rules: AlertRuleLite[] };
    },
    enabled: open,
    staleTime: 30_000,
  });

  const results = useMemo<ResultItem[]>(() => {
    const items: ResultItem[] = [];
    const q = trimmedQuery.toLowerCase();

    for (const p of STATIC_PAGES) {
      if (!q || p.label.toLowerCase().includes(q)) {
        items.push({ key: `page-${p.href}`, group: "Pages", label: p.label, icon: p.icon, href: p.href });
      }
    }

    if (hasQuery) {
      for (const s of signalsData?.signals ?? []) {
        items.push({
          key: `signal-${s.id}`,
          group: "Signals",
          label: s.title,
          sublabel: `Severity ${s.severity} · ${s.country || s.region}`,
          icon: "bolt",
          href: `/events/${s.id}`,
        });
      }

      for (const c of COMMODITIES) {
        if (c.symbol.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)) {
          items.push({
            key: `commodity-${c.symbol}`,
            group: "Watchlist",
            label: c.label,
            sublabel: c.symbol,
            icon: "trending_up",
            href: `/watchlist/${encodeURIComponent(c.symbol)}`,
          });
        }
      }

      for (const r of rulesData?.rules ?? []) {
        const haystack = [r.name, ...(r.regions ?? []), ...(r.commodities ?? [])].join(" ").toLowerCase();
        if (haystack.includes(q)) {
          items.push({
            key: `rule-${r.id}`,
            group: "Alert Rules",
            label: r.name,
            sublabel: r.regions?.length ? r.regions.join(", ") : "All regions",
            icon: "notifications_active",
            href: "/alerts",
          });
        }
      }
    }

    return items;
  }, [trimmedQuery, hasQuery, signalsData, rulesData]);

  // Derived, not stored: clamps a stale index (from a previous result set) down
  // to range instead of resetting state from an effect keyed on results.length.
  const clampedActiveIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

  const groupedResults = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({ group, items: results.filter((r) => r.group === group) })).filter(
        (g) => g.items.length > 0,
      ),
    [results],
  );

  function select(item: ResultItem) {
    setOpen(false);
    router.push(item.href);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[clampedActiveIndex];
      if (item) select(item);
    }
  }

  // Explicit no-match state: only once the debounced signals search has settled,
  // so a mid-typing/mid-fetch moment never flashes "no results" before it's true.
  const showEmptyState =
    hasQuery && !signalsFetching && (!hasDebouncedQuery || debouncedQuery === trimmedQuery) && results.length === 0;

  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] max-w-xl translate-y-0 gap-0 rounded-lg border border-[#3c4a42] bg-[#0e0e0e] p-0 text-[#e5e2e1] ring-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search signals, watchlist commodities, alert rules, and pages
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-[#2a2a2a] px-4 py-3">
          <span className="material-symbols-outlined text-[#4edea3]" style={{ fontSize: "18px" }}>
            search
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search signals, watchlist, alert rules, pages..."
            className="flex-1 bg-transparent text-sm text-[#e5e2e1] outline-none placeholder:text-[#86948a]"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          />
          <span className="rounded-sm border border-[#3c4a42] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#86948a]">
            Esc
          </span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {showEmptyState ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="material-symbols-outlined text-3xl text-[#3c4a42]">search_off</span>
              <p className="text-xs font-medium text-[#86948a]">
                No results for &ldquo;{trimmedQuery}&rdquo;
              </p>
            </div>
          ) : (
            groupedResults.map(({ group, items }) => (
              <div key={group} className="mb-2 last:mb-0">
                <div
                  className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-[#86948a]"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {group}
                </div>
                {items.map((item) => {
                  flatIndex += 1;
                  const isActive = flatIndex === clampedActiveIndex;
                  return (
                    <button
                      key={item.key}
                      onClick={() => select(item)}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      className={`flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left transition-colors cursor-pointer ${
                        isActive ? "bg-[#1f2b25]" : "hover:bg-[#1a1a1a]"
                      }`}
                    >
                      <span
                        className="material-symbols-outlined shrink-0 text-[#4edea3]"
                        style={{ fontSize: "16px" }}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[#e5e2e1]">{item.label}</span>
                        {item.sublabel && (
                          <span className="block truncate text-[10px] text-[#86948a]">{item.sublabel}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}

          {hasQuery && signalsFetching && (
            <div className="px-2 py-2 text-[10px] uppercase tracking-widest text-[#86948a]">Searching signals...</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-4 border-t border-[#2a2a2a] px-4 py-2 text-[9px] uppercase tracking-widest text-[#86948a]">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
