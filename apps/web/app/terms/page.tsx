export const metadata = {
  title: "Terms — GeoSignal",
  description: "GeoSignal terms of service.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface-app px-4 py-16 text-text-primary">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-semibold">Terms of Service</h1>
        <p className="mt-3 text-sm text-text-secondary">
          GeoSignal provides informational geopolitical intelligence signals. Nothing in this product constitutes
          investment advice, financial advice, trading advice, or any other sort of advice.
        </p>
        <div className="mt-6 space-y-3 text-sm text-text-secondary">
          <p>
            You are responsible for your own trading decisions and risk management. GeoSignal makes no guarantees about
            accuracy, completeness, timeliness, or suitability for any purpose.
          </p>
          <p>
            Use of the service is subject to fair use, rate limits, and your subscription plan. Abuse, scraping, or
            attempts to circumvent access controls may result in suspension.
          </p>
          <p>These terms may be updated over time. Continued use constitutes acceptance of the updated terms.</p>
        </div>
      </div>
    </div>
  );
}

