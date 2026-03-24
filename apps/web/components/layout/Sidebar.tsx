"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: string; badge?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Intelligence Feed", icon: "rss_feed" },
  { href: "/map", label: "Global Map", icon: "public" },
  { href: "/alerts", label: "Alerts", icon: "notifications_active", badge: true },
  { href: "/watchlist", label: "Watchlist", icon: "bookmark" },
  { href: "/backtesting", label: "Backtesting", icon: "query_stats" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="h-screen w-64 left-0 top-0 fixed flex flex-col py-8 z-50 overflow-y-auto"
      style={{
        backgroundColor: "#000000",
        borderRight: "1px solid rgba(72,72,72,0.2)",
        fontFamily: "Inter, sans-serif",
        fontSize: "0.6875rem",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {/* Logo */}
      <div className="px-6 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "linear-gradient(to bottom right, #4edea3, #005236)" }}>
            <span className="material-symbols-outlined text-on-primary text-sm" style={{ fontFamily: "Material Symbols Outlined", fontVariationSettings: "'FILL' 1", fontSize: "16px" }}>security</span>
          </div>
          <div>
            <h1 className="text-white font-bold tracking-tighter text-sm normal-case">GeoSignal Pro</h1>
            <p className="text-[10px] tracking-widest normal-case" style={{ color: "#4edea3" }}>Active Intelligence</p>
          </div>
        </div>
      </div>

      {/* Live Status Indicator */}
      <div className="px-6 mb-2 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#4edea3" }} />
        <div className="flex flex-col">
          <span className="text-[#e7e5e4] font-bold tracking-widest text-[10px]">Active Intelligence</span>
          <span className="text-[8px] tracking-[0.2em]" style={{ color: "#3cd096" }}>Node: GS-ALPHA-09</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col flex-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-6 py-3 transition-all relative"
              style={{
                color: active ? "#4edea3" : "#acabaa",
                borderLeft: active ? "2px solid #4edea3" : "2px solid transparent",
                background: active ? "linear-gradient(to right, rgba(0,82,54,0.2), transparent)" : undefined,
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = "#0e0e0e"; (e.currentTarget as HTMLElement).style.color = "#fff"; } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = ""; (e.currentTarget as HTMLElement).style.color = "#acabaa"; } }}
            >
              <span className="material-symbols-outlined text-lg" style={{ fontFamily: "Material Symbols Outlined", fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>{item.icon}</span>
              <span className={active ? "font-semibold" : ""}>{item.label}</span>
              {item.badge && (
                <span className="ml-auto bg-error-container text-on-error-container px-1.5 rounded-full text-[8px]">12</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Links */}
      <div className="mt-auto flex flex-col gap-1 border-t pt-4" style={{ borderColor: "rgba(72,72,72,0.1)" }}>
        <a className="flex items-center gap-3 px-6 py-3 transition-all" style={{ color: "#acabaa" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#0e0e0e"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; (e.currentTarget as HTMLElement).style.color = "#acabaa"; }}
          href="#">
          <span className="material-symbols-outlined text-lg" style={{ fontFamily: "Material Symbols Outlined" }}>help</span>
          <span>Help</span>
        </a>
        <a className="flex items-center gap-3 px-6 py-3 transition-all" style={{ color: "#acabaa" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#0e0e0e"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; (e.currentTarget as HTMLElement).style.color = "#acabaa"; }}
          href="#">
          <span className="material-symbols-outlined text-lg" style={{ fontFamily: "Material Symbols Outlined" }}>logout</span>
          <span>Logout</span>
        </a>
      </div>
    </aside>
  );
}
