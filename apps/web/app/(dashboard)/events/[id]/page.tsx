"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Clock, Database, MapPin, Share2, Bookmark, Bell } from "lucide-react";

import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Signal } from "@geosignal/shared";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data } = useQuery({
    queryKey: ["signal", id],
    queryFn: async () => {
      const res = await fetch(`/api/signals?sort=newest`);
      const json = (await res.json()) as { signals: Signal[] };
      return json.signals.find((s) => s.id === id) ?? json.signals[0];
    },
  });

  const signal = data;
  if (!signal) return null;

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <div className="text-text-muted text-sm mb-4">
        <button onClick={() => router.back()} className="hover:underline">
          Dashboard
        </button>{" "}
        / Signal Feed / {signal.title.slice(0, 42)}
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <SeverityBadge score={signal.severity} />
            <span className="text-text-muted text-xs uppercase tracking-wider bg-surface-secondary rounded px-2 py-1">
              {signal.eventType}
            </span>
          </div>
          <h1 className="mt-3 mb-2 text-text-primary text-2xl font-semibold leading-tight">
            {signal.title}
          </h1>
          <div className="flex flex-wrap gap-4 text-text-muted text-sm">
            <span className="inline-flex items-center gap-1">
              <Clock size={14} /> {new Date(signal.createdAt).toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <Database size={14} /> {signal.sourcesCount} sources
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} /> {signal.country}
            </span>
          </div>
        </div>

        <div className="w-full md:w-[240px] space-y-3">
          <Card className="bg-surface-secondary border border-border rounded-xl p-4 shadow-none">
            <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
              Market impact
            </div>
            <div className="flex flex-col gap-2">
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
          </Card>
          <Button
            variant="outline"
            className="w-full h-10 bg-transparent border-border hover:bg-surface-elevated"
            onClick={() => navigator.clipboard.writeText(window.location.href)}
          >
            <Share2 size={16} /> Share signal
          </Button>
          <Button
            variant="outline"
            className="w-full h-10 bg-transparent border-border hover:bg-surface-elevated"
            onClick={() => {}}
          >
            <Bookmark size={16} /> Save
          </Button>
          <Button
            className="w-full h-10 bg-accent hover:bg-accent-hover text-white"
            onClick={() => router.push("/alerts")}
          >
            <Bell size={16} /> Alert me for similar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="analysis" className="mt-8">
        <TabsList className="bg-surface-secondary border border-border">
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="historical">Historical precedent</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="mt-4">
          <Card className="bg-surface-secondary border border-border rounded-xl p-6 shadow-none">
            <div className="text-text-muted text-xs uppercase tracking-wider">
              AI Intelligence Briefing
            </div>
            <div className="mt-3 text-text-secondary text-base leading-relaxed">
              {signal.aiAnalysis || "AI analysis will be generated in Phase 8 (workers)."}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="historical" className="mt-4">
          <Card className="bg-surface-secondary border border-border rounded-xl p-6 shadow-none">
            <div className="text-text-primary font-medium">Historical Precedent</div>
            <div className="text-text-muted text-sm mt-2">
              Phase 5 will populate this with backtest and impact charts.
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <Card className="bg-surface-secondary border border-border rounded-xl p-6 shadow-none">
            <div className="text-text-primary font-medium">Map</div>
            <div className="text-text-muted text-sm mt-2">
              Phase 4/7 will render Mapbox here once event geo data is connected.
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="mt-4">
          <Card className="bg-surface-secondary border border-border rounded-xl p-6 shadow-none">
            <div className="text-text-primary font-medium">Sources</div>
            <div className="text-text-muted text-sm mt-2">
              No additional sources loaded yet.
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

