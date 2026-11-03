"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PublicHeader } from "@/components/layout/PublicHeader";

function ConfirmedBody() {
  const searchParams = useSearchParams();
  const invalid = searchParams.get("state") === "invalid";

  return (
    <main className="flex-1 max-w-xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
      <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {invalid ? "Link no longer valid" : "You're confirmed"}
      </h1>
      <p className="text-sm text-[#e5e2e1] leading-relaxed" data-testid="confirmed-message">
        {invalid
          ? "This confirmation link has already been used or has expired. Sign up again to receive The Beacon Weekly."
          : "You're subscribed to The Beacon Weekly. You can unsubscribe at any time from the link in any issue."}
      </p>
    </main>
  );
}

export default function SubscribeConfirmedPage() {
  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge="SUBSCRIBE" />
      <Suspense fallback={null}>
        <ConfirmedBody />
      </Suspense>
      <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[var(--text-muted)] font-mono">
        Blue Beacon Research — Not investment advice.
      </footer>
    </div>
  );
}
