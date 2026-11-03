import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { getPublishedAssessmentBySlug, type PublicAssessment } from "@/lib/public-assessments";
import { SITE_ORIGIN } from "@/lib/site-metadata";

export const revalidate = 300;

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Deps = { getAssessment: typeof getPublishedAssessmentBySlug };

function formatUTC(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function carryUtm(path: string, sp: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key.startsWith("utm_") && typeof value === "string" && value.length > 0) qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return buildAssessmentMetadata(slug);
}

// Next's typed-route check requires generateMetadata/the page's default export to match its
// exact generated signature, so the injectable-deps parameter tests need lives on separately
// exported functions instead (same reason as lib/*-handler.ts's `override?` pattern, just kept
// off the framework-special exports themselves).
export async function buildAssessmentMetadata(slug: string, deps?: Partial<Deps>): Promise<Metadata> {
  const getAssessment = deps?.getAssessment ?? getPublishedAssessmentBySlug;
  const assessment = await getAssessment(slug);
  if (!assessment) return {};

  const url = `${SITE_ORIGIN}/assessments/${assessment.slug}`;
  return {
    title: `${assessment.headline} | Blue Beacon Research`,
    description: assessment.summary,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      siteName: "Blue Beacon Research",
      title: assessment.headline,
      description: assessment.summary,
    },
    twitter: {
      card: "summary_large_image",
      title: assessment.headline,
      description: assessment.summary,
    },
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 mb-8" data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <h2
        className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function AssessmentDetail({ assessment, searchParams }: { assessment: PublicAssessment; searchParams: Record<string, string | string[] | undefined> }) {
  const link = (path: string) => carryUtm(path, searchParams);

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge="ASSESSMENT" />
      <main className="flex-1 max-w-3xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
        <h1
          data-testid="assessment-headline"
          className="text-2xl font-bold text-white mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {assessment.headline}
        </h1>
        <p data-testid="assessment-meta" className="text-xs text-[var(--text-muted)] font-mono mb-4">
          {assessment.eventTime ? `Event: ${formatUTC(assessment.eventTime)} · ` : ""}
          Assessed: {formatUTC(assessment.assessedAt)}
        </p>
        <p data-testid="assessment-summary" className="text-sm text-[#e5e2e1] leading-relaxed mb-8">
          {assessment.summary}
        </p>

        <Section title="Event">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{assessment.body.what_happened}</p>
        </Section>

        <Section title="Exposure">
          <table data-testid="exposure-table" className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="text-[var(--text-muted)] text-xs uppercase">
                <th className="pr-4 pb-2">Market</th>
                <th className="pr-4 pb-2">Mechanism</th>
                <th className="pb-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {assessment.body.exposure.map((e, i) => (
                <tr key={`${e.market}-${i}`} className="border-t border-[var(--border)]">
                  <td className="pr-4 py-2 align-top">{e.market}</td>
                  <td className="pr-4 py-2 align-top">{e.mechanism}</td>
                  <td className="py-2 align-top text-[var(--text-secondary)]">{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Evidence">
          <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text-secondary)]">
            {assessment.body.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Section>

        <Section title="What is uncertain">
          <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text-secondary)]">
            {assessment.body.uncertainty.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Section>

        <Section title="What to watch">
          <table data-testid="watch-table" className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="text-[var(--text-muted)] text-xs uppercase">
                <th className="pr-4 pb-2">Date</th>
                <th className="pr-4 pb-2">Item</th>
                <th className="pb-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {assessment.body.what_to_watch.map((w, i) => (
                <tr key={`${w.item}-${i}`} className="border-t border-[var(--border)]">
                  <td className="pr-4 py-2 align-top whitespace-nowrap">{w.date}</td>
                  <td className="pr-4 py-2 align-top">{w.item}</td>
                  <td className="py-2 align-top text-[var(--text-secondary)]">{w.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Sources">
          <ul data-testid="sources-list" className="space-y-2 text-sm text-[var(--text-secondary)]">
            {assessment.sources.map((s, i) => (
              <li key={`${s.url}-${i}`}>
                {s.publisher} —{" "}
                <a href={s.url} rel="noopener noreferrer" target="_blank" className="text-[var(--accent)] hover:underline">
                  {s.title}
                </a>{" "}
                ({formatUTC(s.published_at)})
              </li>
            ))}
          </ul>
        </Section>

        <p data-testid="assessment-footer" className="text-xs text-[var(--text-muted)] font-mono mb-10">
          Informational research, not investment advice. Sources and dates are shown on each item.
        </p>

        <div data-testid="assessment-cta" className="flex flex-col sm:flex-row gap-4 sm:items-center">
          <Link
            href={link("/walkthrough")}
            data-testid="cta-walkthrough"
            className="bg-[var(--accent)] text-black text-xs font-bold uppercase tracking-wider px-5 py-3 rounded text-center"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Request a walkthrough of your markets
          </Link>
          <Link href={link("/signup")} data-testid="cta-signup" className="text-xs text-[var(--accent)] hover:underline">
            Set your markets (free)
          </Link>
          <Link href={link("/subscribe")} data-testid="cta-subscribe" className="text-xs text-[var(--accent)] hover:underline">
            Get The Beacon Weekly
          </Link>
        </div>
      </main>
      <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[var(--text-muted)] font-mono">
        Blue Beacon Research — Not investment advice.
      </footer>
    </div>
  );
}

export default async function AssessmentDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  return renderAssessmentDetail(slug, sp);
}

export async function renderAssessmentDetail(
  slug: string,
  searchParams: Record<string, string | string[] | undefined>,
  deps?: Partial<Deps>,
) {
  const getAssessment = deps?.getAssessment ?? getPublishedAssessmentBySlug;
  const assessment = await getAssessment(slug);
  if (!assessment) notFound();

  return <AssessmentDetail assessment={assessment} searchParams={searchParams} />;
}
