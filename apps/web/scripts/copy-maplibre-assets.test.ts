import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyMaplibreAssets, MAPLIBRE_ASSET_FILES } from "./copy-maplibre-assets.mjs";

const require = createRequire(import.meta.url);

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

runTest("copies exactly the two allowlisted files, byte-identical to the installed package", () => {
  const destDir = mkdtempSync(join(tmpdir(), "maplibre-assets-"));
  try {
    const copied = copyMaplibreAssets(destDir);
    assert.equal(copied.length, 2);
    assert.deepEqual(MAPLIBRE_ASSET_FILES, ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]);
    for (const name of MAPLIBRE_ASSET_FILES) {
      const source = require.resolve(`maplibre-gl/dist/${name}`);
      const copiedBytes = readFileSync(join(destDir, name));
      const sourceBytes = readFileSync(source);
      assert.ok(copiedBytes.length > 0, `${name} must not be empty`);
      assert.deepEqual(copiedBytes, sourceBytes, `${name} must be byte-identical to the installed package`);
    }
  } finally {
    rmSync(destDir, { recursive: true, force: true });
  }
});

runTest("creates the destination directory if it doesn't exist yet", () => {
  const destDir = join(mkdtempSync(join(tmpdir(), "maplibre-assets-")), "nested", "vendor", "maplibre");
  try {
    copyMaplibreAssets(destDir);
    for (const name of MAPLIBRE_ASSET_FILES) {
      assert.ok(readFileSync(join(destDir, name)).length > 0);
    }
  } finally {
    rmSync(destDir, { recursive: true, force: true });
  }
});
