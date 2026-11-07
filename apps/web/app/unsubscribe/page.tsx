"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";

type Status = "idle" | "submitting" | "done" | "error";

function UnsubscribeBody() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? "";
  const [status, setStatus] = useState<Status>("idle");

  async function onUnsubscribe() {
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      const res = await fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`, { method: "POST" });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="flex-1 max-w-xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
      <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Unsubscribe
      </h1>
      {status === "done" || status === "error" ? (
        <p className="text-sm text-[#e5e2e1] leading-relaxed" data-testid="unsubscribe-message">
          You have been unsubscribed.
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--text-muted)] mb-6 font-mono leading-relaxed">
            Stop receiving The Beacon Weekly.
          </p>
          <button
            type="button"
            onClick={onUnsubscribe}
            disabled={status === "submitting"}
            data-testid="unsubscribe-button"
            className="bg-[var(--accent)] text-black text-xs font-bold uppercase tracking-wider px-5 py-3 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Unsubscribe
          </button>
        </>
      )}
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge="UNSUBSCRIBE" />
      <Suspense fallback={null}>
        <UnsubscribeBody />
      </Suspense>
      <PublicFooter />
    </div>
  );
}
