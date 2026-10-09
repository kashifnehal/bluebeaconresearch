export const metadata = {
  title: "Terms — Blue Beacon Research",
  description: "Blue Beacon Research terms of service.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-on-surface p-12">
      <div className="max-w-2xl mx-auto space-y-12">
        <h1 className="text-4xl font-headline font-extrabold tracking-tighter text-white">
          Terms of Service
        </h1>

        <section className="space-y-6">
          <h2 className="text-xl font-headline font-extrabold tracking-tighter text-white">
            About the service
          </h2>
          <p className="text-on-surface/60 leading-relaxed font-medium">
            Blue Beacon Research is an AI-powered research platform. It publishes
            informational geopolitical intelligence signals drawn from public
            reporting.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-headline font-extrabold tracking-tighter text-white">
            No investment advice
          </h2>
          <p className="text-on-surface/60 leading-relaxed font-medium">
            Blue Beacon Research provides informational geopolitical
            intelligence signals. Nothing in this product constitutes investment
            advice.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-headline font-extrabold tracking-tighter text-white">
            Limitation of liability
          </h2>
          <p className="text-on-surface/60 leading-relaxed font-medium font-mono text-xs uppercase tracking-widest bg-surface-container p-6 rounded-xl border border-outline-variant/10">
            To the maximum extent permitted by applicable law, Blue Beacon
            Research and its affiliates shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss
            of profits or revenue, arising from your use of the service. In no
            event shall Blue Beacon Research&apos;s total aggregate liability arising
            out of or relating to these terms or your use of the service exceed
            the greater of (a) the amount you paid to Blue Beacon Research in
            the twelve (12) months preceding the claim, or (b) one hundred U.S.
            dollars ($100).
            <br />
            <br />
            You are responsible for your own trading decisions and risk
            management. Blue Beacon Research makes no guarantees about the
            accuracy or timeliness of data.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-headline font-extrabold tracking-tighter text-white">
            Accounts and access
          </h2>
          <p className="text-on-surface/60 leading-relaxed font-medium">
            You must be 18 years or older to use Blue Beacon Research. Signed-in areas of the platform require an account. You are
            responsible for keeping your sign-in credentials confidential and
            for activity under your account.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-headline font-extrabold tracking-tighter text-white">
            Acceptable use
          </h2>
          <p className="text-on-surface/60 font-medium">
            Use of the service is subject to fair use, rate limits, and your
            subscription plan. Abuse, scraping, or attempts to circumvent access
            controls may result in suspension.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-headline font-extrabold tracking-tighter text-white">
            Automated analysis
          </h2>
          <p className="text-on-surface/60 leading-relaxed font-medium">
            Signals come from public news sources and are classified by
            automated systems, including Anthropic&apos;s Claude models. They can
            be wrong or late.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-headline font-extrabold tracking-tighter text-white">
            Changes to these terms
          </h2>
          <p className="text-on-surface/60 leading-relaxed font-medium">
            We may update these terms. The date at the bottom of this page
            shows when they were last updated. If you keep using the service
            after an update, you accept the revised terms.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-headline font-extrabold tracking-tighter text-white">
            Contact
          </h2>
          <p className="text-on-surface/60 leading-relaxed font-medium">
            Questions about these terms: support@bluebeaconresearch.com
          </p>
        </section>

        <p className="text-on-surface/60 font-medium">
          Last updated: October 2026
        </p>
      </div>
    </main>
  );
}
