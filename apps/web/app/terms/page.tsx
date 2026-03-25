export const metadata = {
  title: "Terms — Blue Beacon Research",
  description: "Blue Beacon Research terms of service.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-on-surface p-12">
      <div className="max-w-2xl mx-auto space-y-12">
        <h1 className="text-4xl font-headline font-extrabold tracking-tighter text-white">Legal Protocol</h1>
        
        <section className="space-y-6">
          <p className="text-on-surface/60 leading-relaxed font-medium">
            Blue Beacon Research provides informational geopolitical intelligence signals. Nothing in this product constitutes
            investment advice.
          </p>
          <p className="text-on-surface/60 leading-relaxed font-medium font-mono text-xs uppercase tracking-widest bg-surface-container p-6 rounded-xl border border-outline-variant/10">
            [LIABILITY CAP]
            <br/><br/>
            You are responsible for your own trading decisions and risk management. Blue Beacon Research makes no guarantees about
            the accuracy or timeliness of data.
          </p>
          <p className="text-on-surface/60 font-medium">
            Use of the service is subject to fair use, rate limits, and your subscription plan. Abuse, scraping, or
            attempts to circumvent access controls may result in suspension.
          </p>
        </section>
      </div>
    </main>
  );
}
