"use client";

import { useEffect, useRef, useState } from "react";
import { Info, MessageCircle, Send, User } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type SendErrorCode =
  | "premium_required"
  | "rate_limited"
  | "ai_temporarily_unavailable"
  | "generic";

const SEND_ERROR_COPY: Record<SendErrorCode, string> = {
  premium_required: "This feature needs a paid plan.",
  rate_limited: "You've hit today's question limit — try again tomorrow.",
  ai_temporarily_unavailable:
    "BBR's AI service is temporarily unavailable — try again shortly",
  generic: "Something went wrong sending that — please try again.",
};

type ClassificationMethod = "claude" | "heuristic" | null | undefined;

/**
 * #111 chat panel — visual/layout pass 2026-09-12.
 * Same backend contract (GET/POST /api/signals/:id/chat). Contrast, type
 * size, composer wrapping, and the heuristic / 503 states are the change.
 * Tokens are the working stitch set (text-on-surface, text-outline, …) —
 * `text-text-secondary` / `text-muted` / `text-bg-app` do not map in
 * tailwind.config.ts and were silently inheriting or colliding.
 */
export function SignalChatPanel({
  signalId,
  classificationMethod,
}: {
  signalId: string;
  classificationMethod?: ClassificationMethod;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<SendErrorCode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingHistory(true);
    setHistoryError(null);

    fetch(`/api/signals/${signalId}/chat`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("history_fetch_failed");
        const json = (await res.json()) as { data?: ChatMessage[] };
        if (!cancelled) setMessages(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setHistoryError("Couldn't load chat history — please reload the page.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signalId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const optimisticUserMessage: ChatMessage = {
      id: `optimistic-user-${Date.now()}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMessage]);
    setInput("");
    setIsSending(true);
    setSendError(null);

    try {
      const res = await fetch(`/api/signals/${signalId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMessage.id));
        if (res.status === 403 || body?.error === "premium_required") {
          setSendError("premium_required");
        } else if (res.status === 429 || body?.error === "rate_limited") {
          setSendError("rate_limited");
        } else if (res.status === 503 || body?.error === "ai_temporarily_unavailable") {
          setSendError("ai_temporarily_unavailable");
        } else {
          setSendError("generic");
        }
        return;
      }

      const json = (await res.json()) as { reply: string };
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: json.reply,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMessage.id));
      setSendError("generic");
    } finally {
      setIsSending(false);
    }
  };

  const showHeuristicNote = classificationMethod === "heuristic";

  return (
    <div className="@container w-full min-w-0 scroll-mt-24" data-testid="signal-chat-panel">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="h-px flex-1 bg-outline-variant/40" aria-hidden />
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-primary-fixed-dim" />
          <span
            className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-fixed-dim"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Ask About This Signal
          </span>
        </div>
        <span className="h-px flex-1 bg-outline-variant/40" aria-hidden />
      </div>

      <div
        className="overflow-hidden rounded-lg border border-outline-variant/25 bg-surface-container-low"
        style={{ boxShadow: "inset 2px 0 0 0 var(--accent)" }}
      >
        {showHeuristicNote && (
          <div
            data-testid="signal-chat-heuristic-note"
            role="status"
            className="flex items-start gap-2.5 border-b border-outline-variant/25 bg-surface-container px-4 py-3 @[400px]:px-5"
          >
            <Info size={14} className="mt-0.5 shrink-0 text-tertiary-fixed-dim" />
            <p className="text-[13px] leading-snug text-on-surface-variant">
              This signal was auto-classified — Claude analysis is temporarily unavailable
            </p>
          </div>
        )}

        <div
          ref={scrollRef}
          data-testid="signal-chat-messages"
          className="max-h-[min(60vh,480px)] min-h-[200px] overflow-y-auto overflow-x-hidden px-4 py-5 space-y-5 @[400px]:px-5"
        >
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 text-primary-fixed-dim text-[11px] font-bold uppercase tracking-widest">
              <span className="material-symbols-outlined text-lg animate-spin">
                progress_activity
              </span>
              Loading conversation
            </div>
          ) : historyError ? (
            <p className="text-sm leading-relaxed text-on-surface-variant">{historyError}</p>
          ) : messages.length === 0 ? (
            <div
              className="flex min-h-[160px] flex-col items-start justify-center gap-3 py-4"
              data-testid="signal-chat-empty-state"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container"
                aria-hidden
              >
                <MessageCircle size={16} className="text-primary-fixed-dim" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[15px] font-medium leading-snug text-on-surface">
                  Ask a question about this briefing
                </p>
                <p className="text-[13px] leading-relaxed text-on-surface-variant">
                  Follow-ups stay grounded in the source above — what happened, why it
                  was flagged, and which instruments were named.
                </p>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex min-w-0 gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div
                    className="mt-0.5 hidden h-7 w-7 shrink-0 items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container @[320px]:flex"
                    aria-hidden
                  >
                    <MessageCircle size={12} className="text-primary-fixed-dim" />
                  </div>
                )}
                <div
                  className={`min-w-0 max-w-[min(100%,36rem)] rounded-md px-3.5 py-3 text-[14px] leading-[1.65] whitespace-pre-wrap @[400px]:max-w-[85%] ${
                    m.role === "user"
                      ? "border border-primary-fixed-dim/25 bg-primary-fixed-dim/10 text-on-surface"
                      : "border border-outline-variant/20 bg-surface-container text-on-surface"
                  }`}
                >
                  {m.content}
                </div>
                {m.role === "user" && (
                  <div
                    className="mt-0.5 hidden h-7 w-7 shrink-0 items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container @[320px]:flex"
                    aria-hidden
                  >
                    <User size={12} className="text-outline" />
                  </div>
                )}
              </div>
            ))
          )}

          {isSending && (
            <div
              data-testid="signal-chat-loading"
              className="flex items-center gap-2 text-primary-fixed-dim text-[11px] font-bold uppercase tracking-widest"
            >
              <span className="material-symbols-outlined text-lg animate-spin">
                progress_activity
              </span>
              Thinking
            </div>
          )}
        </div>

        <div className="border-t border-outline-variant/25 bg-surface-container/50 px-4 py-4 space-y-3 @[400px]:px-5">
          {sendError && (
            <p
              data-testid="signal-chat-error"
              role="alert"
              className="rounded-md border border-error/30 bg-error-container/40 px-3 py-2.5 text-[13px] font-medium leading-snug text-error"
            >
              {SEND_ERROR_COPY[sendError]}
            </p>
          )}

          <div className="flex min-w-0 flex-col gap-2 @[420px]:flex-row @[420px]:items-stretch">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isSending}
              placeholder="Ask a question about this signal…"
              className="min-w-0 flex-1 h-11 rounded-md border border-outline-variant/40 bg-surface-container-lowest px-3.5 text-[14px] text-on-surface placeholder:text-outline outline-none focus:border-primary-fixed-dim/60 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || !input.trim()}
              aria-label="Send"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary-container px-4 text-[12px] font-bold uppercase tracking-[0.12em] text-surface-container-lowest disabled:opacity-40 @[420px]:w-auto w-full"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <Send size={14} />
              Send
            </button>
          </div>

          {/* Always-visible disclaimer — not a one-time tooltip. Must render
             whenever the panel is open, per #111 spec. Designed as a footer
             strip (Intercom Fin), not a 10px caption bolted under the input. */}
          <div className="flex items-start gap-2 pt-1">
            <Info size={12} className="mt-0.5 shrink-0 text-outline" aria-hidden />
            <p className="text-[12px] leading-relaxed text-on-surface-variant">
              This assistant explains the signal only — it can&apos;t give personalized
              investment advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
