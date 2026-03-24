"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Clock, Database, MapPin, Share2, Bookmark, Bell, ChevronLeft, Shield, Target, Zap } from "lucide-react";

import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { Signal } from "@geosignal/shared";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data: signal } = useQuery({
    queryKey: ["signal", id],
    queryFn: async () => {
      const res = await fetch(`/api/signals?sort=newest`);
      const json = (await res.json()) as { signals: Signal[] };
      return json.signals.find((s) => s.id === id) ?? json.signals[0];
    },
  });

  if (!signal) return null;

  return (
    <div className="h-full flex flex-col bg-app" style={{ backgroundColor: "var(--bg-app)" }}>
      {/* ── Breadcrumbs ─────────────────────────────────────────── */}
      <nav className="px-8 pt-6 pb-2">
         <button 
           onClick={() => router.back()} 
           className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted hover:text-accent transition-colors"
           style={{ fontFamily: "'Space Grotesk', sans-serif" }}
         >
           <ChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
           Back to Command Center
         </button>
      </nav>

      <div className="flex-1 p-8 pt-4 overflow-y-auto">
         <div className="mx-auto w-full max-w-[1280px]">
            {/* ── Hero Section ──────────────────────────────────────── */}
            <header className="flex flex-col xl:flex-row gap-10 items-start mb-12">
               <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                     <div className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-sm">
                        <span className="text-[10px] font-black uppercase tracking-widest text-accent" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Signal ID: {signal.id.slice(0, 8)}</span>
                     </div>
                     <SeverityBadge score={signal.severity} />
                     <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Acknowledge Status: ACTIVE</span>
                  </div>
                  
                  <h1 className="text-5xl font-black text-text-primary tracking-tighter leading-[0.9] mb-8">
                     {signal.title}
                  </h1>

                  <div className="grid grid-cols-3 gap-6 p-6 rounded-lg bg-surface/30 border" style={{ borderColor: "var(--border-subtle)" }}>
                     <div className="flex items-center gap-3">
                        <Clock size={16} className="text-accent" />
                        <div className="flex flex-col">
                           <span className="text-[9px] font-black uppercase tracking-widest text-muted">Detected</span>
                           <span className="text-xs font-mono font-bold text-text-secondary">{new Date(signal.createdAt).toLocaleString()}</span>
                        </div>
                     </div>
                     <div className="flex items-center gap-3 border-x px-6" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                        <Database size={16} className="text-accent" />
                        <div className="flex flex-col">
                           <span className="text-[9px] font-black uppercase tracking-widest text-muted">Verification</span>
                           <span className="text-xs font-mono font-bold text-text-secondary">{signal.sourcesCount} High-Integrity Sources</span>
                        </div>
                     </div>
                     <div className="flex items-center gap-3">
                        <MapPin size={16} className="text-accent" />
                        <div className="flex flex-col">
                           <span className="text-[9px] font-black uppercase tracking-widest text-muted">Location</span>
                           <span className="text-xs font-mono font-bold text-text-secondary uppercase">{signal.country}</span>
                        </div>
                     </div>
                  </div>
               </div>

               <aside className="w-full xl:w-[320px] space-y-4">
                  <div className="relative p-6 rounded-lg bg-surface border overflow-hidden" style={{ borderColor: "var(--border-subtle)" }}>
                     {/* Decorative background scanlines */}
                     <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 3px)' }} />
                     
                     <div className="flex items-center gap-2 mb-6">
                        <Target size={14} className="text-accent" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>PROJECTED IMPACT</span>
                     </div>
                     
                     <div className="space-y-3">
                        {signal.commodityImpacts.map((c) => (
                          <CommodityChip
                            key={c.asset}
                            asset={c.asset}
                            direction={c.direction}
                            confidence={c.confidence}
                            size="md"
                          />
                        ))}
                     </div>
                  </div>

                  <div className="flex flex-col gap-2">
                     <Button className="h-11 bg-accent text-bg-app text-[9px] font-black uppercase tracking-widest rounded-sm shadow-[0_4px_15px_rgba(78,222,163,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all">
                        <Zap size={14} className="mr-2" /> CREATE SEVERE ALERT
                     </Button>
                     <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="h-11 border-border text-[9px] font-black uppercase tracking-widest rounded-sm">
                           <Share2 size={14} className="mr-2" /> SHARE
                        </Button>
                        <Button variant="outline" className="h-11 border-border text-[9px] font-black uppercase tracking-widest rounded-sm">
                           <Bookmark size={14} className="mr-2" /> RECORD
                        </Button>
                     </div>
                  </div>
               </aside>
            </header>

            {/* ── Deep Dive Analysis ─────────────────────────────────── */}
            <Tabs defaultValue="analysis" className="w-full">
               <TabsList className="bg-surface/30 border-b w-full justify-start rounded-none h-auto p-0 gap-8" style={{ borderColor: "var(--border-subtle)" }}>
                  {['analysis', 'historical', 'map', 'sources'].map(tab => (
                     <TabsTrigger 
                       key={tab} 
                       value={tab}
                       className="bg-transparent border-0 border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-accent rounded-none px-2 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-muted transition-all"
                       style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                     >
                        {tab === 'analysis' && <Shield size={14} className="mr-2" />}
                        {tab}
                     </TabsTrigger>
                  ))}
               </TabsList>

               <div className="py-8">
                  <TabsContent value="analysis" className="m-0 outline-none">
                     <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
                        <div className="md:col-span-8 space-y-8">
                           <div className="prose prose-invert max-w-none">
                              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>AI Intelligence Briefing</div>
                              <p className="text-xl text-text-secondary leading-relaxed font-medium">
                                 {signal.aiAnalysis || "System is calculating narrative synthesis based on the latest signal feed. This briefing will be finalized once multi-source verification is complete."}
                              </p>
                           </div>
                           
                           <div className="p-8 rounded-lg bg-surface/20 border border-dashed text-center" style={{ borderColor: "var(--border-subtle)" }}>
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted">Advanced Narrative Analysis Pending Integration (Next Phase)</p>
                           </div>
                        </div>
                        
                        <div className="md:col-span-4 space-y-6">
                           <div className="p-6 rounded-lg bg-surface/40 border" style={{ borderColor: "var(--border-subtle)" }}>
                              <h5 className="text-[10px] font-black uppercase tracking-widest text-text-primary mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Verification Nodes</h5>
                              <div className="space-y-4">
                                 {[1, 2, 3].map(i => (
                                    <div key={i} className="flex items-center gap-3">
                                       <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                                       <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                          <div className="h-full bg-accent" style={{ width: `${90 - i * 15}%` }} />
                                       </div>
                                       <span className="text-[9px] font-mono text-muted">{90 - i * 15}%</span>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        </div>
                     </div>
                  </TabsContent>

                  <TabsContent value="historical" className="m-0 outline-none">
                     <div className="max-w-2xl p-20 rounded-lg border-2 border-dashed border-border/40 flex flex-col items-center justify-center text-center">
                        <Database className="w-12 h-12 text-muted mb-6" />
                        <h3 className="text-sm font-black uppercase tracking-[0.3em] text-text-primary mb-2">Precedent Mapping Pending</h3>
                        <p className="text-[10px] font-bold text-muted uppercase tracking-widest leading-relaxed">Historical market reaction maps for this event signature will be loaded in the next deployment</p>
                     </div>
                  </TabsContent>

                  <TabsContent value="map" className="m-0 outline-none">
                     <div className="aspect-video w-full bg-surface/20 rounded-lg border flex items-center justify-center" style={{ borderColor: "var(--border-subtle)" }}>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted">Awaiting Satellite Link [Mapbox Engine]</span>
                     </div>
                  </TabsContent>
                  
                  <TabsContent value="sources" className="m-0 outline-none">
                     <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                           <div key={i} className="p-4 rounded-lg bg-surface/20 border border-border flex justify-between items-center group hover:bg-surface/40 cursor-pointer transition-all">
                              <div className="flex flex-col">
                                 <span className="text-[10px] font-black uppercase tracking-widest text-text-primary">Source Node {i}: Verified Signal Provider</span>
                                 <span className="text-[9px] font-mono text-muted uppercase">Intelligence Integrity: 0.9{i}</span>
                              </div>
                              <ChevronLeft className="rotate-180 text-muted group-hover:text-accent transition-colors" size={16} />
                           </div>
                        ))}
                     </div>
                  </TabsContent>
               </div>
            </Tabs>
         </div>
      </div>
    </div>
  );
}


