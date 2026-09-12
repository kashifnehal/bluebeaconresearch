import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCOUNT_CONNECT_ERROR,
  ACCURACY_LOAD_ERROR,
  AUTH_SESSION_ERROR,
  COLLECTOR_HEALTH_UNAVAILABLE,
  FEED_DEGRADED_COPY,
  GENERIC_REQUEST_ERROR,
  METRICS_LOAD_ERROR,
  MISSING_SUPABASE_ENV_TECHNICAL,
  SERVICE_HEALTH_LOAD_ERROR,
  SETTINGS_SAVE_ERROR,
  SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL,
  feedDegradedCopy,
  safeMutationError,
  throwIfNoSupabase,
  userFacingCaughtError,
} from "./user-error-copy";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "coverage") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collectSourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) acc.push(full);
  }
  return acc;
}

runTest("throwIfNoSupabase throws user-facing copy, not the technical string", () => {
  const logs: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    assert.throws(
      () => throwIfNoSupabase(null),
      (err: unknown) =>
        err instanceof Error &&
        err.message === ACCOUNT_CONNECT_ERROR &&
        !err.message.includes(SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL),
    );
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL);
    const client = { ok: true };
    assert.equal(throwIfNoSupabase(client), client);
  } finally {
    console.error = original;
  }
});

runTest("userFacingCaughtError rewrites env leaks and keeps GoTrue copy", () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(
      userFacingCaughtError(new Error(MISSING_SUPABASE_ENV_TECHNICAL), "Failed to sign in."),
      ACCOUNT_CONNECT_ERROR,
    );
    assert.equal(
      userFacingCaughtError(new Error("Invalid login credentials"), "Failed to sign in."),
      "Invalid login credentials",
    );
  } finally {
    console.error = original;
  }
});

runTest("safeMutationError never passes PostgREST through", () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(
      safeMutationError(new Error("duplicate key value violates unique constraint"), "Failed"),
      "Failed",
    );
    assert.equal(safeMutationError(new Error(ACCOUNT_CONNECT_ERROR), "Failed"), ACCOUNT_CONNECT_ERROR);
    assert.equal(safeMutationError(new Error(AUTH_SESSION_ERROR), "Failed"), AUTH_SESSION_ERROR);
  } finally {
    console.error = original;
  }
});

runTest("feed degraded copy never interpolates the internal reason code", () => {
  assert.equal(feedDegradedCopy("db-error"), FEED_DEGRADED_COPY);
  assert.equal(feedDegradedCopy("rate-limit"), FEED_DEGRADED_COPY);
  assert.equal(feedDegradedCopy(null), FEED_DEGRADED_COPY);
  assert.equal(FEED_DEGRADED_COPY.includes("unknown"), false);
  assert.equal(FEED_DEGRADED_COPY.includes("db-error"), false);
});

runTest("user-facing copy never contains the technical supabase string", () => {
  for (const text of [
    ACCOUNT_CONNECT_ERROR,
    ACCURACY_LOAD_ERROR,
    METRICS_LOAD_ERROR,
    COLLECTOR_HEALTH_UNAVAILABLE,
    SETTINGS_SAVE_ERROR,
    GENERIC_REQUEST_ERROR,
    SERVICE_HEALTH_LOAD_ERROR,
    FEED_DEGRADED_COPY,
  ]) {
    assert.equal(text.includes(SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL), false);
    assert.equal(text.includes("Failed to load"), false);
  }
});

runTest("alerts / events / DiscordConnect no longer throw the technical string", () => {
  const files = [
    join(webRoot, "app/(dashboard)/alerts/page.tsx"),
    join(webRoot, "app/(dashboard)/events/[id]/page.tsx"),
    join(webRoot, "components/DiscordConnect.tsx"),
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.equal(
      src.includes(`throw new Error("${SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL}")`),
      false,
      file,
    );
    assert.match(src, /throwIfNoSupabase/);
  }
});

runTest("accuracy and metrics pages do not interpolate raw error.message", () => {
  const accuracy = readFileSync(join(webRoot, "app/accuracy/page.tsx"), "utf8");
  const metrics = readFileSync(join(webRoot, "app/admin/metrics/page.tsx"), "utf8");
  assert.equal(accuracy.includes("Failed to load accuracy data:"), false);
  assert.equal(accuracy.includes("{data.error}"), false);
  assert.match(accuracy, /ACCURACY_LOAD_ERROR/);
  assert.equal(metrics.includes("Failed to load metrics:"), false);
  assert.equal(metrics.includes("{metrics.error}"), false);
  assert.match(metrics, /METRICS_LOAD_ERROR/);
});

runTest("IngestionStatusBanner does not render the internal reason string", () => {
  const src = readFileSync(join(webRoot, "components/IngestionStatusBanner.tsx"), "utf8");
  assert.equal(src.includes("{data?.reason"), false);
  assert.match(src, /COLLECTOR_HEALTH_UNAVAILABLE/);
  assert.match(src, /console\.error/);
});

runTest("settings / feed / auth no longer show raw internals", () => {
  const settings = readFileSync(join(webRoot, "app/(dashboard)/settings/page.tsx"), "utf8");
  const dashboard = readFileSync(join(webRoot, "app/(dashboard)/dashboard/page.tsx"), "utf8");
  const map = readFileSync(join(webRoot, "app/(dashboard)/map/page.tsx"), "utf8");
  const login = readFileSync(join(webRoot, "app/(auth)/login/page.tsx"), "utf8");
  assert.equal(settings.includes("System Failure:"), false);
  assert.equal(settings.includes("Update Failed:"), false);
  assert.equal(settings.includes("${error.message}"), false);
  assert.match(dashboard, /feedDegradedCopy/);
  assert.equal(dashboard.includes("fallbackReason ??"), false);
  assert.match(map, /feedDegradedCopy/);
  assert.equal(map.includes("fallbackReason ??"), false);
  assert.equal(login.includes(MISSING_SUPABASE_ENV_TECHNICAL), false);
  assert.match(login, /throwIfNoSupabase/);
});

runTest("apiError call sites do not forward provider error.message", () => {
  const files = collectSourceFiles(join(webRoot, "app/api"));
  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (/apiError\([^)]*error\.message/.test(src)) offenders.push(file.slice(webRoot.length + 1));
  }
  assert.deepEqual(offenders, []);
});

runTest("TelegramConnect and CommandPalette load errors stay query-internal", () => {
  const telegram = readFileSync(join(webRoot, "components/TelegramConnect.tsx"), "utf8");
  const palette = readFileSync(join(webRoot, "components/CommandPalette.tsx"), "utf8");
  assert.match(telegram, /Failed to load Telegram status/);
  assert.match(palette, /Failed to load alert rules/);
  assert.equal(telegram.includes("isError"), false);
  assert.equal(palette.includes("isError"), false);
});

runTest("Supabase client not available never reaches toast or rendered text", () => {
  const files = collectSourceFiles(webRoot);
  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!src.includes(SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL)) continue;
    const rel = file.slice(webRoot.length + 1);
    if (rel === "lib/user-error-copy.ts") continue;
    offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});
