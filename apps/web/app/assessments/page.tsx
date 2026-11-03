import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { getPublishedAssessments, type PublicAssessment } from "@/lib/public-assessments";

export const revalidate = 300;

type Deps = { getAssessments: typeof getPublishedAssessments };

function formatUTC(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export async function generateMetadata(): Promise<Metadata> {
  return buildAssessmentsListMetadata();
}

// Next's typed-route check requires generateMetadata/the page's default export to match its
// exact generated signature, so the injectable-deps parameter lives on separately exported
// functions instead (same reason as lib/*-handler.ts's `override?` pattern, just kept off the
// framework-special exports themselves).
export async function buildAssessmentsListMetadata(deps?: Partial<Deps>): Promise<Metadata> {
  const getAssessments = deps?.getAssessments ?? getPublishedAssessments;
  const items = await getAssessments();
  return {
    title: "Assessments | Blue Beacon Research",
    description: "Public research assessments from Blue Beacon Research.",
    robots: items.length > 0 ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function AssessmentsPage() {
  return renderAssessmentsList();
}

export async function renderAssessmentsList(deps?: Partial<Deps>) {
  const getAssessments = deps?.getAssessments ?? getPublishedAssessments;
  const items: PublicAssessment[] = await getAssessments();

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge="ASSESSMENTS" />
      <main className="flex-1 max-w-3xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Assessments
        </h1>
        <p className="text-xs text-[var(--text-muted)] mb-8 font-mono leading-relaxed">
          Dated, sourced research assessments. Each one shows what happened, which markets it may touch and why, and
          what is still uncertain.
        </p>

        {items.length === 0 ? (
          <p data-testid="assessments-empty" className="text-sm text-[#e5e2e1] leading-relaxed">
            No public assessments are published yet.
          </p>
        ) : (
          <ul data-testid="assessments-list" className="space-y-4">
            {items.map((a) => (
              <li
                key={a.slug}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-5"
                data-testid="assessment-list-item"
              >
                <Link
                  href={`/assessments/${a.slug}`}
                  className="text-base font-bold text-white hover:underline"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {a.headline}
                </Link>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-2">{a.summary}</p>
                <p className="text-xs text-[var(--text-muted)] font-mono mt-3">
                  {a.markets.length > 0 ? `${a.markets.join(", ")} · ` : ""}Assessed: {formatUTC(a.assessedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[var(--text-muted)] font-mono">
        Blue Beacon Research — Not investment advice.
      </footer>
    </div>
  );
}
