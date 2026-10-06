// GAP: 400 characters (about 100 tokens at the common 4 characters per token rule of thumb, not measured here) is a design choice, not a researched value. Measured 2026-10-06 over 3 days of raw_events: RSS summary median 338 characters, 90th percentile 630; GNews median 158, 90th percentile 436; GDELT has none. Revisit after the cost per call is measured.
export const SNIPPET_MAX_CHARS = 400;

const ENTITY_DECODE: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": "\u00A0",
};

/**
 * Clean a publisher-feed summary for the classifier user prompt.
 * Returns null when the text is too short to add anything the title
 * does not already say, including every GDELT item (no summary stored).
 */
export function buildClassifierSnippet(
  title: string,
  summary: unknown,
  maxChars: number = SNIPPET_MAX_CHARS,
): string | null {
  let text = String(summary ?? "");
  text = text.replace(/<[^>]*>/g, "");
  text = text.replace(
    /&(?:amp|lt|gt|quot|#39|nbsp);/g,
    (entity) => ENTITY_DECODE[entity] ?? entity,
  );
  text = text.replace(/[\u0000-\u001F\u007F]/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  if (text.length < 20) return null;

  const comparable = text.toLowerCase().trim();
  const comparableTitle = title.toLowerCase().trim();
  if (comparable === comparableTitle) return null;
  if (comparableTitle.length > 0 && comparable.startsWith(comparableTitle)) {
    const rest = comparable.slice(comparableTitle.length);
    if (rest.length < 20) return null;
  }

  text = text.replace(/"""/g, "'''");

  if (text.length > maxChars) {
    const window = text.slice(0, maxChars);
    const lastSpace = window.lastIndexOf(" ");
    const cutAt = lastSpace > 0 ? lastSpace : maxChars;
    text = `${text.slice(0, cutAt)}…`;
  }

  return text;
}
