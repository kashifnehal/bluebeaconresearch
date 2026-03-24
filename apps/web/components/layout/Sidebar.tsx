"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type NavItem = { href: string; label: string; icon: string; badge?: number };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Intelligence Feed", icon: "rss_feed" },
  { href: "/map", label: "Global Map", icon: "public" },
  { href: "/alerts", label: "Alerts", icon: "notifications_active", badge: 12 },
  { href: "/watchlist", label: "Watchlist", icon: "bookmark" },
  { href: "/backtesting", label: "Backtesting", icon: "query_stats" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const C = {
  bg: "#000000",
  border: "rgba(72,72,72,0.2)",
  primary: "#4edea3",
  primaryDim: "#3cd096",
  active: "rgba(0,82,54,0.2)",
  muted: "#acabaa",
  text: "#e7e5e4",
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: "256px",
        backgroundColor: C.bg,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
        overflowY: "auto",
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: "11px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {/* Logo */}
      <div style={{ padding: "24px 24px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "4px",
              background: "linear-gradient(135deg, #4edea3, #005236)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: "Material Symbols Outlined",
                fontVariationSettings: "'FILL' 1",
                fontSize: "16px",
                color: "#003824",
              }}
            >
              security
            </span>
          </div>
          <div>
            <h1 style={{ color: "#ffffff", fontWeight: 700, fontSize: "14px", letterSpacing: "-0.01em", textTransform: "none", margin: 0 }}>
              GeoSignal Pro
            </h1>
            <p style={{ color: C.primary, fontSize: "10px", letterSpacing: "0.15em", margin: 0, textTransform: "uppercase" }}>
              Active Intelligence
            </p>
          </div>
        </div>
      </div>

      {/* Live Status */}
      <div style={{ padding: "0 24px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: C.primary, flexShrink: 0 }}
          className="animate-pulse"
        />
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: "10px", letterSpacing: "0.2em" }}>
            Active Intelligence
          </div>
          <div style={{ color: C.primaryDim, fontSize: "8px", letterSpacing: "0.2em" }}>
            Node: GS-ALPHA-09
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 24px",
                color: active ? C.primary : C.muted,
                borderLeft: `2px solid ${active ? C.primary : "transparent"}`,
                background: active ? `linear-gradient(to right, ${C.active}, transparent)` : "transparent",
                textDecoration: "none",
                transition: "all 0.15s",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "#0e0e0e";
                  (e.currentTarget as HTMLElement).style.color = "#fff";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  (e.currentTarget as HTMLElement).style.color = C.muted;
                }
              }}
            >
              <span
                style={{
                  fontFamily: "Material Symbols Outlined",
                  fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                  fontSize: "20px",
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </span>
              <span style={{ fontWeight: active ? 600 : 400 }}>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    marginLeft: "auto",
                    backgroundColor: "#7f2927",
                    color: "#ff9993",
                    borderRadius: "9999px",
                    padding: "0 6px",
                    fontSize: "8px",
                    fontWeight: 700,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(72,72,72,0.15)", paddingTop: "8px", paddingBottom: "16px" }}>
        <a
          href="#"
          style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 24px", color: C.muted, textDecoration: "none", transition: "all 0.15s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#0e0e0e"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = C.muted; }}
        >
          <span style={{ fontFamily: "Material Symbols Outlined", fontSize: "20px" }}>help</span>
          <span>Help</span>
        </a>
        <button
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 24px",
            color: C.muted,
            background: "none",
            border: "none",
            cursor: "pointer",
            width: "100%",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#0e0e0e"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = C.muted; }}
        >
          <span style={{ fontFamily: "Material Symbols Outlined", fontSize: "20px" }}>logout</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
