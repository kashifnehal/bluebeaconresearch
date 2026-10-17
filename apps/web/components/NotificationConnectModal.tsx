"use client";

import { useUIStore } from "@/store/useUIStore";
import { TelegramConnect } from "@/components/TelegramConnect";

export function NotificationConnectModal() {
  const { notificationConnectOpen, setNotificationConnectOpen } = useUIStore();

  if (!notificationConnectOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity"
        onClick={() => setNotificationConnectOpen(false)}
      />

      <div
        className="relative w-full max-w-lg bg-[#0e0e0e] border border-[var(--border)] rounded-lg shadow-2xl z-50 flex flex-col max-h-[85vh] text-[#e5e2e1] animate-in zoom-in-95 duration-150"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div className="p-6 border-b border-[#2a2a2a] flex items-center justify-between bg-[var(--bg-primary)] rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)]">
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                forum
              </span>
            </div>
            <div>
              <h2 className="font-bold text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Get alerted when a similar event is reported again
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                Connect Telegram to receive signal alerts
              </p>
            </div>
          </div>

          <button
            onClick={() => setNotificationConnectOpen(false)}
            className="p-1 hover:text-[var(--accent)] text-[var(--text-muted)] transition-colors rounded-sm"
            aria-label="Close"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
              close
            </span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <TelegramConnect />
        </div>
      </div>
    </div>
  );
}
