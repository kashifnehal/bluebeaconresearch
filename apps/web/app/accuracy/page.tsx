import Link from "next/link";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { LegalDisclaimerFooter } from "@/components/layout/LegalDisclaimerFooter";

const PAGE_DESCRIPTION =
  "What BBR records on every item, and the standard it uses before publishing performance statistics.";

export const metadata = {
  title: "Accuracy | Blue Beacon Research",
  description: PAGE_DESCRIPTION,
};

const RECORDED_ITEMS = [
  "The source and a link to the original report.",
  "When the source published it.",
  "When BBR fetched it.",
  "When BBR flagged it.",
];

export function AccuracyReport() {
  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge="ACCURACY" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-8 py-16">
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          How BBR works and how to check it
        </h1>

        <div className="p-5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg mb-10">
          <p className="text-sm text-[#e5e2e1] leading-relaxed" data-testid="accuracy-intro">
            Every item on BBR links to its source and shows the times behind it. This page
            explains what we record and the standard we use before we publish any performance
            statistic.
          </p>
        </div>

        <section className="space-y-3 mb-10">
          <h2
            className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            What we record on every item
          </h2>
          <ul
            className="rounded-lg border border-[var(--border)] divide-y divide-[#2a2a2a] px-4"
            data-testid="accuracy-recorded-items"
          >
            {RECORDED_ITEMS.map((item) => (
              <li key={item} className="py-3 font-mono text-sm text-[#e5e2e1]">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 mb-10">
          <h2
            className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Our publication standard
          </h2>
          <p className="text-sm text-[#e5e2e1] leading-relaxed" data-testid="accuracy-publication-standard">
            We publish a performance statistic only when the sample, the period, the thresholds
            and the baseline are stated, and a pre-declared test shows a result above the plain
            baseline.
          </p>
        </section>

        <section className="space-y-3 mb-10">
          <h2
            className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Method
          </h2>
          <p className="text-sm text-[#e5e2e1] leading-relaxed" data-testid="accuracy-method">
            The classification method is described on the{" "}
            <Link href="/how-it-works" className="text-[var(--accent)] hover:underline">
              How It Works
            </Link>{" "}
            page.
          </p>
        </section>

        <section className="space-y-3" data-testid="accuracy-corrections">
          <h2
            className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Corrections
          </h2>
          <p className="text-sm text-[#e5e2e1] leading-relaxed">
            Mistakes are logged and dated. See the{" "}
            <Link href="/corrections" className="text-[var(--accent)] hover:underline">
              corrections log
            </Link>
            .
          </p>
        </section>
      </main>

      <PublicFooter />
      <LegalDisclaimerFooter />
    </div>
  );
}

export default function AccuracyPage() {
  return <AccuracyReport />;
}
