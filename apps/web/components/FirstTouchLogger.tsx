"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { logFunnelEventOnce } from "@/lib/funnel-events";
import { readFirstTouch, type FirstTouch } from "@/lib/first-touch";

let loggedThisPageLoad = false;

function asFirstTouch(value: unknown): FirstTouch | null {
  if (!value || typeof value !== "object") return null;
  const src = value as Record<string, unknown>;
  const out: FirstTouch = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer_host"] as const) {
    const raw = src[key];
    if (typeof raw === "string" && raw.length > 0) out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * One funnel row per signed-in user. Email signups carry the value on
 * user_metadata.first_touch (the confirmation link opens a new tab, so
 * sessionStorage from the signup tab is gone). Google signups stay in the
 * same tab, so the value is still in sessionStorage.
 */
export function FirstTouchLogger() {
  useEffect(() => {
    if (loggedThisPageLoad) return;
    loggedThisPageLoad = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        const fromAccount = asFirstTouch(data.user?.user_metadata?.first_touch);
        const touch = fromAccount ?? readFirstTouch();
        if (!touch) return;
        logFunnelEventOnce("first_touch_recorded", { ...touch });
      })
      .catch(() => {
        // Instrumentation must not surface on the dashboard.
      });
  }, []);
  return null;
}
