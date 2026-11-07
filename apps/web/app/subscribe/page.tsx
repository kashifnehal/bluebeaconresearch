import type { Metadata } from "next";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { SubscribeForm } from "@/components/marketing/SubscribeForm";

export const metadata: Metadata = {
  title: "Subscribe | Blue Beacon Research",
  description: "Sign up for The Beacon Weekly, a research email from Blue Beacon Research.",
};

export default function SubscribePage() {
  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge="SUBSCRIBE" />
      <main className="flex-1 max-w-xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          The Beacon Weekly
        </h1>
        <p className="text-xs text-[var(--text-muted)] mb-8 font-mono leading-relaxed">
          A weekly research email summarising the geopolitical events that reached commodity and currency markets.
        </p>
        <SubscribeForm />
      </main>
      <PublicFooter />
    </div>
  );
}
