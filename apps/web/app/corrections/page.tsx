import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { CORRECTIONS, PUBLISHED_ASSESSMENT_CORRECTIONS } from "@/lib/corrections-log";

export const metadata: Metadata = {
  title: "Corrections | Blue Beacon Research",
  description:
    "If you find an error in an assessment or anywhere on this site, write to support@bluebeaconresearch.com with the page link and what is wrong.",
};

function publishedAssessmentCorrectionCount(count: number): string {
  return count === 0 ? "none" : String(count);
}

export default function CorrectionsPage() {
  return (
    <div
      className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <PublicHeader badge="CORRECTIONS" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
        <h1
          className="text-2xl font-bold text-white mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Corrections
        </h1>
        <p className="text-xs text-[var(--text-muted)] mb-8 font-mono leading-relaxed">
          If you find an error in an assessment or anywhere on this site, write to{" "}
          <a href="mailto:support@bluebeaconresearch.com" className="text-[var(--accent)] hover:underline">
            support@bluebeaconresearch.com
          </a>{" "}
          with the page link and what is wrong. We check it against the source. If it is wrong, we fix the page and
          add an entry below.
        </p>

        <p className="text-sm text-[#e5e2e1] leading-relaxed mb-8">
          Corrections to published assessments as of 8 November 2026:{" "}
          {publishedAssessmentCorrectionCount(PUBLISHED_ASSESSMENT_CORRECTIONS)}
        </p>

        {CORRECTIONS.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-10">No corrections yet.</p>
        ) : (
          <div className="space-y-6 mb-10">
            {CORRECTIONS.map((entry) => (
              <article
                key={`${entry.date}-${entry.where}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-5 space-y-3"
              >
                <p className="text-xs font-mono text-[var(--text-muted)]">{entry.date}</p>
                <p className="text-sm text-[#e5e2e1] leading-relaxed">{entry.where}</p>
                <h2
                  className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  What was wrong
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{entry.wasWrong}</p>
                <h2
                  className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  What changed
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{entry.changed}</p>
              </article>
            ))}
          </div>
        )}

        <p className="text-sm text-[#e5e2e1]">
          <Link href="/research-standard" className="text-[var(--accent)] hover:underline">
            Research Standard
          </Link>
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
