import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mapLibreAssetFilename, mapLibreAssetPath } from "./maplibre-asset";

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

runTest("only the worker and its shared chunk are served", () => {
  assert.equal(mapLibreAssetFilename("maplibre-gl-worker.mjs"), "maplibre-gl-worker.mjs");
  assert.equal(mapLibreAssetFilename("maplibre-gl-shared.mjs"), "maplibre-gl-shared.mjs");
  assert.equal(mapLibreAssetFilename("../package.json"), null);
  assert.equal(mapLibreAssetFilename("maplibre-gl.css"), null);
});

runTest("the allowlisted files resolve inside the installed package", () => {
  const worker = mapLibreAssetPath("maplibre-gl-worker.mjs");
  const shared = mapLibreAssetPath("maplibre-gl-shared.mjs");
  assert.ok(worker && existsSync(worker));
  assert.ok(shared && existsSync(shared));
  assert.equal(mapLibreAssetPath("../../.env.local"), null);
});
