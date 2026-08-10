"use client";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Signal } from "@blue-beacon-research/shared";
import { formatDistanceToNowStrict } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function MapPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["signals", "feed"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      if (!res.ok) throw new Error("Failed to fetch signals");
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
          src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2000&auto=format&fit=crop"
        />
        <div className="absolute inset-0 map-vignette"></div>
        <div className="absolute inset-y-0 left-0 w-64 bg-gradient-to-r from-background to-transparent"></div>
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent"></div>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent"></div>
      </div>

      {/* Hotspot Markers */}
      {signals.slice(0, 3).map((sig, idx) => {
        const topPositions = ["top-[35%]", "top-[48%]", "top-[60%]"];
        const leftPositions = ["left-[45%]", "left-[75%]", "left-[30%]"];
        const isUrgent = sig.severity >= 8;

        return (
          <div 
            key={sig.id}
            onClick={() => router.push(`/events/${sig.id}`)}
            className={`absolute ${topPositions[idx % 3]} ${leftPositions[idx % 3]} group cursor-pointer`}
          >
            <div className={`w-4 h-4 rounded-full ${isUrgent ? 'bg-error pulse-red' : 'bg-primary pulse-emerald'}`}></div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 glass p-4 rounded-lg w-56 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
              <div className={`label text-[10px] font-bold tracking-widest mb-1 ${isUrgent ? 'text-error' : 'text-primary'}`}>
                {isUrgent ? 'CRITICAL EVENT' : 'ACTIVE SIGNAL'}
              </div>
              <div className="font-headline text-sm font-bold text-on-surface mb-2 line-clamp-2">{sig.title}</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-on-surface-variant uppercase">COUNTRY</span>
                <span className="font-mono text-[10px] text-primary font-bold uppercase">{sig.country}</span>
              </div>
            </div>
          </div>
        );
      })}

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
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/20">
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
        </div>
      </section>

      {/* TASK 7 — Right Overlay: Live Intelligence Feed Links to /events/[id] */}
      <aside className="absolute top-0 right-0 h-full w-80 glass border-l border-outline-variant/30 flex flex-col">
        <div className="p-6 border-b border-outline-variant/30 bg-surface-container-lowest/40">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="label text-xs tracking-[0.2em] font-bold text-on-surface uppercase">Live Intelligence</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
          {isLoading || isError ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full bg-surface-container/40 rounded-lg" />
              ))}
            </div>
          ) : liveItems.length > 0 ? (
            liveItems.map((signal) => {
              const isUrgent = signal.severity >= 8;
              const borderStyle = isUrgent ? "border-error" : "border-primary";

              return (
                <div 
                  key={signal.id} 
                  onClick={() => router.push(`/events/${signal.id}`)}
                  className={`p-3 bg-surface-container/40 rounded-lg border-l-2 ${borderStyle} hover:bg-surface-container/60 transition-colors cursor-pointer group`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-1.5 py-0.5 label text-[8px] border uppercase ${isUrgent ? 'bg-error/10 text-error border-error/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
                      {isUrgent ? 'URGENT' : 'SIGNAL'}
                    </span>
                    <span className="font-mono text-[9px] text-on-surface-variant">
                     {formatDistanceToNowStrict(new Date(signal.eventDate ?? signal.createdAt))} ago
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-on-surface mb-2 font-medium line-clamp-2 group-hover:text-primary transition-colors">
                    {signal.title}
                  </p>
                  <span className="label text-[9px] text-primary flex items-center gap-1 group-hover:underline">
                    VIEW DETAILS <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                  </span>
                </div>
              );
            })
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 grayscale opacity-50">
               <span className="label text-[10px] tracking-widest uppercase">No live stream data</span>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-outline-variant/30">
          <button 
            onClick={() => router.push("/dashboard")}
            className="w-full bg-primary-container py-3 rounded-lg flex items-center justify-center gap-3 hover:brightness-110 transition-all text-on-primary-container font-bold label text-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">terminal</span>
            OPEN FULL TERMINAL
          </button>
        </div>
      </aside>
    </main>
  );
}
