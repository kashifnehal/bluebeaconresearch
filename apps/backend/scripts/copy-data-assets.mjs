#!/usr/bin/env node
// Copies apps/backend/src/data/*.json into dist/data/ so the files
// week-ahead.ts reads at runtime (via CALENDAR_PATH, resolved relative to
// the compiled lib/week-ahead.js) actually exist in the built image.
// `tsc`'s "include" is src/**/*.ts only, so these JSON files were never
// copied into dist/ by the build itself (confirmed by their absence from
// dist/ after a real `pnpm run build` before this script existed). Runs via
// package.json's "prebuild" hook, same pattern as apps/web's
// scripts/copy-maplibre-assets.mjs and scripts/sync-calendar-data.mjs.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function copyDataAssets(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  const files = readdirSync(srcDir).filter((name) => name.endsWith(".json"));
  for (const name of files) {
    copyFileSync(resolve(srcDir, name), resolve(destDir, name));
  }
  return files;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const srcDir = resolve(__dirname, "../src/data");
  const destDir = resolve(__dirname, "../dist/data");
  const copied = copyDataAssets(srcDir, destDir);
  console.log(`[copy-data-assets] copied ${copied.length} file(s) from ${srcDir} -> ${destDir}`);
}
