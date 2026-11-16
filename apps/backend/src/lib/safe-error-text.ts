// BE-DB-RES1 — a Postgres/Supabase outage, a Cloudflare edge failure, or a thrown
// string/number should never surface as "[object Object]" or a multi-KB HTML error
// page in a log line or an alert email. This is the one place that turns any thrown
// value into a short, readable line.

function hasStringMessage(value: unknown): value is { message: string; code?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

export function describeError(err: unknown, maxLen = 300): string {
  let text: string;
  if (err instanceof Error) {
    text = err.message;
  } else if (hasStringMessage(err)) {
    const code = (err as { code?: unknown }).code;
    text = code ? `${code}: ${err.message}` : err.message;
  } else {
    text = String(err);
  }

  const looksLikeHtml =
    text.trimStart().startsWith("<") || /<!DOCTYPE/i.test(text) || /<html/i.test(text);
  if (looksLikeHtml) {
    const codeMatch = text.match(/Error code \d+/i) ?? text.match(/error-5\d\d/i);
    text = codeMatch
      ? `html error page (${text.length} chars) (${codeMatch[0]})`
      : `html error page (${text.length} chars)`;
  }

  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}
