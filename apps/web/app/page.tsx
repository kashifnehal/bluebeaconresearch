export default function Home() {
  return (
    <div className="min-h-screen bg-surface-app flex items-center justify-center px-4">
      <div className="w-full max-w-[520px] bg-surface border border-border rounded-xl p-8">
        <div className="text-text-primary text-xl font-semibold">GeoSignal</div>
        <p className="mt-2 text-text-secondary text-sm">
          Phase 7 will replace this with the public landing page. For now, use{" "}
          <span className="text-accent">/login</span> or{" "}
          <span className="text-accent">/signup</span>.
        </p>
      </div>
    </div>
  );
}
