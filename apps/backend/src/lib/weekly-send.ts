// Builds and, only when every send switch is on, delivers one edition of
// The Beacon Weekly. Dry-run is the default: it renders and counts, and it
// does not call the mailer or write a log row. Added 2026-11-08.

import type { EmailService } from "../services/email.service.js";
import { renderWeeklyEmail, type WeeklyInput } from "./weekly-email.js";

export const WEEKLY_SEND_GAP_MS = 600;
export const WEEKLY_SEND_MAX = 90;

export type WeeklyEditionFile = Omit<WeeklyInput, "unsubscribeUrl" | "preferencesUrl">;

export type WeeklySubscriber = {
  id: string;
  email: string;
  unsubscribe_token: string;
};

export type WeeklySendLogRow = {
  edition: number;
  subscriber_id: string;
  status: "sent" | "failed";
  resend_id: string | null;
  error: string | null;
};

export type WeeklySendDeps = {
  loadConfirmed: () => Promise<WeeklySubscriber[]>;
  loadSentIds: (edition: number) => Promise<Set<string>>;
  record: (row: WeeklySendLogRow) => Promise<void>;
  send: EmailService["send"];
  sleep: (ms: number) => Promise<void>;
};

export type WeeklySendOpts = {
  edition: WeeklyEditionFile;
  /** Edition number from the command line. Send mode requires it to match the file. */
  editionNumber: number;
  mode: "dry-run" | "send";
  max: number;
  appUrl: string;
  env: Record<string, string | undefined>;
};

export type WeeklySendResult = {
  eligible: number;
  built: number;
  sent: number;
  failed: number;
};

type SendFailure = { sent: false; reason: string };
type SendSuccess = { sent: true; id: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(source: Record<string, unknown>, label: string): string {
  const value = source[label];
  if (typeof value !== "string") {
    throw new Error(`edition file ${label} must be a string`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`edition file ${label} must be an array of strings`);
  }
  return value;
}

function exposureRows(value: unknown): WeeklyInput["lead"]["exposure"] {
  if (!Array.isArray(value)) throw new Error("edition file lead.exposure must be an array");
  return value.map((row, index) => {
    if (!isRecord(row)) throw new Error(`edition file lead.exposure[${index}] must be an object`);
    return {
      market: requiredString(row, "market"),
      mechanism: requiredString(row, "mechanism"),
      note: requiredString(row, "note"),
    };
  });
}

function coverageRows(value: unknown): WeeklyInput["coverage"] {
  if (!Array.isArray(value)) throw new Error("edition file coverage must be an array");
  return value.map((row, index) => {
    if (!isRecord(row)) throw new Error(`edition file coverage[${index}] must be an object`);
    return {
      market: requiredString(row, "market"),
      line: requiredString(row, "line"),
      dateLabel: requiredString(row, "dateLabel"),
      url: requiredString(row, "url"),
    };
  });
}

function watchRows(value: unknown): WeeklyInput["watch"] {
  if (!Array.isArray(value)) throw new Error("edition file watch must be an array");
  return value.map((row, index) => {
    if (!isRecord(row)) throw new Error(`edition file watch[${index}] must be an object`);
    return {
      dateLabel: requiredString(row, "dateLabel"),
      item: requiredString(row, "item"),
      market: requiredString(row, "market"),
      source: requiredString(row, "source"),
    };
  });
}

function readLead(value: unknown): WeeklyEditionFile["lead"] {
  if (!isRecord(value)) throw new Error("edition file lead must be an object");
  const lead: WeeklyEditionFile["lead"] = {
    headline: requiredString(value, "headline"),
    summary: requiredString(value, "summary"),
    assessedTimeUtc: requiredString(value, "assessedTimeUtc"),
    event: requiredString(value, "event"),
    exposure: exposureRows(value.exposure),
    evidence: stringArray(value.evidence, "lead.evidence"),
    unknown: stringArray(value.unknown, "lead.unknown"),
    url: requiredString(value, "url"),
  };
  if (value.eventTimeUtc !== undefined) {
    lead.eventTimeUtc = requiredString(value, "eventTimeUtc");
  }
  return lead;
}

/**
 * Checks the edition JSON shape, then renders once with a placeholder token
 * so the weekly renderer's own checks (length, https, size) still apply.
 */
export function validateEditionFile(json: unknown): WeeklyEditionFile {
  if (!isRecord(json)) throw new Error("edition file must be a JSON object");
  if (typeof json.edition !== "number" || !Number.isInteger(json.edition)) {
    throw new Error("edition file edition must be an integer");
  }
  if (!isRecord(json.cta)) throw new Error("edition file cta must be an object");

  const edition: WeeklyEditionFile = {
    edition: json.edition,
    windowLabel: requiredString(json, "windowLabel"),
    sentDateLabel: requiredString(json, "sentDateLabel"),
    preheader: requiredString(json, "preheader"),
    lead: readLead(json.lead),
    coverage: coverageRows(json.coverage),
    watch: watchRows(json.watch),
    cta: {
      label: requiredString(json.cta, "label"),
      href: requiredString(json.cta, "href"),
    },
  };

  if (json.chart !== undefined) {
    if (!isRecord(json.chart)) throw new Error("edition file chart must be an object");
    edition.chart = {
      src: requiredString(json.chart, "src"),
      alt: requiredString(json.chart, "alt"),
      caption: requiredString(json.chart, "caption"),
      sourceLine: requiredString(json.chart, "sourceLine"),
    };
  }
  if (json.correctionsCount !== undefined) {
    if (typeof json.correctionsCount !== "number" || !Number.isInteger(json.correctionsCount)) {
      throw new Error("edition file correctionsCount must be an integer");
    }
    edition.correctionsCount = json.correctionsCount;
  }
  if (json.correctionsUrl !== undefined) {
    edition.correctionsUrl = requiredString(json, "correctionsUrl");
  }
  if (json.address !== undefined) {
    edition.address = requiredString(json, "address");
  }

  const token = "placeholder";
  renderWeeklyEmail({
    ...edition,
    unsubscribeUrl: `https://bluebeaconresearch.com/api/unsubscribe?t=${encodeURIComponent(token)}`,
    preferencesUrl: `https://bluebeaconresearch.com/unsubscribe?t=${encodeURIComponent(token)}`,
  });
  return edition;
}

export function assertHttpsAppUrl(appUrl: string): void {
  if (!appUrl.startsWith("https://")) {
    throw new Error("appUrl must be an https URL");
  }
}

export function buildRecipientMessage(
  edition: WeeklyEditionFile,
  subscriber: { id: string; unsubscribe_token: string },
  appUrl: string,
): { subject: string; html: string; text: string; headers: Record<string, string> } {
  assertHttpsAppUrl(appUrl);
  const token = encodeURIComponent(subscriber.unsubscribe_token);
  const unsubscribeUrl = `${appUrl}/api/unsubscribe?t=${token}`;
  const preferencesUrl = `${appUrl}/unsubscribe?t=${token}`;
  const correctionsUrl =
    edition.correctionsCount !== undefined && !edition.correctionsUrl
      ? `${appUrl}/corrections`
      : edition.correctionsUrl;
  const rendered = renderWeeklyEmail({
    ...edition,
    ...(correctionsUrl !== undefined ? { correctionsUrl } : {}),
    unsubscribeUrl,
    preferencesUrl,
  });
  return {
    ...rendered,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

function assertSendAllowed(opts: WeeklySendOpts): void {
  if (opts.env.WEEKLY_SEND_ENABLED !== "true") {
    throw new Error("send mode refused: WEEKLY_SEND_ENABLED is not true");
  }
  if (opts.edition.lead.headline.startsWith("SAMPLE LAYOUT")) {
    throw new Error("send mode refused: edition headline is a sample layout");
  }
  if (!Number.isInteger(opts.max) || opts.max < 1 || opts.max > WEEKLY_SEND_MAX) {
    throw new Error("send mode refused: max must be an integer from 1 to 90");
  }
  if (opts.editionNumber !== opts.edition.edition) {
    throw new Error("send mode refused: edition number does not match the edition file");
  }
}

function logWeekly(message: string): void {
  if (message.includes("@")) return;
  console.log(message);
}

function shortReason(raw: string): string {
  const cleaned = raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "send failed").slice(0, 180);
}

function compareId(a: WeeklySubscriber, b: WeeklySubscriber): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function isMissingWeeklySendLogError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return message.includes("weekly_send_log") && (message.includes("does not exist") || message.includes("schema cache"));
}

export async function runWeeklySend(opts: WeeklySendOpts, deps: WeeklySendDeps): Promise<WeeklySendResult> {
  assertHttpsAppUrl(opts.appUrl);
  if (opts.mode === "send") assertSendAllowed(opts);

  const [confirmed, sentIds] = await Promise.all([
    deps.loadConfirmed(),
    deps.loadSentIds(opts.edition.edition),
  ]);
  const recipients = confirmed.filter((row) => !sentIds.has(row.id)).sort(compareId);

  let built = 0;
  let sent = 0;
  let failed = 0;

  if (opts.mode === "dry-run") {
    for (const subscriber of recipients) {
      buildRecipientMessage(opts.edition, subscriber, opts.appUrl);
      built += 1;
    }
    const result = { eligible: recipients.length, built, sent, failed };
    logWeekly(
      `[weekly] mode=dry-run eligible=${result.eligible} built=${result.built} sent=${result.sent} failed=${result.failed}`,
    );
    return result;
  }

  for (let i = 0; i < recipients.length; i++) {
    if (sent >= opts.max) break;
    const subscriber = recipients[i];
    const message = buildRecipientMessage(opts.edition, subscriber, opts.appUrl);
    built += 1;
    const idPrefix = subscriber.id.slice(0, 8);

    let outcome: SendSuccess | SendFailure;
    try {
      const response = await deps.send({
        to: subscriber.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
      });
      outcome = response.sent
        ? { sent: true, id: response.id ?? null }
        : { sent: false, reason: response.reason || "send failed" };
    } catch {
      outcome = { sent: false, reason: "send failed" };
    }

    if (outcome.sent) {
      sent += 1;
      await deps.record({
        edition: opts.edition.edition,
        subscriber_id: subscriber.id,
        status: "sent",
        resend_id: outcome.id,
        error: null,
      });
      logWeekly(`[weekly] ${idPrefix} sent`);
    } else {
      failed += 1;
      await deps.record({
        edition: opts.edition.edition,
        subscriber_id: subscriber.id,
        status: "failed",
        resend_id: null,
        error: shortReason(outcome.reason),
      });
      logWeekly(`[weekly] ${idPrefix} failed`);
    }

    if (sent >= opts.max) break;
    if (i + 1 < recipients.length) await deps.sleep(WEEKLY_SEND_GAP_MS);
  }

  const result = { eligible: recipients.length, built, sent, failed };
  logWeekly(
    `[weekly] mode=send eligible=${result.eligible} built=${result.built} sent=${result.sent} failed=${result.failed}`,
  );
  return result;
}
