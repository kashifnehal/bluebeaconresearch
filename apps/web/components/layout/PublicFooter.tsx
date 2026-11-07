"use client";

import { CookieSettingsButton } from "@/components/ConsentBanner";

export function PublicFooter() {
  return (
    <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[var(--text-muted)] font-mono">
      Blue Beacon Research — Not investment advice.{" "}
      <CookieSettingsButton className="underline hover:text-[var(--text-secondary)] min-h-[44px] inline-flex items-center bg-transparent border-0 p-0 font-mono text-xs text-[var(--text-muted)]" />
    </footer>
  );
}
