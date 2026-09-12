export const CITED_SOURCES_MARKER = "---SOURCES---";

const URL_LINE = /^https?:\/\/\S+$/i;

export function parseCitedChatReply(text: string): { answer: string; sources: string[] } {
  const raw = String(text ?? "");
  const idx = raw.lastIndexOf(CITED_SOURCES_MARKER);
  if (idx === -1) return { answer: raw.trim(), sources: [] };
  const answer = raw.slice(0, idx).trim();
  const sources = raw
    .slice(idx + CITED_SOURCES_MARKER.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => URL_LINE.test(line));
  return { answer, sources };
}

export function sanitizeCitedChatReply(text: string, allowedUrls: string[]): string {
  const allowed = new Set(allowedUrls.filter((u) => typeof u === "string" && URL_LINE.test(u.trim())));
  const parsed = parseCitedChatReply(text);
  const kept = parsed.sources.filter((url) => allowed.has(url));
  if (kept.length === 0) return parsed.answer;
  return `${parsed.answer}\n\n${CITED_SOURCES_MARKER}\n${kept.join("\n")}`;
}
