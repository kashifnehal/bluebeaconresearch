#!/usr/bin/env -S npx tsx
// Not part of the apps/backend "test" chain (rule 8) because it runs the
// real `pnpm run build`, which is too slow to include in every test run.
// Run manually after any change to the backend build pipeline or
// scripts/copy-data-assets.mjs:
//
//   cd apps/backend && npx tsx scripts/verify-build-copies-calendar.ts
//
// Asserts that a real build leaves the calendar JSON where the COMPILED
// dist/lib/week-ahead.js actually reads it (CALENDAR_PATH there resolves to
// dist/data/economic-calendar.json).
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, "..");

console.log("[verify-build-copies-calendar] running `pnpm run build`...");
execSync("pnpm run build", { cwd: backendRoot, stdio: "inherit" });

const compiledLoader = resolve(backendRoot, "dist/lib/week-ahead.js");
const compiledCalendar = resolve(backendRoot, "dist/data/economic-calendar.json");

if (!existsSync(compiledLoader)) {
  console.error(`✖ expected compiled loader at ${compiledLoader}`);
  process.exit(1);
}
if (!existsSync(compiledCalendar)) {
  console.error(`✖ expected calendar JSON at ${compiledCalendar} (the exact path dist/lib/week-ahead.js reads)`);
  process.exit(1);
}

console.log(`✔ ${compiledCalendar} exists after a real build`);
