/**
 * Hostname of a publisher URL: lowercased, with one leading "www." removed.
 * Returns null when the value is missing or not a parseable absolute URL.
 */
export function sourceHostname(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const host = new URL(trimmed).hostname.toLowerCase().replace(/^www\./, "");
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

function presentLabel(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Distinct outlets. Uses domain when it is set, otherwise sourceLabel.
 * Null when every source is missing both.
 */
export function uniqueSourceCount(
  sources: { domain: string | null; sourceLabel: string | null }[],
): number | null {
  const seen = new Set<string>();
  for (const source of sources) {
    const key = presentLabel(source.domain) ?? presentLabel(source.sourceLabel);
    if (!key) continue;
    seen.add(key);
  }
  return seen.size > 0 ? seen.size : null;
}
