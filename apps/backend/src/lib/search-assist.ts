export type RetrievedSearchDoc = {
  contentKey: string;
  title: string;
  url: string;
  content: string;
  sourceKind: string;
  similarity: number;
};

export const SEARCH_ASSIST_NO_ANSWER = "NO_ANSWER";

export function pickConfidentMatch(
  rows: RetrievedSearchDoc[] | null | undefined,
  threshold: number,
): RetrievedSearchDoc | null {
  const top = rows?.[0];
  if (!top) return null;
  if (!Number.isFinite(top.similarity) || top.similarity < threshold) return null;
  if (!top.url.startsWith("/") || top.url.startsWith("//")) return null;
  return top;
}

export function parseSearchAssistAnswer(
  raw: string,
  allowedUrl: string,
): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? "";
  if (/^NO_ANSWER\b/i.test(firstLine) || /^NO_ANSWER\b/i.test(text)) return null;
  // One sentence: take the first sentence-like chunk, keep it short.
  const sentence = (text.match(/^[^.!?\n]+[.!?]?/)?.[0] ?? text).trim();
  if (sentence.length < 8) return null;
  if (!sentence.includes(allowedUrl)) {
    return `${sentence.replace(/[.!?]?$/, "")} ${allowedUrl}.`.replace(/\s+/g, " ");
  }
  return sentence;
}
