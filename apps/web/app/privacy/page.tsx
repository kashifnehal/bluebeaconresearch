export const metadata = {
  title: "Privacy — Blue Beacon Research",
  description: "Blue Beacon Research privacy policy.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface-app px-4 py-16 text-text-primary">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="mt-3 text-sm text-text-secondary">
          We collect the minimum information required to operate Blue Beacon Research (account identifiers, preferences, and usage
          metrics). We do not sell your personal information.
        </p>
        <div className="mt-6 space-y-3 text-sm text-text-secondary">
          <p>
            Payment details are handled by our payment processor. We store subscription identifiers and plan tier to
            provide access.
          </p>
          <p>
            Analytics may be used to improve product reliability and user experience. You can opt out of non-essential
            analytics where available.
          </p>
          <p>Contact support if you want to request export or deletion of your data.</p>
        </div>
      </div>
    </div>
  );
}

