"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/useUIStore";
import { getSupabaseBrowserClient } from "@/lib/supabase";

/** After this many signal-detail mounts in the session, offer Telegram connect. */
export const NOTIFICATION_PROMPT_AFTER_SIGNALS = 3;

type TelegramStatus = {
  telegramConnected: boolean;
};

export function NotificationConnectPrompt() {
  const signalsViewedThisSession = useUIStore((s) => s.signalsViewedThisSession);
  const setNotificationConnectOpen = useUIStore((s) => s.setNotificationConnectOpen);

  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [sessionHidden, setSessionHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadEligibility() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setDismissed(true);
          setConnected(true);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setDismissed(true);
          setConnected(true);
        }
        return;
      }

      const [{ data: profile }, statusRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("notification_prompt_dismissed_at")
          .eq("id", user.id)
          .maybeSingle(),
        fetch("/api/telegram/status"),
      ]);

      let telegramConnected = false;
      if (statusRes.ok) {
        const status = (await statusRes.json()) as TelegramStatus;
        telegramConnected = Boolean(status.telegramConnected);
      }

      if (!cancelled) {
        setDismissed(Boolean(profile?.notification_prompt_dismissed_at));
        setConnected(telegramConnected);
      }
    }
    loadEligibility();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible =
    signalsViewedThisSession >= NOTIFICATION_PROMPT_AFTER_SIGNALS &&
    dismissed === false &&
    connected === false &&
    !sessionHidden;

  async function dismissForGood() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ notification_prompt_dismissed_at: new Date().toISOString() })
          .eq("id", user.id);
      }
    }
    setDismissed(true);
    setSessionHidden(true);
  }

  if (!visible) return null;

  return (
    <div
      data-testid="notification-connect-prompt"
      className="fixed bottom-4 right-4 z-40 w-[min(100%-2rem,360px)] bg-[#131313] border border-[#3c4a42] rounded-lg shadow-2xl p-4 text-[#e5e2e1]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <p
        className="font-bold text-sm mb-1"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Get alerted the moment this happens again
      </p>
      <p className="text-xs text-[#86948a] mb-4">
        Connect Telegram to receive this kind of signal as it happens. Settings
        stays the place to manage or disconnect later.
      </p>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={dismissForGood}
          className="text-xs font-bold uppercase tracking-wider text-[#86948a] hover:text-[#e5e2e1] transition-colors"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => {
            setSessionHidden(true);
            setNotificationConnectOpen(true);
          }}
          className="px-4 py-2 bg-[#4edea3] text-[#003824] font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-[#6ffbbe] transition-colors"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Connect Telegram
        </button>
      </div>
    </div>
  );
}
