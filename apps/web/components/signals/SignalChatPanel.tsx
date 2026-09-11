"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, User } from "lucide-react";

import { Button } from "@/components/ui/button";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type SendErrorCode = "premium_required" | "rate_limited" | "generic";

const SEND_ERROR_COPY: Record<SendErrorCode, string> = {
  premium_required: "This feature needs a paid plan.",
  rate_limited: "You've hit today's question limit — try again tomorrow.",
  generic: "Something went wrong sending that — please try again.",
};

/**
 * #111 (frontend half) — chat panel for asking follow-up questions about a
 * single signal. Talks only to /api/signals/:id/chat (a same-origin Next.js
 * route that forwards the caller's Supabase session to the apps/backend
 * endpoints added in the previous commit) — never calls the backend directly
 * and never sends any data beyond this one signal's id.
 *
 * Styling matches the surrounding event detail page (CSS custom properties —
 * --border-subtle / --bg-app / text-accent / text-muted / text-text-primary,
 * Space Grotesk section labels) rather than inventing a new visual language.
 * The loading indicator reuses the exact spinner pattern already shipped for
 * #108's Backtesting Lab this batch (material-symbols-outlined `progress_activity`
 * + animate-spin, uppercase tracking-widest label) — see LoadMoreButton.tsx /
 * backtesting/page.tsx for the same pattern elsewhere in this app.
 */
export function SignalChatPanel({ signalId }: { signalId: string }) {
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
        // Roll back the optimistic message — the backend rejected the request
        // before persisting anything, so nothing was actually saved.
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMessage.id));
        if (res.status === 403 || body?.error === "premium_required") {
          setSendError("premium_required");
        } else if (res.status === 429 || body?.error === "rate_limited") {
          setSendError("rate_limited");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageCircle size={14} className="text-accent" />
        <span
          className="text-[10px] font-black uppercase tracking-[0.2em] text-accent"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Ask About This Signal
        </span>
      </div>

      <div
        className="rounded-lg bg-surface/40 border overflow-hidden"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div
          ref={scrollRef}
          data-testid="signal-chat-messages"
          className="max-h-[420px] min-h-[160px] overflow-y-auto p-6 space-y-4"
        >
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 text-accent text-[10px] font-black uppercase tracking-widest">
              <span className="material-symbols-outlined text-lg animate-spin">
                progress_activity
              </span>
              Loading conversation
            </div>
          ) : historyError ? (
            <p className="text-xs text-text-secondary">{historyError}</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted" data-testid="signal-chat-empty-state">
              Ask a question about this signal to get started.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-accent/10 border"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <MessageCircle size={12} className="text-accent" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-accent/10 text-text-primary border border-accent/20"
                      : "bg-surface/60 text-text-secondary border"
                  }`}
                  style={m.role === "assistant" ? { borderColor: "var(--border-subtle)" } : undefined}
                >
                  {m.content}
                </div>
                {m.role === "user" && (
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-surface border"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <User size={12} className="text-muted" />
                  </div>
                )}
              </div>
            ))
          )}

          {isSending && (
            <div
              data-testid="signal-chat-loading"
              className="flex items-center gap-2 text-accent text-[10px] font-black uppercase tracking-widest"
            >
              <span className="material-symbols-outlined text-lg animate-spin">
                progress_activity
              </span>
              Thinking
            </div>
          )}
        </div>

        <div className="border-t p-4 space-y-3" style={{ borderColor: "var(--border-subtle)" }}>
          {sendError && (
            <p
              data-testid="signal-chat-error"
              className="text-xs font-bold text-error"
            >
              {SEND_ERROR_COPY[sendError]}
            </p>
          )}

          <div className="flex items-center gap-2">
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
              className="flex-1 h-10 bg-surface/60 border rounded-sm px-3 text-sm text-text-primary placeholder:text-muted outline-none focus:border-accent/50 disabled:opacity-50"
              style={{ borderColor: "var(--border-subtle)" }}
            />
            <Button
              onClick={handleSend}
              disabled={isSending || !input.trim()}
              className="h-10 bg-accent text-bg-app text-[9px] font-black uppercase tracking-widest rounded-sm px-4 disabled:opacity-40"
            >
              <Send size={14} className="mr-2" /> Send
            </Button>
          </div>

          {/* Always-visible disclaimer — not a one-time tooltip. Must render
             whenever the panel is open, per #111 spec. */}
          <p className="text-[10px] text-muted leading-relaxed">
            This assistant explains the signal only — it can't give personalized investment advice.
          </p>
        </div>
      </div>
    </div>
  );
}
