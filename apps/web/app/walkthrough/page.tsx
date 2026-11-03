"use client";

import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Checkbox } from "@/components/ui/checkbox";
import { FILTER_COMMODITIES } from "@/lib/signal-filters";
import { LEAD_CONSENT } from "@/lib/consent-copy";
import { readFirstTouch } from "@/lib/first-touch";
import { trackFunnelEvent } from "@/lib/funnel-events";

type Status = "idle" | "submitting" | "success" | "error";
const UNAVAILABLE_MESSAGE = "This isn't available right now. Please try again later.";

const inputClass =
  "w-full bg-[#0e0e0e] border border-[var(--border)] text-[#e5e2e1] text-sm px-3 py-2 rounded font-mono outline-none focus:border-[var(--accent)]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label
        className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function WalkthroughForm() {
  const searchParams = useSearchParams();
  const isProfessional = searchParams.get("type") === "professional";
  const kind = isProfessional ? "professional_access" : "walkthrough";

  const [name, setName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [role, setRole] = useState("");
  const [markets, setMarkets] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());

  useEffect(() => {
    trackFunnelEvent("lead_form_viewed", { kind });
  }, [kind]);

  function toggleMarket(symbol: string) {
    setMarkets((prev) => (prev.includes(symbol) ? prev.filter((m) => m !== symbol) : [...prev, symbol]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consent || status === "submitting") return;
    setStatus("submitting");
    setErrorText(null);
    trackFunnelEvent("lead_form_submitted", { kind });
    try {
      const firstTouch = readFirstTouch();
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name,
          workEmail,
          organisation,
          role,
          markets,
          message,
          consentContact: consent,
          t: renderedAt,
          source: {
            path: typeof window !== "undefined" && window.location ? window.location.pathname : undefined,
            ...firstTouch,
          },
        }),
      });
      if (!res.ok) {
        setStatus("error");
        setErrorText(UNAVAILABLE_MESSAGE);
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorText(UNAVAILABLE_MESSAGE);
    }
  }

  const headingText = isProfessional ? "Request professional access" : "Request a walkthrough of your markets";

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge={isProfessional ? "PROFESSIONAL ACCESS" : "WALKTHROUGH"} />
      <main className="flex-1 max-w-2xl w-full mx-auto p-5 md:p-8 py-12 md:py-16">
        <h1 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {headingText}
        </h1>
        {isProfessional ? (
          <p className="text-xs text-[var(--text-muted)] mb-8 font-mono leading-relaxed">
            Professional access is a fixed-scope paid pilot. We agree scope, term and price with you before anything
            starts.
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)] mb-8 font-mono leading-relaxed">
            Tell us which markets you follow and we will set up a short walkthrough.
          </p>
        )}

        {status === "success" ? (
          <p className="text-sm text-[var(--accent)] font-mono" data-testid="lead-success">
            Thanks — we will be in touch by email.
          </p>
        ) : (
          <form
            onSubmit={onSubmit}
            className="space-y-5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-5"
          >
            <Field label="Name">
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Work email">
              <input
                type="email"
                required
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Organisation">
              <input value={organisation} onChange={(e) => setOrganisation(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Role">
              <input value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Markets">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FILTER_COMMODITIES.map((c) => (
                  <Checkbox
                    key={c.symbol}
                    id={`market-${c.symbol}`}
                    label={c.label}
                    checked={markets.includes(c.symbol)}
                    onChange={() => toggleMarket(c.symbol)}
                    data-testid={`market-${c.symbol}`}
                  />
                ))}
              </div>
            </Field>
            <Field label="What would you like to see?">
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className={inputClass} />
            </Field>
            <Checkbox
              id="lead-consent"
              label={LEAD_CONSENT}
              checked={consent}
              onChange={setConsent}
              data-testid="lead-consent-checkbox"
            />
            {errorText ? (
              <p className="text-xs text-[#ffb4ab] font-mono" data-testid="lead-error">
                {errorText}
              </p>
            ) : null}
            <div>
              <button
                type="submit"
                disabled={!consent || status === "submitting"}
                data-testid="lead-submit"
                className="bg-[var(--accent)] text-black text-xs font-bold uppercase tracking-wider px-5 py-3 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Submit request
              </button>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-2">We reply by email. Nothing is charged.</p>
            </div>
          </form>
        )}
      </main>
      <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[var(--text-muted)] font-mono">
        Blue Beacon Research — Not investment advice.
      </footer>
    </div>
  );
}

export default function WalkthroughPage() {
  return (
    <Suspense fallback={null}>
      <WalkthroughForm />
    </Suspense>
  );
}
