import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";

export const metadata: Metadata = {
  title: "Research Standard | Blue Beacon Research",
  description:
    "How Blue Beacon Research writes an assessment, and how you can check each point on the page itself.",
};

const POINTS = [
  {
    heading: "Sources are linked.",
    body: "Each assessment lists the reports and official pages it rests on, with the publisher and the publication time in UTC.",
  },
  {
    heading: "Two times are shown.",
    body: "Every assessment shows the event time and the assessed time, both in UTC.",
  },
  {
    heading: "One report is counted as one report.",
    body: "When several outlets carry the same wire story, the assessment says it is one report, not several.",
  },
  {
    heading: "What a source says is kept apart from our reading.",
    body: "Statements that rest on an anonymous source or a single source are marked, and the section called What is uncertain says what was not independently verified.",
  },
  {
    heading: "Exposure is a reading, not a forecast.",
    body: "The Exposure section names the market and the route, and says in words that it is BBR's reading of the mechanism and not a price forecast.",
  },
  {
    heading: "We say what we did not check.",
    body: "Where BBR has not checked a primary data set directly, the assessment says so.",
  },
  {
    heading: "No position advice.",
    body: "Assessments do not recommend a position, a size, or an entry or exit.",
  },
  {
    heading: "Corrections are logged.",
    body: "When a published statement is wrong, we fix it and record the date, what was wrong and what changed on the Corrections page.",
  },
] as const;

export default function ResearchStandardPage() {
  return (
    <div
      className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <PublicHeader badge="RESEARCH STANDARD" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
        <h1
          className="text-2xl font-bold text-white mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Research Standard
        </h1>
        <p className="text-xs text-[var(--text-muted)] mb-8 font-mono leading-relaxed">
          How Blue Beacon Research writes an assessment, and how you can check each point on the page itself. This
          standard applies to the assessments listed on the Assessments page.
        </p>

        <ol className="list-decimal space-y-4 pl-5 mb-10 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-5">
          {POINTS.map((point) => (
            <li key={point.heading} className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[#e5e2e1]">{point.heading}</strong> {point.body}
            </li>
          ))}
        </ol>

        <p className="text-sm text-[#e5e2e1] leading-relaxed mb-10">
          Method and limits:{" "}
          <Link href="/how-it-works" className="text-[var(--accent)] hover:underline">
            How it works
          </Link>
          . Report an error:{" "}
          <Link href="/corrections" className="text-[var(--accent)] hover:underline">
            Corrections
          </Link>
          .
        </p>

        <p className="text-xs text-[var(--text-muted)] font-mono">
          Informational research, not investment advice. Sources and dates are shown on each item.
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
