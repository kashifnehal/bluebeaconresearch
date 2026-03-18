"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart2,
  Bell,
  FlaskConical,
  Code2,
  Settings,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/watchlist", label: "Watchlist", icon: BarChart2 },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/backtesting", label: "Backtesting", icon: FlaskConical },
  { href: "/api-console", label: "API Console", icon: Code2 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[240px] z-50 bg-surface-secondary border-r border-border flex-col">
      <div className="px-4 py-5 border-b border-border">
        <div className="text-[18px] font-semibold">
          <span className="text-accent">●</span>{" "}
          <span className="text-text-primary">GeoSignal</span>
        </div>
      </div>

      <nav className="p-3 space-y-1 flex-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "h-11 px-3 rounded-md flex items-center gap-3 hover:bg-surface-elevated transition-colors",
                active ? "bg-accent/15 text-accent border-l-2 border-accent" : "text-text-secondary",
              ].join(" ")}
            >
              <Icon size={18} />
              <span className="text-sm font-medium">{item.label}</span>
              {item.href === "/alerts" ? (
                <Badge className="ml-auto bg-danger-subtle text-danger">0</Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border flex items-center gap-2">
        <div className="size-8 rounded-full bg-accent text-white flex items-center justify-center text-sm font-semibold">
          GS
        </div>
        <div className="flex-1">
          <div className="text-sm text-text-primary font-medium">GeoSignal</div>
          <div className="text-xs text-text-muted">Analyst</div>
        </div>
        <Badge className="bg-accent-subtle text-accent">Analyst</Badge>
      </div>
    </aside>
  );
}

