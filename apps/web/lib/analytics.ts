import posthog from "posthog-js";
import { readConsent } from "@/lib/consent";

let initialized = false;

export function initAnalytics() {
  if (typeof window === "undefined") return;
  const analytics = readConsent()?.analytics === true;
  if (!analytics) {
    if (!initialized) return;
    try {
      posthog.opt_out_capturing();
      posthog.reset();
    } catch {
      // Analytics must not break the page.
    }
    initialized = false;
    return;
  }
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // no-op until a real key is configured, same pattern as Sentry
  try {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
      disable_session_recording: true,
      autocapture: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      disable_surveys: true,
      capture_performance: false,
    });
    initialized = true;
  } catch {
    // A missing or rejected analytics setup must not break the page.
  }
}

// Minimum funnel this wires: signup_started -> signup_completed -> signal_viewed ->
// alert_rule_created. Safe to call even if analytics was never initialized (no key).
export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}
