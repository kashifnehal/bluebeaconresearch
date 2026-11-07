"use client";

import { useState, type FormEvent } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { NEWSLETTER_CONSENT } from "@/lib/consent-copy";
import { readSubmitAttribution } from "@/lib/first-touch";
import { trackFunnelEvent } from "@/lib/funnel-events";

type Status = "idle" | "submitting" | "success" | "error";

const UNAVAILABLE_MESSAGE = "Sign-up is not available right now. Please try again later.";

// Placed on the homepage by WEB-M3. Posts to POST /api/subscribe
// (app/api/subscribe/route.ts), which sends the confirmation email.
export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consent || status === "submitting") return;
    setStatus("submitting");
    setErrorText(null);
    trackFunnelEvent("subscribe_submitted");
    try {
      const firstTouch = readSubmitAttribution();
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          consent,
          t: renderedAt,
          source: {
            path: typeof window !== "undefined" && window.location ? window.location.pathname : undefined,
            ...firstTouch,
          },
        }),
      });
      if (!res.ok) {
        setStatus("error");
        setErrorText(UNAVAILABLE_MESSAGE);
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorText(UNAVAILABLE_MESSAGE);
    }
  }

  if (status === "success") {
    return (
      <p className="text-sm text-[var(--accent)] font-mono" data-testid="subscribe-success">
        Check your email to confirm your sign-up.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-sm">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 bg-[var(--bg-primary)] border border-[var(--border)] text-[#e5e2e1] text-sm px-3 py-2 rounded font-mono outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={!consent || status === "submitting"}
          data-testid="subscribe-submit"
          className="shrink-0 bg-[var(--accent)] text-black text-xs font-bold uppercase tracking-wider px-4 py-2 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Get The Beacon Weekly
        </button>
      </div>
      <Checkbox
        id="newsletter-consent"
        label={NEWSLETTER_CONSENT}
        checked={consent}
        onChange={setConsent}
        data-testid="newsletter-consent-checkbox"
      />
      {errorText ? (
        <p className="text-xs text-[#ffb4ab] font-mono" data-testid="subscribe-error">
          {errorText}
        </p>
      ) : null}
    </form>
  );
}
