"use client";

import { useState, useTransition } from "react";

import { loadServiceEvents, type ServiceHealthEvent } from "./actions";

// Grouped tab structure — pre-scoped in claude/32_SERVICE_HEALTH_DASHBOARD_SPEC.md.
// `service` is the exact value written into service_health_events by the backend.
// Data Sources + Yahoo Finance are wired in Phase 1; AI / Infra / Alerts sub-tabs
// render but will show "no events recorded yet" until their call sites are wired
// in a later phase.
type Leaf = { label: string; service: string };
type Group = { label: string; leaves: Leaf[] };

// Must stay in sync with RSS_FEEDS in apps/backend/src/workers/rss-collector.ts.
const RSS_FEEDS = [
  "BBC World",
  "Al Jazeera",
  "NPR World",
  "France24",
  "DW World",
  "Guardian World",
  "BBC Business",
  "Guardian Business",
  "NYT Business",
  "MarketWatch",
  "WSJ Markets",
  "Investing.com",
  "OilPrice",
];

const GROUPS: Group[] = [
  {
    label: "Data Sources",
    leaves: [
      { label: "GNews", service: "gnews" },
      { label: "GDELT", service: "gdelt" },
      { label: "ACLED", service: "acled" },
      { label: "RSS", service: "__rss__" }, // special-cased: feed dropdown
      { label: "Yahoo Finance", service: "yahoo_finance" },
    ],
  },
  { label: "AI", leaves: [{ label: "Anthropic", service: "anthropic" }] },
  {
    label: "Infra",
    leaves: [
      { label: "Supabase", service: "supabase" },
      { label: "Upstash", service: "upstash" },
      { label: "Railway", service: "railway" },
      { label: "Vercel", service: "vercel" },
    ],
  },
  {
    label: "Alerts",
    leaves: [
      { label: "Telegram", service: "telegram" },
      { label: "Resend", service: "resend" },
    ],
  },
];

function statusColor(status: string): string {
  if (status === "ok") return "text-[#7fd1a6]";
  if (status === "rate_limited") return "text-[#e0c07a]";
  return "text-[#e0a0a0]";
}

export default function ServiceStatusClient() {
  const [groupIdx, setGroupIdx] = useState(0);
  const [leafIdx, setLeafIdx] = useState(0);
  const [rssFeed, setRssFeed] = useState(RSS_FEEDS[0]);
  const [events, setEvents] = useState<ServiceHealthEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedLabel, setLoadedLabel] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const group = GROUPS[groupIdx];
  const leaf = group.leaves[leafIdx];
  const isRss = leaf.service === "__rss__";
  const effectiveService = isRss ? `rss:${rssFeed}` : leaf.service;
  const effectiveLabel = isRss ? `RSS · ${rssFeed}` : `${group.label} · ${leaf.label}`;

  function resetView() {
    setEvents(null);
    setError(null);
    setLoadedLabel(null);
  }

  function onLoad() {
    setError(null);
    startTransition(async () => {
      const result = await loadServiceEvents(effectiveService);
      if (result.ok) {
        setEvents(result.events);
        setLoadedLabel(effectiveLabel);
      } else {
        setEvents(null);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Top-level group tabs */}
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => {
              setGroupIdx(i);
              setLeafIdx(0);
              resetView();
            }}
            className={`rounded-md px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.15em] ${
              i === groupIdx
                ? "bg-[#1c2620] text-[#e5e2e1] ring-1 ring-[#3c4a42]"
                : "text-[#8a9a92] hover:text-[#e5e2e1]"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Service sub-tabs */}
      <div className="flex flex-wrap gap-2 border-t border-[#222] pt-4">
        {group.leaves.map((l, i) => (
          <button
            key={l.label}
            onClick={() => {
              setLeafIdx(i);
              resetView();
            }}
            className={`rounded-md px-3 py-1.5 text-[11px] font-mono ${
              i === leafIdx
                ? "bg-[#131313] text-[#e5e2e1] ring-1 ring-[#3c4a42]/60"
                : "text-[#6b7a72] hover:text-[#e5e2e1]"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-[#222] bg-[#0e0e0e] p-4">
        <div className="flex flex-wrap items-center gap-3">
          {isRss && (
            <select
              value={rssFeed}
              onChange={(e) => {
                setRssFeed(e.target.value);
                resetView();
              }}
              className="rounded-md border border-[#333] bg-[#131313] px-2 py-1.5 font-mono text-[12px] text-[#e5e2e1]"
            >
              {RSS_FEEDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={onLoad}
            disabled={pending}
            className="rounded-md bg-[#1c2620] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-[#e5e2e1] ring-1 ring-[#3c4a42] hover:bg-[#24312a] disabled:opacity-50"
          >
            {pending ? "Loading…" : "Load data"}
          </button>
          <span className="font-mono text-[11px] text-[#6b7a72]">
            {effectiveLabel} · <code className="text-[#8a9a92]">{effectiveService}</code>
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-[#7a3c3c] bg-[#1a1010] px-3 py-2 font-mono text-[12px] text-[#e0a0a0]">
            {error}
          </div>
        )}

        {events && loadedLabel === effectiveLabel && (
          <div className="overflow-x-auto">
            {events.length === 0 ? (
              <p className="font-mono text-[12px] text-[#6b7a72]">
                No events recorded yet for this service.
              </p>
            ) : (
              <table className="w-full min-w-[560px] font-mono text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-[#6b7a72]">
                    <th className="px-3 py-2 font-medium">Timestamp (UTC)</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Latency</th>
                    <th className="px-3 py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev, i) => (
                    <tr key={i} className={i % 2 ? "bg-[#101010]" : "bg-[#0e0e0e]"}>
                      <td className="whitespace-nowrap px-3 py-2 text-[#c9c6c5]">
                        {new Date(ev.created_at).toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td className={`px-3 py-2 ${statusColor(ev.status)}`}>{ev.status}</td>
                      <td className="px-3 py-2 text-[#8a9a92]">
                        {ev.latency_ms == null ? "—" : `${ev.latency_ms} ms`}
                      </td>
                      <td className="px-3 py-2 text-[#8a9a92]">{ev.detail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {!events && !error && (
          <p className="font-mono text-[11px] text-[#6b7a72]">
            Nothing loads automatically. Click “Load data” to fetch the most recent 50 events.
          </p>
        )}
      </div>
    </div>
  );
}
