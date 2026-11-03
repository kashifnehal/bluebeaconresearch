// "The Beacon Weekly" email generator (BE-M6 PART 4). Pure, no sending —
// renderWeeklyEmail() only builds {subject, html, text}; nothing here ever
// calls Resend. Built on the shared apps/backend/src/lib/email-layout.ts
// helpers, navy/paper palette only.

import {
  documentWrapper,
  escapeHtml,
  escapeAttr,
  masthead,
  preheader,
  sectionLabel,
  eventExposureEvidence,
  table,
  button,
  chart,
  footer,
} from "./email-layout.js";

const HOW_IT_WORKS_URL = "https://www.bluebeaconresearch.com/how-it-works";
const MAX_HTML_BYTES = 90_000;
const MAX_HEADLINE_CHARS = 70;
const MAX_PREHEADER_CHARS = 90;

export type WeeklyExposureRow = { market: string; mechanism: string; note: string };
export type WeeklyCoverageRow = { market: string; line: string; dateLabel: string; url: string };
export type WeeklyWatchRow = { dateLabel: string; item: string; market: string; source: string };

export type WeeklyInput = {
  edition: number;
  windowLabel: string;
  sentDateLabel: string;
  /** Max 90 chars. */
  preheader: string;
  lead: {
    /** Max 70 chars. */
    headline: string;
    summary: string;
    eventTimeUtc?: string;
    assessedTimeUtc: string;
    event: string;
    exposure: WeeklyExposureRow[];
    evidence: string[];
    unknown: string[];
    url: string;
  };
  chart?: { src: string; alt: string; caption: string; sourceLine: string };
  /** 0 to 6 rows. */
  coverage: WeeklyCoverageRow[];
  /** Module is skipped entirely when empty. */
  watch: WeeklyWatchRow[];
  correctionsCount?: number;
  correctionsUrl?: string;
  cta: { label: string; href: string };
  unsubscribeUrl: string;
  preferencesUrl: string;
  address?: string;
};

function assertHttps(label: string, url: string): void {
  if (!url.startsWith("https://")) {
    throw new Error(`${label} must be an https URL, got: ${url}`);
  }
}

function validate(input: WeeklyInput): void {
  if (input.lead.headline.length > MAX_HEADLINE_CHARS) {
    throw new Error(
      `lead.headline must be ${MAX_HEADLINE_CHARS} characters or fewer, got ${input.lead.headline.length}`,
    );
  }
  if (input.preheader.length > MAX_PREHEADER_CHARS) {
    throw new Error(
      `preheader must be ${MAX_PREHEADER_CHARS} characters or fewer, got ${input.preheader.length}`,
    );
  }
  if (input.lead.summary.trim() === "") {
    throw new Error("lead.summary must not be empty");
  }
  assertHttps("lead.url", input.lead.url);
  for (const row of input.coverage) assertHttps(`coverage[].url (market: ${row.market})`, row.url);
  for (const row of input.watch) assertHttps(`watch[].source (item: ${row.item})`, row.source);
}

function renderTheRead(lead: WeeklyInput["lead"]): string {
  const monoLine = `Event: ${lead.eventTimeUtc ?? "—"} · Assessed: ${lead.assessedTimeUtc}`;
  return `<div style="font:700 22px/1.3 Georgia,'Times New Roman',serif;color:#0B1220;margin-bottom:6px;">
<a href="${escapeAttr(lead.url)}" style="color:#0B1220;text-decoration:none;">${escapeHtml(lead.headline)}</a>
</div>
<div style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#0B1220;margin-bottom:8px;">${escapeHtml(
    lead.summary,
  )}</div>
<div style="font:400 12px/1.6 'Courier New',Courier,monospace;color:#5B6B7F;margin-bottom:12px;">${escapeHtml(
    monoLine,
  )}</div>`;
}

function renderEventExposureEvidence(lead: WeeklyInput["lead"]): string {
  const exposure = lead.exposure
    .map(
      (row) =>
        `<div style="margin-bottom:6px;"><strong style="color:#0B1220;">${escapeHtml(
          row.market,
        )}</strong> — ${escapeHtml(row.mechanism)}<br><span style="color:#5B6B7F;">${escapeHtml(
          row.note,
        )}</span></div>`,
    )
    .join("");
  const unknown = lead.unknown.length
    ? `<div style="margin-top:8px;">${sectionLabel("Unknown")}${lead.unknown
        .map((u) => `<div>${escapeHtml(u)}</div>`)
        .join("")}</div>`
    : "";
  const evidence = lead.evidence.map((e) => `<div>${escapeHtml(e)}</div>`).join("");
  return eventExposureEvidence({ event: escapeHtml(lead.event), exposure: exposure + unknown, evidence });
}

function renderCoverage(coverage: WeeklyCoverageRow[]): string {
  if (coverage.length === 0) return "";
  return `${sectionLabel("Coverage")}${table(
    ["Market", "Line", "Date"],
    coverage.map((row) => [
      `<a href="${escapeAttr(row.url)}" style="color:#0A2643;font-weight:700;text-decoration:none;">${escapeHtml(
        row.market,
      )}</a>`,
      escapeHtml(row.line),
      escapeHtml(row.dateLabel),
    ]),
  )}`;
}

function renderWatch(watch: WeeklyWatchRow[]): string {
  if (watch.length === 0) return "";
  return `${sectionLabel("What to watch")}${table(
    ["Date", "Item", "Market", "Source"],
    watch.map((row) => [
      escapeHtml(row.dateLabel),
      escapeHtml(row.item),
      escapeHtml(row.market),
      `<a href="${escapeAttr(row.source)}" style="color:#0A2643;">Source</a>`,
    ]),
  )}`;
}

function renderMethodAndCorrections(input: WeeklyInput): string {
  const correctionsLine =
    input.correctionsCount !== undefined
      ? `<div style="font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#5B6B7F;margin-top:4px;">${
          input.correctionsCount
        } correction${input.correctionsCount === 1 ? "" : "s"} this edition — <a href="${escapeAttr(
          input.correctionsUrl ?? HOW_IT_WORKS_URL,
        )}" style="color:#5B6B7F;">see details</a>.</div>`
      : "";
  return `<div style="margin-top:16px;border-top:1px solid #D9DDE3;padding-top:12px;">
${sectionLabel("Method")}
<div style="font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#5B6B7F;">Assessments are produced with automated language-model classification. <a href="${HOW_IT_WORKS_URL}" style="color:#5B6B7F;">How it works</a>.</div>
${correctionsLine}
</div>`;
}

function renderWeeklyBody(input: WeeklyInput): string {
  return [
    preheader(input.preheader),
    masthead("THE BEACON WEEKLY", `Edition ${input.edition} · ${input.windowLabel}`),
    renderTheRead(input.lead),
    renderEventExposureEvidence(input.lead),
    input.chart ? chart(input.chart) : "",
    renderCoverage(input.coverage),
    renderWatch(input.watch),
    renderMethodAndCorrections(input),
    button(input.cta.label, input.cta.href),
    footer({
      reason: "You're subscribed to The Beacon Weekly.",
      unsubscribeUrl: input.unsubscribeUrl,
      preferencesUrl: input.preferencesUrl,
      address: input.address,
    }),
  ].join("\n");
}

function renderWeeklyText(input: WeeklyInput): string {
  const lead = input.lead;
  const lines: string[] = [
    `THE BEACON WEEKLY — Edition ${input.edition} · ${input.windowLabel}`,
    "",
    lead.headline,
    lead.summary,
    `Event: ${lead.eventTimeUtc ?? "—"} · Assessed: ${lead.assessedTimeUtc}`,
    "",
    "EVENT",
    lead.event,
    "",
    "EXPOSURE",
    ...lead.exposure.map((row) => `- ${row.market}: ${row.mechanism} (${row.note})`),
  ];
  if (lead.unknown.length) {
    lines.push("", "UNKNOWN", ...lead.unknown.map((u) => `- ${u}`));
  }
  lines.push("", "EVIDENCE", ...lead.evidence.map((e) => `- ${e}`), "", `Read more: ${lead.url}`);

  if (input.coverage.length) {
    lines.push("", "COVERAGE");
    for (const row of input.coverage) lines.push(`- ${row.market}: ${row.line} (${row.dateLabel}) ${row.url}`);
  }

  if (input.watch.length) {
    lines.push("", "WHAT TO WATCH");
    for (const row of input.watch) lines.push(`- ${row.dateLabel} ${row.item} (${row.market}) ${row.source}`);
  }

  lines.push(
    "",
    "METHOD",
    `Assessments are produced with automated language-model classification. How it works: ${HOW_IT_WORKS_URL}`,
  );
  if (input.correctionsCount !== undefined) {
    lines.push(
      `${input.correctionsCount} correction${input.correctionsCount === 1 ? "" : "s"} this edition — see details: ${
        input.correctionsUrl ?? HOW_IT_WORKS_URL
      }`,
    );
  }

  lines.push(
    "",
    `${input.cta.label}: ${input.cta.href}`,
    "",
    `Unsubscribe: ${input.unsubscribeUrl}`,
    `Preferences: ${input.preferencesUrl}`,
  );
  if (input.address) lines.push(input.address);

  return lines.join("\n");
}

export function renderWeeklyEmail(input: WeeklyInput): { subject: string; html: string; text: string } {
  validate(input);

  const html = documentWrapper(`The Beacon Weekly — Edition ${input.edition}`, renderWeeklyBody(input));
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > MAX_HTML_BYTES) {
    throw new Error(`rendered HTML is ${bytes} bytes, over the ${MAX_HTML_BYTES}-byte limit`);
  }

  return {
    subject: `The Beacon Weekly — Edition ${input.edition}: ${input.lead.headline}`,
    html,
    text: renderWeeklyText(input),
  };
}
