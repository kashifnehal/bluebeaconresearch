#!/usr/bin/env node
// Copies the two maplibre-gl dist files EventLocationMap.tsx and map/page.tsx
// need at runtime (see lib/maplibre-worker-url.ts) into public/vendor/maplibre/,
// where Next serves them as plain static assets.
//
// Replaces the old GET /vendor/maplibre/[file] route handler (removed TASK
// HEALTH-1 Part 2, 2026-11-17): that route resolved these files via
// require.resolve(`maplibre-gl/dist/${name}`) at request time. Confirmed via
// a real `next build`'s route.js.nft.json that Next 16's default Turbopack
// build never traces that dynamic require into the deployed function's file
// bundle (outputFileTracingIncludes doesn't help either — that logic is
// gated to the webpack bundler, which `next build` no longer uses by
// default), so every request 404'd on Vercel ("Cannot find module
// 'maplibre-gl/dist/maplibre-gl-worker.mjs'"). Static public/ files need no
// tracing at all. Runs via predev/prebuild, same pattern as
// sync-calendar-data.mjs. The basemap tiles/attribution are unchanged — only
// where these two files are served from.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, "../package.json"));

export const MAPLIBRE_ASSET_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

export function copyMaplibreAssets(destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const name of MAPLIBRE_ASSET_FILES) {
    const src = require.resolve(`maplibre-gl/dist/${name}`);
    copyFileSync(src, resolve(destDir, name));
  }
  return MAPLIBRE_ASSET_FILES.map((name) => resolve(destDir, name));
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const destDir = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, "../public/vendor/maplibre");
  const copied = copyMaplibreAssets(destDir);
  console.log(`[copy-maplibre-assets] copied ${copied.length} file(s) to ${destDir}`);
}
