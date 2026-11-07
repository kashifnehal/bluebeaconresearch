export const CONSENT_STORAGE_KEY = "bbr.consent";
export const CONSENT_OPEN_EVENT = "bbr-consent-open";

export type ConsentChoice = {
  v: 1;
  analytics: boolean;
  at: string;
};

export function readConsent(): ConsentChoice | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Partial<ConsentChoice>;
    if (record.v !== 1 || typeof record.analytics !== "boolean" || typeof record.at !== "string") {
      return null;
    }
    return { v: 1, analytics: record.analytics, at: record.at };
  } catch {
    return null;
  }
}

export function writeConsent(analytics: boolean): void {
  try {
    if (typeof window === "undefined") return;
    const record: ConsentChoice = { v: 1, analytics, at: new Date().toISOString() };
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage blocked. The page must keep working.
  }
}

export function hasAnalyticsConsent(): boolean {
  return readConsent()?.analytics === true;
}

export function openConsentSettings(): void {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
  } catch {
    // Events are unavailable. The page must keep working.
  }
}
