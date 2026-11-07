// initAnalytics must not start PostHog before consent, and must not start it with no key.
import assert from "node:assert/strict";

import { setupDom } from "@/lib/test-render";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";

const document = setupDom();
void document;

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function setConsent(analytics: boolean | null) {
  if (analytics === null) {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ v: 1, analytics, at: "2026-11-07T00:00:00.000Z" }),
  );
}

async function main() {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  setConsent(null);

  const posthog = (await import("posthog-js")).default;
  const calls = { init: 0, optOut: 0, reset: 0 };
  let initOptions:
    | {
        api_host?: string;
        person_profiles?: string;
        capture_pageview?: boolean;
        disable_session_recording?: boolean;
        autocapture?: boolean;
        capture_dead_clicks?: boolean;
        capture_heatmaps?: boolean;
        disable_surveys?: boolean;
        capture_performance?: boolean;
      }
    | undefined;
  posthog.init = ((...args: unknown[]) => {
    calls.init += 1;
    initOptions = args[1] as typeof initOptions;
  }) as typeof posthog.init;
  posthog.opt_out_capturing = (() => {
    calls.optOut += 1;
  }) as typeof posthog.opt_out_capturing;
  posthog.reset = (() => {
    calls.reset += 1;
  }) as typeof posthog.reset;

  const { initAnalytics } = await import("./analytics");

  await runTest("initAnalytics does nothing before consent", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph-test-key";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.example.test";
    setConsent(null);
    initAnalytics();
    assert.equal(calls.init, 0);
    assert.equal(calls.optOut, 0);
    assert.equal(calls.reset, 0);
  });

  await runTest("initAnalytics does nothing when the key is missing", () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    setConsent(true);
    initAnalytics();
    assert.equal(calls.init, 0);
    setConsent(null);
    initAnalytics();
    assert.equal(calls.init, 0);
  });

  await runTest("initAnalytics starts only after accept and uses the configured host", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph-test-key";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.example.test";
    setConsent(true);
    initAnalytics();
    assert.equal(calls.init, 1);
    assert.deepEqual(initOptions, {
      api_host: "https://eu.example.test",
      person_profiles: "identified_only",
      capture_pageview: true,
      disable_session_recording: true,
      autocapture: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      disable_surveys: true,
      capture_performance: false,
    });
    initAnalytics();
    assert.equal(calls.init, 1);
  });

  await runTest("a later decline opts out and resets", () => {
    setConsent(false);
    initAnalytics();
    assert.equal(calls.optOut, 1);
    assert.equal(calls.reset, 1);
    assert.equal(calls.init, 1);
  });
}

void main();
