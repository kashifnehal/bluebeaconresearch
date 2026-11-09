import { createRequire } from "node:module";
import path from "node:path";

const ALLOWED = new Set(["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]);

export function mapLibreAssetFilename(file: string): string | null {
  if (!ALLOWED.has(file)) return null;
  return file;
}

/** Absolute path inside the installed maplibre-gl package, or null if `file` is not allowlisted. */
export function mapLibreAssetPath(file: string): string | null {
  const name = mapLibreAssetFilename(file);
  if (!name) return null;
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return require.resolve(`maplibre-gl/dist/${name}`);
}
