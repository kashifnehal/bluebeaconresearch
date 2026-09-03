"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";

export function HelpModal() {
  const { helpOpen, setHelpOpen, startTour } = useUIStore();
  const pathname = usePathname();
  const router = useRouter();

  if (!helpOpen) return null;

  function handleReplayTour() {
    setHelpOpen(false);
    startTour();
    if (pathname !== "/dashboard") router.push("/dashboard");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity"
        onClick={() => setHelpOpen(false)}
      />

      {/* Modal Container */}
      <div
        className="relative w-full max-w-2xl bg-[#0e0e0e] border border-[#3c4a42] rounded-lg shadow-2xl z-50 flex flex-col max-h-[85vh] text-[#e5e2e1] animate-in zoom-in-95 duration-150"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#2a2a2a] flex items-center justify-between bg-[#131313] rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#4edea3]/10 border border-[#4edea3]/30 flex items-center justify-center text-[#4edea3]">
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                help
              </span>
            </div>
            <div>
              <h2 className="font-bold text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Terminal Knowledge Base & Guidance
              </h2>
              <p className="text-xs text-[#86948a] font-mono">
                Blue Beacon Tactical Documentation
              </p>
            </div>
          </div>

          <button
            onClick={() => setHelpOpen(false)}
            className="p-1 hover:text-[#4edea3] text-[#86948a] transition-colors rounded-sm"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
              close
            </span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 divide-y divide-[#2a2a2a]/60">
          {/* Section 1 */}
          <div className="pt-2">
            <h3
              className="text-xs font-bold uppercase tracking-wider text-[#4edea3] mb-2 flex items-center gap-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span className="material-symbols-outlined text-sm">style</span>
              1. Reading Signal Cards
            </h3>
            <ul className="space-y-1.5 text-xs text-[#bbcac0] leading-relaxed">
              <li>
                <strong className="text-white">Severity (1–10 Scale):</strong> 10 represents maximum systemic impact (e.g. major conflict, trade blockade). 1–3 are baseline regional notices.
              </li>
              <li>
                <strong className="text-white">Confidence:</strong> Percentage certainty evaluated by our classification pipeline based on multi-source verification and cross-referencing.
              </li>
              <li>
                <strong className="text-white">Direction & Asset Volatility:</strong> Projected direction (Bullish/Bearish/Volatile) for key commodities (WTI Crude, Gold, Natural Gas, Wheat).
              </li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="pt-4">
            <h3
              className="text-xs font-bold uppercase tracking-wider text-[#4edea3] mb-2 flex items-center gap-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span className="material-symbols-outlined text-sm">send</span>
              2. Setting Up Telegram Alerts
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-[#bbcac0] leading-relaxed">
              <li>Go to <strong className="text-white">Settings → Notifications</strong> in this terminal and click <strong className="text-white">Connect Telegram</strong> to generate a code.</li>
              <li>Open Telegram and search for <strong className="text-white">@BlueBeaconResearchBot</strong>.</li>
              <li>Send <code className="bg-[#1f1f1f] px-1.5 py-0.5 rounded text-[#4edea3] font-mono">/connect &lt;code&gt;</code> to the bot, using the code from step 1.</li>
              <li>The Settings page confirms the link automatically once the bot receives it.</li>
            </ol>
          </div>

          {/* Section 3 */}
          <div className="pt-4">
            <h3
              className="text-xs font-bold uppercase tracking-wider text-[#4edea3] mb-2 flex items-center gap-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span className="material-symbols-outlined text-sm">public</span>
              3. Using the Global Map
            </h3>
            <p className="text-xs text-[#bbcac0] leading-relaxed mb-2">
              Click any pulsating red/emerald dot on the map overlay to view real-time incident details, spatial coordinates, and intelligence streams.
            </p>
            <p className="text-xs text-[#bbcac0] leading-relaxed">
              <strong className="text-white">Global Tension Index:</strong> Composite score derived from regional conflict density, kinetic strikes, and maritime disruption metrics.
            </p>
          </div>

          {/* Section 4 */}
          <div className="pt-4">
            <h3
              className="text-xs font-bold uppercase tracking-wider text-[#4edea3] mb-2 flex items-center gap-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span className="material-symbols-outlined text-sm">history</span>
              4. Backtesting & Historical Analysis
            </h3>
            <p className="text-xs text-[#bbcac0] leading-relaxed italic">
              Disclaimer: Historical simulations and backtest models provided in the lab use historical geopolitical conflict markers to simulate potential commodity price impacts. Past performance indicators are illustrative.
            </p>
          </div>

          {/* Section 5 */}
          <div className="pt-4">
            <h3
              className="text-xs font-bold uppercase tracking-wider text-[#4edea3] mb-2 flex items-center gap-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span className="material-symbols-outlined text-sm">mail</span>
              5. Contact Support & Encrypted Desk
            </h3>
            <p className="text-xs text-[#bbcac0]">
              Need custom API integrations, enterprise nodes, or tactical assistance? Contact our engineering team:
            </p>
            <a
              href="mailto:support@bluebeaconresearch.com"
              className="inline-block mt-2 font-mono text-xs text-[#4edea3] hover:underline"
            >
              support@bluebeaconresearch.com
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2a2a2a] bg-[#131313] rounded-b-lg flex justify-between items-center">
          <button
            onClick={handleReplayTour}
            className="text-xs font-bold text-[#86948a] hover:text-[#4edea3] uppercase tracking-wider transition-colors"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Replay product tour
          </button>
          <button
            onClick={() => setHelpOpen(false)}
            className="px-6 py-2 bg-[#4edea3] text-[#003824] font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-[#6ffbbe] transition-colors"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
