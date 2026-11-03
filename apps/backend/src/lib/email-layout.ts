// Shared inline-CSS, table-based HTML building blocks for BBR's transactional
// and digest emails (BE-M6). Navy/paper palette only — the brand kit isn't
// approved yet: navy #0A2643, white, black text #0B1220, grey text #5B6B7F,
// hairline #D9DDE3, paper tint #F5F3EE. No green/red/amber.
//
// Every function here is pure (no I/O) and returns a plain string. Plain-text
// leaf values (labels, dates, item text, alt text, link labels) are escaped
// internally via escapeHtml()/escapeAttr(). `event`, `exposure`, `evidence`,
// and table `rows`/`headers` cells are treated as pre-built HTML fragments —
// callers must escape their own leaf text (with escapeHtml below) before
// composing those fragments.

const NAVY = "#0A2643";
const TEXT = "#0B1220";
const GREY = "#5B6B7F";
const HAIRLINE = "#D9DDE3";
const PAPER = "#F5F3EE";

const HEADLINE_FONT = "Georgia, 'Times New Roman', serif";
const BODY_FONT = "Arial, Helvetica, sans-serif";
const MONO_FONT = "'Courier New', Courier, monospace";

// Defensive: these helpers never emit a direction glyph, even if a caller's
// item text happens to contain one.
const ARROW_CHARS = /[↑↓↕→←⇧⇩⇧⇑⇓]/g;

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Same escaping as escapeHtml — a distinct name documents intent at call sites that build href/src attributes. */
export function escapeAttr(value: string): string {
  return escapeHtml(value);
}

/**
 * Wraps a rendered body in a full HTML document: doctype, color-scheme metas
 * (so email clients that honor them don't invert the navy/paper palette in
 * dark mode), and a 600px paper-tint outer table. This is the only function
 * here that returns a complete document rather than a fragment.
 */
export function documentWrapper(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};font-family:${BODY_FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${HAIRLINE};">
<tr><td style="padding:24px 24px 8px;">
${bodyHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Hidden preheader text — the inbox-preview snippet, invisible in the rendered body. */
export function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">${escapeHtml(
    text,
  )}</div>`;
}

/** editionLabel e.g. "BLUE BEACON RESEARCH" / "THE BEACON WEEKLY"; dateLine e.g. "Daily Brief · 3 Nov 2026 UTC". */
export function masthead(editionLabel: string, dateLine: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
<tr><td style="font:700 18px/1.3 ${HEADLINE_FONT};color:${NAVY};letter-spacing:.04em;">${escapeHtml(
    editionLabel,
  )}</td></tr>
<tr><td style="font:400 12px/1.5 ${BODY_FONT};color:${GREY};padding-top:2px;">${escapeHtml(dateLine)}</td></tr>
<tr><td style="border-top:1px solid ${HAIRLINE};padding-top:12px;"></td></tr>
</table>`;
}

/** Small uppercase label used standalone or inside eventExposureEvidence(). */
export function sectionLabel(label: string): string {
  return `<div style="font:700 10px/1.4 ${BODY_FONT};letter-spacing:.12em;text-transform:uppercase;color:${GREY};">${escapeHtml(
    label,
  )}</div>`;
}

/**
 * The Event / Exposure / Evidence block. `event`, `exposure`, and `evidence`
 * are pre-built HTML fragments (the caller has already escaped its own leaf
 * text via escapeHtml) so they can contain links.
 */
export function eventExposureEvidence(parts: { event: string; exposure: string; evidence: string }): string {
  const row = (label: string, body: string) =>
    `<tr><td style="padding:8px 0;border-top:1px solid ${HAIRLINE};">
      ${sectionLabel(label)}
      <div style="font:400 14px/1.5 ${BODY_FONT};color:${TEXT};margin-top:3px;">${body}</div>
    </td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row("Event", parts.event)}
${row("Exposure", parts.exposure)}
${row("Evidence", parts.evidence)}
</table>`;
}

/** Neutral grey pills — never a direction glyph, even if `items` contains one. */
export function tagList(items: string[]): string {
  return items
    .map((item) => {
      const clean = escapeHtml(item).replace(ARROW_CHARS, "").trim();
      return `<span style="display:inline-block;padding:2px 8px;margin:0 4px 4px 0;border-radius:999px;background:${PAPER};border:1px solid ${HAIRLINE};font:600 12px ${MONO_FONT};color:${TEXT};">${clean}</span>`;
    })
    .join("");
}

/** headers/rows cells are pre-built HTML fragments (caller escapes its own leaf text). */
export function table(headers: string[], rows: string[][]): string {
  const head = headers
    .map(
      (h) =>
        `<th align="left" style="padding:6px 10px;border-bottom:1px solid ${HAIRLINE};font:700 11px/1.4 ${BODY_FONT};letter-spacing:.06em;text-transform:uppercase;color:${GREY};">${escapeHtml(
          h,
        )}</th>`,
    )
    .join("");
  const body = rows
    .map(
      (cells) =>
        `<tr>${cells
          .map(
            (cell) =>
              `<td style="padding:6px 10px;border-bottom:1px solid ${HAIRLINE};font:400 13px/1.5 ${BODY_FONT};color:${TEXT};">${cell}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;">
<thead><tr>${head}</tr></thead>
<tbody>${body}</tbody>
</table>`;
}

/** A navy table-cell button (not an image) — the only acceptable CTA shape per the color rule. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
<tr><td style="background:${NAVY};border-radius:6px;">
<a href="${escapeAttr(href)}" style="display:inline-block;padding:12px 24px;font:700 14px ${BODY_FONT};color:${PAPER};text-decoration:none;">${escapeHtml(
    label,
  )}</a>
</td></tr>
</table>`;
}

/** Renders nothing when src is undefined (no placeholder, no broken-image box). */
export function chart(opts: { src?: string; alt: string; caption: string; sourceLine: string }): string {
  if (!opts.src) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;">
<tr><td><img src="${escapeAttr(opts.src)}" alt="${escapeHtml(
    opts.alt,
  )}" width="552" style="width:100%;max-width:552px;display:block;border:1px solid ${HAIRLINE};"></td></tr>
<tr><td style="font:400 12px/1.5 ${BODY_FONT};color:${GREY};padding-top:4px;">${escapeHtml(opts.caption)}</td></tr>
<tr><td style="font:400 11px/1.5 ${BODY_FONT};color:${GREY};">${escapeHtml(opts.sourceLine)}</td></tr>
</table>`;
}

/** address renders only when set — no postal entity exists yet. */
export function footer(opts: {
  reason: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
  address?: string;
}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
<tr><td style="border-top:1px solid ${HAIRLINE};padding-top:12px;font:400 11px/1.6 ${BODY_FONT};color:${GREY};">
${escapeHtml(opts.reason)}
<a href="${escapeAttr(opts.unsubscribeUrl)}" style="color:${GREY};">Unsubscribe</a>
·
<a href="${escapeAttr(opts.preferencesUrl)}" style="color:${GREY};">Preferences</a>
${opts.address ? `<br>${escapeHtml(opts.address)}` : ""}
</td></tr>
</table>`;
}
