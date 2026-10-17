"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useUIStore } from "@/store/useUIStore";
import { safeFormatDistanceToNow } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";

type AlertItem = {
  id: string;
  signal_id: string;
  created_at: string;
  is_read?: boolean;
  status?: "queued" | "delivered" | "failed";
  signals?: {
    id: string;
    title: string;
    severity: number;
  };
};

const EMPTY_ALERTS: AlertItem[] = [];

/**
 * Unread count, driving both this panel and the sidebar badge (same
 * `unreadCount` store field — see components/layout/Sidebar.tsx). Always
 * computed, even when `alerts` is empty: `unreadCount` is persisted across
 * sessions (zustand persist in store/useUIStore.ts), so an empty/stale
 * fetch must still overwrite a leftover non-zero badge from a prior
 * session rather than leaving it stuck.
 */
export function computeUnreadAlertCount(
  alerts: Pick<AlertItem, "id" | "is_read">[],
  readItems: Record<string, boolean>,
): number {
  return alerts.filter((a) => !a.is_read && !readItems[a.id]).length;
}

export function NotificationPanel() {
  const { notifOpen, setNotifOpen, resetUnread, setUnreadCount } = useUIStore();
  const [readItems, setReadItems] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["alerts", "recent"],
    queryFn: async () => {
      const res = await fetch("/api/alerts/recent");
      // Throw on a real failure (5xx / network) rather than silently returning the
      // same shape as "no alerts yet" — those are different states for the user.
      if (!res.ok) throw new Error(`Failed to load alerts (${res.status})`);
      return (await res.json()) as { alerts: AlertItem[] };
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  // Stable reference while there is no data. A fresh `[]` on every render made
  // the effect below fire on every render, and since setUnreadCount updates the
  // store this component subscribes to, that was an endless render loop
  // (React error #185) for any user with an empty or failed alerts fetch.
  const alerts = useMemo(() => data?.alerts ?? EMPTY_ALERTS, [data]);

  useEffect(() => {
    // Wait for a real answer: a loading or failed fetch must not touch the badge.
    // An answered-but-empty fetch (data.alerts = []) still zeroes a stale count.
    if (!data) return;
    setUnreadCount(computeUnreadAlertCount(alerts, readItems));
  }, [data, alerts, readItems, setUnreadCount]);

  useEffect(() => {
    if (notifOpen) {
      resetUnread();
    }
  }, [notifOpen, resetUnread]);

  if (!notifOpen) return null;

  const markAllRead = () => {
    const allRead: Record<string, boolean> = {};
    alerts.forEach((a) => {
      allRead[a.id] = true;
    });
    setReadItems(allRead);
    resetUnread();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => setNotifOpen(false)}
      />

      {/* Drawer */}
      <aside
        className="relative w-[360px] h-full bg-[#0e0e0e] border-l border-[var(--border)] flex flex-col z-50 text-white shadow-2xl animate-in slide-in-from-right duration-200"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between bg-[var(--bg-primary)]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--accent)]" style={{ fontSize: "20px" }}>
              notifications
            </span>
            <span className="font-bold text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#e5e2e1" }}>
              Recent Alerts
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={markAllRead}
              className="text-[12px] md:text-[10px] uppercase font-bold tracking-wider px-2 py-1 border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors rounded-sm"
              style={{ color: "#acabaa" }}
            >
              Mark all read
            </button>
            <button
              onClick={() => setNotifOpen(false)}
              className="p-1 hover:text-[var(--accent)] text-[var(--text-muted)] transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                close
              </span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#2a2a2a]">
          {isLoading ? (
            <div className="p-8 text-center flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-[var(--accent)]/20 border-t-[var(--accent)] rounded-full animate-spin" />
              <span className="text-xs text-[var(--text-muted)] font-mono uppercase">Loading notifications...</span>
            </div>
          ) : isError ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-4 text-[var(--text-muted)]">
              <span className="material-symbols-outlined text-4xl text-[#ee7d77]">error_outline</span>
              <p className="text-xs font-medium text-[#acabaa]">
                Couldn't load alerts right now — this is a fetch error, not "no alerts yet."
              </p>
            </div>
          ) : alerts.length > 0 ? (
            alerts.map((item) => {
              const isRead = item.is_read || readItems[item.id];
              const title = item.signals?.title || "Alert notification received";
              const severity = item.signals?.severity ?? 5;
              const signalId = item.signals?.id || item.signal_id || item.id;
              const isHigh = severity >= 8;
              // Missing/undefined status defensively renders as "delivered" (undelivered
              // rows have never existed pre-fix, so there's no legacy data to misrender).
              const status = item.status ?? "delivered";
              const notDelivered = status === "queued" || status === "failed";

              return (
                <a
                  key={item.id}
                  href={`/events/${signalId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setNotifOpen(false);
                  }}
                  className={`p-4 cursor-pointer transition-colors hover:bg-[#1f1f1f] flex gap-3 items-start ${
                    !isRead ? "bg-[#18231d]" : "bg-transparent"
                  } ${notDelivered ? "opacity-70" : ""}`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                    style={{
                      backgroundColor:
                        status === "failed" ? "#ee7d77" : status === "queued" ? "#e0a84e" : isHigh ? "#ee7d77" : "var(--accent)",
                    }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[12px] md:text-[10px] font-mono uppercase text-[var(--text-muted)]">
                        {safeFormatDistanceToNow(item.created_at)} ago
                      </span>
                      {status === "failed" ? (
                        <span
                          className="text-[12px] md:text-[10px] font-bold uppercase tracking-wider text-[#ee7d77]"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          Delivery Failed
                        </span>
                      ) : status === "queued" ? (
                        <span
                          className="text-[12px] md:text-[10px] font-bold uppercase tracking-wider text-[#e0a84e]"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          Not Delivered
                        </span>
                      ) : (
                        <span
                          className="text-[12px] md:text-[10px] font-bold uppercase tracking-wider flex items-center gap-0.5 text-[var(--accent)] hover:underline"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          View <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>arrow_forward</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-medium text-[#e5e2e1] line-clamp-2 leading-snug">
                      {title}
                    </p>

                    {notDelivered && (
                      <p className="text-[12px] md:text-[10px] text-[var(--text-muted)] mt-1">
                        {status === "failed"
                          ? "This alert fired but delivery failed."
                          : "This alert fired but no delivery channel is connected."}
                      </p>
                    )}
                  </div>
                </a>
              );
            })
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-4 text-[var(--text-muted)]">
              <span className="material-symbols-outlined text-4xl text-[var(--border)]">
                notifications_off
              </span>
              <p className="text-xs font-medium text-[#acabaa]">
                No alerts yet. Set up alert rules to get notified.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2a2a2a] bg-[var(--bg-primary)] text-center">
          <Link
            href="/alerts"
            onClick={() => setNotifOpen(false)}
            className="text-xs font-bold text-[var(--accent)] hover:underline uppercase tracking-wider flex items-center justify-center gap-1"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Manage alert rules <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>arrow_forward</span>
          </Link>
        </div>
      </aside>
    </div>
  );
}
