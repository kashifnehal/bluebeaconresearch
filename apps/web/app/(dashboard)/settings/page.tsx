"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import { User, Bell, Monitor, Shield, Database, Key, Check } from "lucide-react";

export default function SettingsPage() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="p-8 h-full flex flex-col bg-app" style={{ backgroundColor: "#0e0e0e" }}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="mb-10 flex border-b pb-8" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
         <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}>Settings</h1>
         </div>
      </header>

      {/* ── Main Settings Grid ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <Tabs defaultValue="account" className="flex flex-col h-full lg:flex-row gap-10">
          <TabsList className="flex flex-col h-auto bg-transparent border-0 p-0 items-start gap-1 min-w-[200px]">
            {[
               { id: 'account', label: 'Account', icon: User },
               { id: 'notifications', label: 'Notifications', icon: Bell },
               { id: 'appearance', label: 'Appearance', icon: Monitor },
               { id: 'security', label: 'Security', icon: Shield },
               { id: 'data', label: 'Data', icon: Database },
            ].map(tab => (
               <TabsTrigger 
                 key={tab.id} 
                 value={tab.id}
                 className="w-full justify-start px-4 h-11 text-[11px] font-bold uppercase tracking-widest text-muted data-[state=active]:bg-surface data-[state=active]:text-accent rounded-sm transition-all border border-transparent data-[state=active]:border-border/50"
                 style={{ fontFamily: "'Space Grotesk', sans-serif" }}
               >
                 <tab.icon size={14} className="mr-3" />
                 {tab.label}
               </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-w-0">
             {/* ── Identity ────────────────────────────────────────── */}
             <TabsContent value="account" className="m-0 mt-0 outline-none">
                <div className="max-w-2xl space-y-8">
                   <div className="p-8 rounded-lg border" style={{ backgroundColor: "#1a1919", borderColor: "#484848" }}>
                      <div className="grid grid-cols-2 gap-6">
                         <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#acabaa", fontFamily: "'Space Grotesk', sans-serif" }}>Full Name</label>
                            <Input className="bg-black/20 border-border h-11 text-sm" defaultValue="" placeholder="Alex Chen" />
                         </div>
                         <div className="flex flex-col gap-2">
                            <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#acabaa", fontFamily: "'Space Grotesk', sans-serif" }}>Email</label>
                            <Input className="bg-black/20 border-border h-11 text-sm opacity-60" defaultValue="" placeholder="you@example.com" disabled />
                         </div>
                      </div>
                      <div className="mt-6">
                         <Button style={{ backgroundColor: "#4edea3", color: "#005f40" }} className="h-10 px-8 font-bold uppercase tracking-widest text-xs rounded-sm">
                            Save
                         </Button>
                      </div>
                   </div>
                </div>
             </TabsContent>

             {/* ── Interface ────────────────────────────────────────── */}
             <TabsContent value="appearance" className="m-0 mt-0 outline-none">
                <div className="max-w-2xl">
                   <p className="text-sm font-semibold mb-6" style={{ color: "#e5e2e1" }}>Theme</p>
                   <div className="grid grid-cols-2 gap-6">
                      {[
                        { id: 'dark', label: 'Dark', desc: 'Trader-default' },
                        { id: 'light', label: 'Light', desc: 'Day mode' },
                      ].map(mode => (
                        <div 
                          key={mode.id}
                          onClick={() => setTheme(mode.id)}
                          className="cursor-pointer transition-all"
                          style={{
                            padding: "24px",
                            borderRadius: "8px",
                            border: `1px solid ${resolvedTheme === mode.id ? "#4edea3" : "#484848"}`,
                            backgroundColor: "#1a1919",
                          }}
                        >
                           <div className="flex justify-between items-start mb-2">
                              <span style={{ fontSize: "16px", fontWeight: 700, color: "#e5e2e1" }}>{mode.label}</span>
                              {resolvedTheme === mode.id && <Check size={16} color="#4edea3" />}
                           </div>
                           <p style={{ fontSize: "12px", color: "#acabaa" }}>{mode.desc}</p>
                        </div>
                      ))}
                   </div>
                </div>
             </TabsContent>

             {['notifications', 'security', 'data'].map(tabId => (
                <TabsContent key={tabId} value={tabId} className="m-0 mt-0 outline-none">
                   <div className="max-w-2xl p-20 rounded-lg flex flex-col items-center justify-center text-center" style={{ border: "2px dashed rgba(72,72,72,0.4)" }}>
                      <Database className="w-10 h-10 mb-4" style={{ color: "#86948a" }} />
                      <h3 className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: "#e5e2e1" }}>Coming Soon</h3>
                      <p style={{ fontSize: "11px", color: "#86948a", textTransform: "uppercase", letterSpacing: "0.1em" }}>{tabId} settings will be available in the next update</p>
                   </div>
                </TabsContent>
             ))}
          </div>
        </Tabs>
      </div>
    </div>
  );
}

