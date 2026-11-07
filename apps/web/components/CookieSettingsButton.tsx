"use client";

import { openConsentSettings } from "@/lib/consent";

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} data-testid="cookie-settings" onClick={openConsentSettings}>
      Cookie settings
    </button>
  );
}
