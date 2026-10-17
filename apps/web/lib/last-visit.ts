/**
 * Last-visit bookkeeping for the desk "Since your last visit" strip.
 * Storage can throw or be missing (private mode, blocked storage), so every
 * access is guarded; callers fall back to "Today" counts when this returns null.
 */
export const LAST_VISIT_KEY = "bbr.desk.lastVisit.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLastVisit(storage: StorageLike | null = defaultStorage()): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAST_VISIT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeLastVisit(now: number, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LAST_VISIT_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type SinceSummary = {
  /** "since" = counted from the stored last visit; "today" = storage unavailable or first visit. */
  mode: "since" | "today";
  sinceMs: number;
  newCount: number;
};

export function summarizeSince(
  signals: readonly { createdAt: string }[],
  lastVisitMs: number | null,
  now: number,
): SinceSummary {
  const mode = lastVisitMs == null ? "today" : "since";
  const sinceMs = lastVisitMs ?? startOfLocalDay(now);
  let newCount = 0;
  for (const s of signals) {
    const t = Date.parse(s.createdAt);
    if (Number.isFinite(t) && t > sinceMs) newCount += 1;
  }
  return { mode, sinceMs, newCount };
}
