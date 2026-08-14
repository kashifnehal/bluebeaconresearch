"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useUIStore } from "@/store/useUIStore";
import { safeFormatDistanceToNow } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";

type AlertItem = {
  id: string;
  signal_id: string;
  created_at: string;
  is_read?: boolean;
  signals?: {
    id: string;
    title: string;
    severity: number;
  };
};

export function NotificationPanel() {
  const router = useRouter();
  const { notifOpen, setNotifOpen, resetUnread, setUnreadCount } = useUIStore();
  const [readItems, setReadItems] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["alerts", "recent"],
    queryFn: async () => {
      const res = await fetch("/api/alerts/recent");
      if (!res.ok) return { alerts: [] };
      return (await res.json()) as { alerts: AlertItem[] };
    },
    refetchInterval: 30_000,
  });

  const alerts = data?.alerts ?? [];

  useEffect(() => {
    if (alerts.length > 0) {
      const unread = alerts.filter((a) => !a.is_read && !readItems[a.id]).length;
      setUnreadCount(unread);
    }
  }, [alerts, readItems, setUnreadCount]);

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
        className="relative w-[360px] h-full bg-[#0e0e0e] border-l border-[#3c4a42] flex flex-col z-50 text-white shadow-2xl animate-in slide-in-from-right duration-200"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between bg-[#131313]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4edea3]" style={{ fontSize: "20px" }}>
              notifications
            </span>
            <span className="font-bold text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#e5e2e1" }}>
              Recent Alerts
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={markAllRead}
              className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 border border-[#3c4a42] hover:border-[#4edea3] hover:text-[#4edea3] transition-colors rounded-sm"
              style={{ color: "#acabaa" }}
            >
              Mark all read
            </button>
            <button
              onClick={() => setNotifOpen(false)}
              className="p-1 hover:text-[#4edea3] text-[#86948a] transition-colors"
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
              <div className="w-6 h-6 border-2 border-[#4edea3]/20 border-t-[#4edea3] rounded-full animate-spin" />
              <span className="text-xs text-[#86948a] font-mono uppercase">Loading notifications...</span>
            </div>
          ) : alerts.length > 0 ? (
            alerts.map((item) => {
              const isRead = item.is_read || readItems[item.id];
              const title = item.signals?.title || "Alert notification received";
              const severity = item.signals?.severity ?? 5;
              const signalId = item.signals?.id || item.signal_id || item.id;
              const isHigh = severity >= 8;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setNotifOpen(false);
                    router.push(`/events/${signalId}`);
                  }}
                  className={`p-4 cursor-pointer transition-colors hover:bg-[#1f1f1f] flex gap-3 items-start ${
                    !isRead ? "bg-[#18231d]" : "bg-transparent"
                  }`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: isHigh ? "#ee7d77" : "#4edea3" }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-mono uppercase text-[#86948a]">
                        {safeFormatDistanceToNow(item.created_at)} ago
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-0.5 text-[#4edea3] hover:underline"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        View <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>arrow_forward</span>
                      </span>
                    </div>

                    <p className="text-xs font-medium text-[#e5e2e1] line-clamp-2 leading-snug">
                      {title}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-4 text-[#86948a]">
              <span className="material-symbols-outlined text-4xl text-[#3c4a42]">
                notifications_off
              </span>
              <p className="text-xs font-medium text-[#acabaa]">
                No alerts yet. Set up alert rules to get notified.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2a2a2a] bg-[#131313] text-center">
          <Link
            href="/alerts"
            onClick={() => setNotifOpen(false)}
            className="text-xs font-bold text-[#4edea3] hover:underline uppercase tracking-wider flex items-center justify-center gap-1"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Manage alert rules <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>arrow_forward</span>
          </Link>
        </div>
      </aside>
    </div>
  );
}
