import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCOUNT_CONNECT_ERROR,
  ACCURACY_LOAD_ERROR,
  COLLECTOR_HEALTH_UNAVAILABLE,
  METRICS_LOAD_ERROR,
  SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL,
  throwIfNoSupabase,
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

runTest("user-facing copy never contains the technical supabase string", () => {
  for (const text of [
    ACCOUNT_CONNECT_ERROR,
    ACCURACY_LOAD_ERROR,
    METRICS_LOAD_ERROR,
    COLLECTOR_HEALTH_UNAVAILABLE,
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

runTest("TelegramConnect and CommandPalette errors stay query-internal", () => {
  const telegram = readFileSync(join(webRoot, "components/TelegramConnect.tsx"), "utf8");
  const palette = readFileSync(join(webRoot, "components/CommandPalette.tsx"), "utf8");
  assert.match(telegram, /Failed to load Telegram status/);
  assert.match(palette, /Failed to load alert rules/);
  assert.equal(telegram.includes("isError"), false);
  assert.equal(telegram.includes("error.message"), false);
  assert.equal(palette.includes("isError"), false);
  assert.equal(palette.includes("error.message"), false);
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
