"use client";
import { useQuery } from "@tanstack/react-query";
import type { Signal } from "@blue-beacon-research/shared";
import { formatDistanceToNowStrict } from "date-fns";

export default function MapPage() {
  const { data } = useQuery({
    queryKey: ["signals", "feed"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      return (await res.json()) as { signals: Signal[] };
    },
    refetchInterval: 30_000,
  });

  const signals = data?.signals ?? [];
  const liveItems = signals.slice(0, 6);

  return (
    <main className="fixed inset-0 top-16 left-[256px] bg-background overflow-hidden">
      {/* Map Background */}
      <div className="absolute inset-0 grayscale contrast-125 opacity-40">
        <img 
          className="w-full h-full object-cover" 
          alt="Grayscale high-contrast satellite view of world topography" 
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuB5c7e7iZh00wf_kOPKddL93iCoQE5bmfH89jXckzLwZNyuAVYd1q-x_DpIfFXfUZ-P92YHqn5vycAaNHlPgLySzvTBq5gy8a6a7pYVMhPmfGMSlP1F_-2STtZUwQ2AHqJ18dXvgbuupgFx3p9Yb57Dn2T8dINwuGD_yoCq8omnBNQQOnO3WINpfuKCc7dZ7qOh6vLG8NTAZljippankm0ycyE06ggq_bJ5lnT17AkTAah6u6xHcU5gyevdkvq-_h9h71T_B59b0R1M"
        />
        <div className="absolute inset-0 map-vignette"></div>
        {/* Linear Gradients for UI blend */}
        <div className="absolute inset-y-0 left-0 w-64 bg-gradient-to-r from-background to-transparent"></div>
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent"></div>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent"></div>
      </div>

      {/* Hotspot Markers */}
      {/* Europe: Signal Omega */}
      <div className="absolute top-[35%] left-[45%] group cursor-pointer">
        <div className="w-4 h-4 bg-primary rounded-full pulse-emerald"></div>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 glass p-4 rounded-lg w-48 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="label text-[10px] text-primary font-bold tracking-widest mb-1">SIGNAL: OMEGA-7</div>
          <div className="font-headline text-sm font-bold text-on-surface mb-2">Kyiv Displacement</div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-on-surface-variant">CONFIDENCE</span>
            <span className="font-mono text-[10px] text-primary font-bold">98.4%</span>
          </div>
        </div>
      </div>
      
      {/* Asia: Alert High Tension */}
      <div className="absolute top-[48%] left-[75%] group cursor-pointer">
        <div className="w-3 h-3 bg-error rounded-full pulse-red"></div>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 glass p-4 rounded-lg w-48 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="label text-[10px] text-error font-bold tracking-widest mb-1">ALERT: HIGH TENSION</div>
          <div className="font-headline text-sm font-bold text-on-surface mb-2">Taiwan Strait</div>
          <div className="font-mono text-[10px] text-on-surface-variant leading-tight">Vessel Movement detected in Sector-7G. High collision probability.</div>
        </div>
      </div>

      {/* Left Overlay: Global Tension Index */}
      <section className="absolute top-8 left-8 w-80 glass rounded-xl p-6 border-l-2 border-primary/40">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="label text-[10px] tracking-[0.2em] text-on-surface-variant mb-1 uppercase">Global Tension Index</div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-bold text-on-surface">74.8</span>
              <span className="font-mono text-sm text-error font-bold">▲ 2.4</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary-container/20 flex items-center justify-center border border-primary/20">
            <span className="material-symbols-outlined text-primary">analytics</span>
          </div>
        </div>
        
        <div className="space-y-4 mb-8">
          <div>
            <div className="flex justify-between label text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">
              <span>Cyber Warfare</span>
              <span className="font-mono text-primary">88%</span>
            </div>
            <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-primary w-[88%]"></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between label text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">
              <span>Kinetic Conflict</span>
              <span className="font-mono text-primary">42%</span>
            </div>
            <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-primary w-[42%]"></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between label text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">
              <span>Diplomatic Friction</span>
              <span className="font-mono text-primary">65%</span>
            </div>
            <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-primary w-[65%]"></div>
            </div>
          </div>
        </div>

        <div className="border-t border-outline-variant/30 pt-6">
          <div className="label text-[10px] text-on-surface-variant mb-4 tracking-widest uppercase">Active Sentiment</div>
          <div className="flex items-end gap-3 h-24">
            <div className="flex-1 flex flex-col items-center">
              <div className="w-full bg-primary-container/30 border-t-2 border-primary" style={{ height: "24.5%" }}></div>
              <span className="font-mono text-[9px] mt-2 text-primary">24.5%</span>
              <span className="label text-[8px] text-on-surface-variant uppercase mt-1">Bull</span>
            </div>
            <div className="flex-1 flex flex-col items-center">
              <div className="w-full bg-surface-container-highest" style={{ height: "52.1%" }}></div>
              <span className="font-mono text-[9px] mt-2 text-on-surface-variant">52.1%</span>
              <span className="label text-[8px] text-on-surface-variant uppercase mt-1">Neut</span>
            </div>
            <div className="flex-1 flex flex-col items-center">
              <div className="w-full bg-error-container/30 border-t-2 border-error" style={{ height: "23.4%" }}></div>
              <span className="font-mono text-[9px] mt-2 text-error">23.4%</span>
              <span className="label text-[8px] text-on-surface-variant uppercase mt-1">Bear</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right Overlay: Live Intelligence Feed */}
      <aside className="absolute top-0 right-0 h-full w-80 glass border-l border-outline-variant/30 flex flex-col">
        <div className="p-6 border-b border-outline-variant/30 bg-surface-container-lowest/40">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="label text-xs tracking-[0.2em] font-bold text-on-surface uppercase">Live Intelligence</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
          {liveItems.length > 0 ? liveItems.map((signal, i) => {
            const isUrgent = signal.severity >= 8;
            const isSocial = i % 3 === 2; // Mocking specific tags based on the Stitch html pattern
            const isSignal = i % 3 === 1;

            let tagStyle = "bg-primary/10 text-primary border-primary/20";
            let tagText = "Satellite";
            let borderStyle = "border-primary";

            if (isUrgent) {
              tagStyle = "bg-error/10 text-error border-error/20";
              tagText = "Urgent";
              borderStyle = "border-error";
            } else if (isSocial) {
              tagStyle = "bg-surface-container-highest text-on-surface-variant border-outline-variant/30";
              tagText = "Social";
              borderStyle = "border-on-surface-variant";
            } else if (isSignal) {
              tagStyle = "bg-primary/10 text-primary border-primary/20";
              tagText = "Signals";
              borderStyle = "border-primary";
            }

            return (
              <div key={signal.id} className={`p-3 bg-surface-container/40 rounded-lg border-l-2 ${borderStyle} hover:bg-surface-container/60 transition-colors cursor-pointer group`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-1.5 py-0.5 label text-[8px] border uppercase ${tagStyle}`}>
                    {tagText}
                  </span>
                  <span className="font-mono text-[9px] text-on-surface-variant">
                    {formatDistanceToNowStrict(new Date(signal.createdAt))} ago
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-on-surface mb-2 font-medium">
                  {signal.title}
                </p>
                <a className="label text-[9px] text-primary flex items-center gap-1 group-hover:underline" href={`/alerts?id=${signal.id}`}>
                  {isUrgent ? "VIEW ATTACK VECTOR" : (isSocial ? "TRACE ORIGIN" : "DECRYPT STREAM")} <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                </a>
              </div>
            );
          }) : (
            <div className="flex-1 flex items-center justify-center p-6 grayscale opacity-50">
               <div className="flex items-center gap-2 text-on-surface-variant">
                 <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                 <span className="label text-[10px] tracking-widest uppercase">Syncing Intel</span>
               </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-outline-variant/30">
          <button className="w-full bg-primary-container py-3 rounded-lg flex items-center justify-center gap-3 hover:brightness-110 transition-all text-on-primary-container font-bold label text-xs">
            <span className="material-symbols-outlined text-sm">terminal</span>
            OPEN FULL TERMINAL
          </button>
        </div>
      </aside>

      {/* Bottom-Center: Floating Ticker Pill */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 -ml-[40px]">
        <div className="glass px-6 py-2.5 rounded-full border border-primary/20 flex items-center gap-6 shadow-2xl">
          <div className="flex items-center gap-2">
            <span className="label text-[9px] font-bold text-on-surface-variant tracking-widest uppercase">Global Ticker</span>
            <span className="h-3 w-px bg-outline-variant/40"></span>
          </div>
          <div className="flex items-center gap-8 overflow-hidden whitespace-nowrap max-w-[500px]">
             <div className="flex items-center gap-2">
               <span className="font-mono text-[10px] text-on-surface">BTC/USD</span>
               <span className="font-mono text-[10px] text-primary font-bold">64,281.40</span>
               <span className="font-mono text-[9px] text-primary">(+1.2%)</span>
             </div>
             <div className="flex items-center gap-2">
               <span className="font-mono text-[10px] text-on-surface">BRENT CRUDE</span>
               <span className="font-mono text-[10px] text-on-surface font-bold">82.14</span>
               <span className="font-mono text-[9px] text-error">(-0.4%)</span>
             </div>
             <div className="flex items-center gap-2">
               <span className="font-mono text-[10px] text-on-surface">GOLD</span>
               <span className="font-mono text-[10px] text-primary font-bold">2,384.10</span>
               <span className="font-mono text-[9px] text-primary">(+0.3%)</span>
             </div>
          </div>
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-sm">stream</span>
            <span className="font-mono text-[8px] font-bold">LIVE</span>
          </div>
        </div>
      </div>

      {/* Bottom-Left: Map Controls */}
      <div className="absolute bottom-8 left-8 flex flex-col gap-2">
        <button className="glass w-10 h-10 flex items-center justify-center rounded-lg text-on-surface hover:bg-surface-container-high transition-colors">
          <span className="material-symbols-outlined">add</span>
        </button>
        <button className="glass w-10 h-10 flex items-center justify-center rounded-lg text-on-surface hover:bg-surface-container-high transition-colors">
          <span className="material-symbols-outlined">remove</span>
        </button>
        <div className="h-2"></div>
        <button className="glass w-10 h-10 flex items-center justify-center rounded-lg text-on-surface hover:bg-surface-container-high transition-colors">
          <span className="material-symbols-outlined">layers</span>
        </button>
      </div>

      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </main>
  );
}

