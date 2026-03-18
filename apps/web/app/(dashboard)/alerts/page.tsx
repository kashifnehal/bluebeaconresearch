"use client";

import { useMemo, useState } from "react";
import { Bell, MoreVertical, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COMMODITIES, REGIONS } from "@geosignal/shared";

type Rule = {
  id: string;
  name: string;
  regions: string[];
  commodities: string[];
  minSeverity: number;
  frequency: "immediate" | "hourly" | "daily";
  channels: Array<"email" | "telegram" | "slack">;
  active: boolean;
  lastTriggeredAt?: string;
};

export default function AlertsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => rules.find((r) => r.id === selectedId) ?? null,
    [rules, selectedId],
  );

  function createRule() {
    const id = crypto.randomUUID();
    const rule: Rule = {
      id,
      name: "New alert rule",
      regions: [],
      commodities: [],
      minSeverity: 8,
      frequency: "immediate",
      channels: ["email"],
      active: true,
    };
    setRules((p) => [rule, ...p]);
    setSelectedId(id);
  }

  function updateRule(patch: Partial<Rule>) {
    if (!selectedId) return;
    setRules((prev) =>
      prev.map((r) => (r.id === selectedId ? { ...r, ...patch } : r)),
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-text-primary text-2xl font-semibold">Alert rules</h1>
          <Button
            className="bg-accent hover:bg-accent-hover text-white"
            onClick={createRule}
          >
            <Plus size={16} /> New rule
          </Button>
        </div>

        {rules.length === 0 ? (
          <Card className="bg-surface-secondary border border-border rounded-xl p-8 text-center shadow-none">
            <div className="mx-auto mb-3 size-12 rounded-full bg-surface-elevated flex items-center justify-center">
              <Bell className="text-text-muted" />
            </div>
            <div className="text-text-primary font-semibold">No alert rules yet</div>
            <div className="text-text-muted text-sm mt-1">
              Create your first rule to start getting real-time conflict signals.
            </div>
            <div className="mt-5">
              <Button
                className="bg-accent hover:bg-accent-hover text-white"
                onClick={createRule}
              >
                Create first rule
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {rules.map((r) => (
              <Card
                key={r.id}
                className={`bg-surface-secondary border border-border rounded-lg p-4 shadow-none cursor-pointer ${selectedId === r.id ? "border-accent" : "hover:bg-surface-elevated"}`}
                onClick={() => setSelectedId(r.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-full bg-surface-elevated flex items-center justify-center">
                    <Bell className={r.active ? "text-accent" : "text-text-muted"} />
                  </div>
                  <div className="flex-1">
                    <div className="text-text-primary font-medium text-sm">{r.name}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge className="bg-surface-elevated text-text-muted">
                        Severity ≥ {r.minSeverity}
                      </Badge>
                      {(r.regions.length ? r.regions : ["All regions"]).map((x) => (
                        <Badge key={x} className="bg-surface-elevated text-text-muted">
                          {x}
                        </Badge>
                      ))}
                      {(r.commodities.length ? r.commodities : ["All commodities"]).map((x) => (
                        <Badge key={x} className="bg-surface-elevated text-text-muted">
                          {x}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-2 text-text-muted text-xs">
                      {r.lastTriggeredAt ? `Last fired ${r.lastTriggeredAt}` : "Never triggered"}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 rounded-md hover:bg-surface-elevated flex items-center justify-center">
                      <MoreVertical size={16} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-surface border-border">
                      <DropdownMenuItem
                        onClick={() =>
                          setRules((p) => p.filter((x) => x.id !== r.id))
                        }
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        <Card className="bg-surface border border-border rounded-xl p-5 shadow-none">
          <div className="text-text-primary font-semibold">Edit rule</div>
          {!selected ? (
            <div className="text-text-muted text-sm mt-2">
              Select a rule to configure it.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
                  Name
                </div>
                <Input
                  value={selected.name}
                  onChange={(e) => updateRule({ name: e.target.value })}
                  className="h-10 bg-surface-secondary border-border"
                />
              </div>

              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
                  Minimum severity
                </div>
                <div className="flex gap-2">
                  {[7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => updateRule({ minSeverity: n })}
                      className={[
                        "h-10 flex-1 rounded-md border text-sm font-medium",
                        selected.minSeverity === n
                          ? "bg-accent text-white border-accent"
                          : "bg-surface-secondary text-text-secondary border-border hover:bg-surface-elevated",
                      ].join(" ")}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
                  Frequency
                </div>
                <Select
                  value={selected.frequency}
                  onValueChange={(v) =>
                    updateRule({ frequency: v as Rule["frequency"] })
                  }
                >
                  <SelectTrigger className="h-10 bg-surface-secondary border-border">
                    <SelectValue placeholder="Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="hourly">Hourly digest</SelectItem>
                    <SelectItem value="daily">Daily 06:00</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider mb-2">
                  Regions / Commodities
                </div>
                <div className="flex flex-wrap gap-2">
                  {REGIONS.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        const next = selected.regions.includes(r.id)
                          ? selected.regions.filter((x) => x !== r.id)
                          : [...selected.regions, r.id];
                        updateRule({ regions: next });
                      }}
                      className={[
                        "px-2.5 py-1 rounded-full text-xs border",
                        selected.regions.includes(r.id)
                          ? "bg-accent-subtle text-accent border-accent/30"
                          : "bg-surface-secondary text-text-muted border-border hover:bg-surface-elevated",
                      ].join(" ")}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {COMMODITIES.slice(0, 6).map((c) => (
                    <button
                      key={c.symbol}
                      onClick={() => {
                        const next = selected.commodities.includes(c.symbol)
                          ? selected.commodities.filter((x) => x !== c.symbol)
                          : [...selected.commodities, c.symbol];
                        updateRule({ commodities: next });
                      }}
                      className={[
                        "px-2.5 py-1 rounded-full text-xs border",
                        selected.commodities.includes(c.symbol)
                          ? "bg-accent-subtle text-accent border-accent/30"
                          : "bg-surface-secondary text-text-muted border-border hover:bg-surface-elevated",
                      ].join(" ")}
                    >
                      {c.symbol}
                    </button>
                  ))}
                </div>
              </div>

              <Button className="w-full h-10 bg-accent hover:bg-accent-hover text-white">
                Save rule
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
