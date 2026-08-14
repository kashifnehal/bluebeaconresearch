import { sendAlert } from "@/lib/alerter";

const METRICS = new Map<string, number>();

// Simple thresholds for automated alerts (key -> threshold)
const THRESHOLDS: Record<string, number> = {
  "signals.ratelimit_check_errors": 3,
  "signals.inproc_rate_limit_hits": 5,
  "signals.handler_exceptions": 1,
};

export function incr(key: string, delta = 1) {
  const v = METRICS.get(key) ?? 0;
  const next = v + delta;
  METRICS.set(key, next);

  // If a threshold is configured and we've just crossed it, send an alert
  const thr = THRESHOLDS[key];
  if (thr !== undefined && v < thr && next >= thr) {
    // non-blocking send
    void sendAlert({
      key,
      value: next,
      threshold: thr,
      ts: new Date().toISOString(),
    });
  }
}

export function getAll() {
  return Object.fromEntries(METRICS.entries());
}

export default { incr, getAll };
