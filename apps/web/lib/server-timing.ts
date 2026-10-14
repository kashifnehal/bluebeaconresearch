export type ServerTimingStep = {
  name: string;
  durMs: number;
  desc?: string;
};

/** True only when the founder sets SERVER_TIMING=true. Any other value stays off. */
export function serverTimingEnabled(): boolean {
  return process.env.SERVER_TIMING === "true";
}

/**
 * Server-Timing header value. Durations are whole milliseconds.
 * Descriptions are short status words (hit, miss, timeout). No ids or account data.
 */
export function formatServerTiming(steps: readonly ServerTimingStep[]): string {
  return steps
    .map((step) => {
      const name = step.name.replace(/[^A-Za-z0-9!#$%&'*+\-.^_`|~]/g, "");
      const dur = Math.max(0, Math.round(step.durMs));
      if (!step.desc) return `${name};dur=${dur}`;
      const desc = step.desc.replace(/[^a-z]/g, "");
      return `${name};dur=${dur};desc="${desc}"`;
    })
    .join(", ");
}
