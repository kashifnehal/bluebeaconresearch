export type FeedbackPayload = {
  message: string;
  email: string | null;
  pageContext: string | null;
};

export type FeedbackParseResult =
  | { ok: true; value: FeedbackPayload }
  | { ok: false; error: string };

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;
const EMAIL_MAX = 320;
const PAGE_CONTEXT_MAX = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseFeedbackBody(body: unknown): FeedbackParseResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_body" };
  }
  const raw = body as Record<string, unknown>;

  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return { ok: false, error: "invalid_message" };
  }

  let email: string | null = null;
  if (typeof raw.email === "string") {
    const trimmed = raw.email.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > EMAIL_MAX || !EMAIL_RE.test(trimmed)) {
        return { ok: false, error: "invalid_email" };
      }
      email = trimmed;
    }
  } else if (raw.email != null) {
    return { ok: false, error: "invalid_email" };
  }

  let pageContext: string | null = null;
  if (typeof raw.pageContext === "string") {
    const trimmed = raw.pageContext.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > PAGE_CONTEXT_MAX) {
        return { ok: false, error: "invalid_page_context" };
      }
      pageContext = trimmed;
    }
  } else if (raw.pageContext != null) {
    return { ok: false, error: "invalid_page_context" };
  }

  return { ok: true, value: { message, email, pageContext } };
}
