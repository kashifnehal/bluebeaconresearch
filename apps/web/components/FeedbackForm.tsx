"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { ACCOUNT_CONNECT_ERROR, GENERIC_REQUEST_ERROR } from "@/lib/user-error-copy";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function FeedbackForm() {
  const pathname = usePathname();
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      const sessionEmail = data.user?.email;
      if (sessionEmail) setEmail((current) => current || sessionEmail);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          email: email.trim() || undefined,
          pageContext: pathname || undefined,
        }),
      });
      if (res.status === 401) {
        toast.error(ACCOUNT_CONNECT_ERROR);
        return;
      }
      if (!res.ok) {
        toast.error(GENERIC_REQUEST_ERROR);
        return;
      }
      setSubmitted(true);
      setMessage("");
      toast.success("Feedback received — thank you.");
    } catch {
      toast.error(GENERIC_REQUEST_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="feedback-message"
          className="font-label text-[12px] md:text-[10px] tracking-widest text-on-surface-variant uppercase font-extrabold"
        >
          Message
        </label>
        <textarea
          id="feedback-message"
          required
          minLength={10}
          maxLength={4000}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What broke, what was confusing, or what you expected instead."
          className="w-full bg-surface-container-lowest border border-outline-variant/30 p-3 font-mono text-sm text-on-surface focus:border-primary focus:outline-none resize-y min-h-[120px]"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="feedback-email"
          className="font-label text-[12px] md:text-[10px] tracking-widest text-on-surface-variant uppercase font-extrabold"
        >
          Email (optional)
        </label>
        <input
          id="feedback-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="w-full bg-surface-container-lowest border-b border-outline-variant p-3 font-mono text-sm text-on-surface focus:border-primary focus:outline-none"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="feedback-page"
          className="font-label text-[12px] md:text-[10px] tracking-widest text-on-surface-variant uppercase font-extrabold"
        >
          Page
        </label>
        <input
          id="feedback-page"
          readOnly
          value={pathname || "/help"}
          className="w-full bg-surface-container-lowest border-b border-outline-variant p-3 font-mono text-sm text-on-surface-variant cursor-not-allowed outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={submitting || submitted}
        className={`bg-primary hover:bg-primary-container text-black px-8 py-3 font-label text-xs font-bold tracking-widest rounded-sm transition-all ${
          submitting || submitted ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {submitted ? "SENT" : submitting ? "SENDING…" : "SEND FEEDBACK"}
      </button>
    </form>
  );
}
