"use client";

import { useEffect, useState } from "react";
import { initAnalytics } from "@/lib/analytics";
import { CONSENT_OPEN_EVENT, readConsent, writeConsent } from "@/lib/consent";
import { captureFirstTouch } from "@/lib/first-touch";

const BANNER_TEXT =
  "We use a privacy-focused analytics tool to count visits and see which pages help. It is off until you accept.";

const buttonClass =
  "min-h-[44px] w-full text-xs font-bold uppercase tracking-wider px-4 py-2 rounded";

export function ConsentBanner() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (readConsent()) setOpen(false);
    function onOpen() {
      setOpen(true);
    }
    try {
      window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    } catch {
      return;
    }
    return () => {
      try {
        window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
      } catch {
        // The page must keep working.
      }
    };
  }, []);

  function choose(analytics: boolean) {
    writeConsent(analytics);
    setOpen(false);
    try {
      initAnalytics();
      if (analytics) captureFirstTouch();
    } catch {
      // Analytics must not break the page.
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      data-testid="consent-banner"
      className="fixed bottom-0 inset-x-0 z-50 border-t border-[#2a2a2a] bg-[#0e0e0e] px-4 py-4 md:px-8"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 md:flex-row md:items-center">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed flex-1">{BANNER_TEXT}</p>
        <div className="grid grid-cols-2 gap-3 w-full md:w-[360px] shrink-0">
          <button
            type="button"
            data-testid="consent-decline"
            className={`${buttonClass} border border-[var(--border)] text-[#e5e2e1]`}
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            onClick={() => choose(false)}
          >
            Decline
          </button>
          <button
            type="button"
            data-testid="consent-accept"
            className={`${buttonClass} bg-[var(--accent)] text-black`}
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            onClick={() => choose(true)}
          >
            Accept analytics
          </button>
        </div>
      </div>
    </div>
  );
}
