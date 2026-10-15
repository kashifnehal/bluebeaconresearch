export const FIRST_TOUCH_STORAGE_KEY = "bbr.firstTouch";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

const MAX_LEN = 100;

export type FirstTouch = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_host?: string;
};

function clean(value: string): string | null {
  const trimmed = value.trim().toLowerCase().slice(0, MAX_LEN);
  return trimmed.length > 0 ? trimmed : null;
}

function referrerHostname(referrer: string, ownHost: string): string | null {
  if (!referrer.trim()) return null;
  let hostname: string;
  try {
    hostname = new URL(referrer).hostname;
  } catch {
    return null;
  }
  const host = clean(hostname);
  if (!host) return null;
  const own = ownHost.trim().toLowerCase().replace(/:\d+$/, "");
  if (!own || host === own) return null;
  return host;
}

/** Pure parse. Returns null unless at least one utm value or an external referrer host is present. */
export function parseFirstTouch(search: string, referrer: string, ownHost: string): FirstTouch | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: FirstTouch = {};
  for (const key of UTM_KEYS) {
    const raw = params.get(key);
    if (raw == null) continue;
    const value = clean(raw);
    if (value) out[key] = value;
  }
  const host = referrerHostname(referrer, ownHost);
  if (host) out.referrer_host = host;
  return Object.keys(out).length > 0 ? out : null;
}

export function readFirstTouch(): FirstTouch | null {
  try {
    const raw = sessionStorage.getItem(FIRST_TOUCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const touch = parseStored(parsed);
    return touch;
  } catch {
    return null;
  }
}

function parseStored(value: object): FirstTouch | null {
  const src = value as Record<string, unknown>;
  const out: FirstTouch = {};
  for (const key of [...UTM_KEYS, "referrer_host"] as const) {
    const raw = src[key];
    if (typeof raw !== "string") continue;
    const cleaned = clean(raw);
    if (cleaned) out[key] = cleaned;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Writes the first touch for this tab. Never overwrites. Never throws. */
export function captureFirstTouch(): void {
  try {
    if (typeof window === "undefined") return;
    let existing: string | null;
    try {
      existing = sessionStorage.getItem(FIRST_TOUCH_STORAGE_KEY);
    } catch {
      return;
    }
    if (existing) return;
    const touch = parseFirstTouch(
      window.location.search ?? "",
      typeof document === "undefined" ? "" : (document.referrer ?? ""),
      window.location.hostname ?? "",
    );
    if (!touch) return;
    try {
      sessionStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(touch));
    } catch {
      // Storage blocked. The page must keep working.
    }
  } catch {
    // Storage blocked or no document. The page must keep working.
  }
}
