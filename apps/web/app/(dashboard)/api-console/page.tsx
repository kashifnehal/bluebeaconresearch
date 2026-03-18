"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function ApiConsolePage() {
  // Phase 6: replace with real plan check from `profiles.plan_tier`.
  const [planTier] = useState<"free" | "analyst" | "pro" | "api">("analyst");

  if (planTier !== "api") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-[520px] bg-surface border border-border rounded-xl p-8 shadow-none text-center">
          <Lock className="mx-auto text-text-muted" size={48} />
          <h1 className="mt-4 text-text-primary text-xl font-semibold">
            API access requires the Quant plan
          </h1>
          <p className="mt-2 text-text-secondary text-sm">
            Get structured JSON webhooks delivered in under 60 seconds. Perfect
            for algorithmic trading systems.
          </p>
          <Button className="mt-6 bg-accent hover:bg-accent-hover text-white">
            Upgrade to API plan — $499/mo
          </Button>
          <div className="mt-6 text-left text-sm text-text-secondary space-y-1">
            <div>✓ REST API access</div>
            <div>✓ Webhook delivery &lt; 60s</div>
            <div>✓ All commodities</div>
            <div>✓ Custom filters</div>
            <div>✓ Rate limit: 1000 req/hr</div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-text-primary text-2xl font-semibold mb-4">
        API Console
      </h1>
      <Tabs defaultValue="keys">
        <TabsList className="bg-surface-secondary border border-border">
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="docs">Docs</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="mt-4">
          <Card className="bg-surface border border-border rounded-xl p-6 shadow-none">
            API Keys UI will be finalized in Phase 6 (DB-backed).
          </Card>
        </TabsContent>
        <TabsContent value="webhooks" className="mt-4">
          <Card className="bg-surface border border-border rounded-xl p-6 shadow-none">
            Webhook endpoints UI will be finalized in Phase 6 (DB-backed).
          </Card>
        </TabsContent>
        <TabsContent value="docs" className="mt-4">
          <Card className="bg-surface border border-border rounded-xl p-6 shadow-none">
            Inline docs will be added in Phase 6.
          </Card>
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <Card className="bg-surface border border-border rounded-xl p-6 shadow-none">
            Usage analytics will be added in Phase 6.
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
