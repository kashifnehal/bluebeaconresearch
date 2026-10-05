import { createHash } from "node:crypto";

// W7-DEDUPE-KEY (claude/dedupe-key-bug) — the old scheme was
// `${prefix}-${Buffer.from(url).toString("base64").slice(0, 32)}`. 32 base64 chars
// only encode the first 24 bytes of the URL, so every article from the same site
// whose URL shares the same first 24 characters collided on one external_id and
// the unique (source, external_id) index silently kept only the first ever stored.
// This file replaces that with a full-URL hash so no truncation collision is possible.

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set(["fbclid", "gclid"]);

/** Normalizes a URL so trivial variants (tracking params, trailing slash, fragment,
 *  host case) hash to the same external_id instead of being treated as new articles. */
export function canonicalUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.trim().replace(/\/+$/, "");
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  for (const key of Array.from(parsed.searchParams.keys())) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))) {
      parsed.searchParams.delete(key);
    }
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

/** Full-URL SHA-256 (base64url, 43 chars, unpadded) — no truncation, so no collisions. */
export function articleExternalId(prefix: string, url: string): string {
  const hash = createHash("sha256").update(canonicalUrl(url)).digest("base64url");
  return `${prefix}-${hash}`;
}
