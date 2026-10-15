import type { Metadata } from "next";
import { PublicHeader } from "@/components/layout/PublicHeader";

export const metadata: Metadata = {
  title: "About | Blue Beacon Research",
  description:
    "Blue Beacon Research is an AI-powered research platform that converts geopolitical events into structured market signals for commodity traders.",
};

// Same three steps as the homepage feature grid (app/page.tsx).
const STEPS = [
  {
    title: "01. Event Detection",
    body: "Public sources, including GDELT, news APIs and RSS feeds, are scanned on a regular collector schedule and turned into structured events.",
  },
  {
    title: "02. Research Assessment",
    body: "Each event is classified for market relevance and mapped to the commodities and currency pairs it may affect — with uncertainty stated.",
  },
  {
    title: "03. Alerts",
    body: "Optional notifications when a new signal matches the markets and regions you follow.",
  },
] as const;

export default function AboutPage() {
  return (
    <div
      className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <PublicHeader badge="ABOUT" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
        <h1
          className="text-2xl font-bold text-white mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          About
        </h1>
        <p className="text-xs text-[var(--text-muted)] mb-8 font-mono leading-relaxed">
          Blue Beacon Research is an AI-powered research platform. It converts global events — conflicts,
          sanctions, and policy shifts — into structured market signals scored by severity and commodity market
          impact, for commodity traders, analysts, and businesses with market exposure.
        </p>

        <section className="space-y-3 mb-10">
          <h2
            className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            How it works
          </h2>
          <ul className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-5">
            {STEPS.map((step) => (
              <li key={step.title} className="text-sm text-[var(--text-secondary)] leading-relaxed">
                <span className="text-[#e5e2e1]">{step.title}. </span>
                {step.body}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 mb-10">
          <h2
            className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            No investment advice
          </h2>
          <p className="text-sm text-[#e5e2e1] leading-relaxed">
            Blue Beacon Research provides informational geopolitical intelligence signals. Nothing in this product
            constitutes investment advice.
          </p>
        </section>

        <section className="space-y-3">
          <h2
            className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Contact
          </h2>
          <p className="text-sm text-[#e5e2e1] leading-relaxed">
            <a href="mailto:support@bluebeaconresearch.com" className="text-[var(--accent)] hover:underline">
              support@bluebeaconresearch.com
            </a>
          </p>
        </section>
      </main>

      <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[var(--text-muted)] font-mono">
        Blue Beacon Research — Not investment advice.
      </footer>
    </div>
  );
}
